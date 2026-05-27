import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import { SkeletonUtils } from 'three-stdlib';
import { useKeyboardControls } from '../hooks/useKeyboardControls';
import { NameTag } from './NameTag';
import { applyCharacterColors } from './applyCharacterColors';

const CHARACTER_URL = '/resources/GameView/BaseCharacter.gltf';
const WALK_SPEED = 8;
const RUN_SPEED = 18;
const NET_INTERVAL_MS = 80; // 12.5Hz 송신

// useFrame 안에서 매 프레임 새 객체를 만들지 않도록 모듈 스코프에 재사용 객체를 둔다.
const _direction = new THREE.Vector3();
const _targetQuat = new THREE.Quaternion();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

// 본인 캐릭터. 키 입력으로 RigidBody를 움직이고, 모델은 RigidBody의 자식으로 두어
// Rapier의 내장 보간(interpolate)으로 부드러운 위치 동기화를 받는다.
export function LocalCharacter({ characterRef, spawnPosition, onNetUpdate, nickname, color, skinColor, faceColor }) {
  const { scene, animations } = useGLTF(CHARACTER_URL);
  const cloned = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const { actions } = useAnimations(animations, characterRef);

  // 피부색/얼굴색 적용 (머티리얼 복제 후 색 설정)
  useEffect(() => {
    applyCharacterColors(cloned, { skinColor, faceColor });
  }, [cloned, skinColor, faceColor]);

  const { forward, backward, left, right, shift } = useKeyboardControls();
  const [currentAnimation, setCurrentAnimation] = useState('Idle');

  const rigidBodyRef = useRef();
  const modelGroupRef = useRef();
  const currentRotationRef = useRef(new THREE.Quaternion());

  const stepAudioRef = useRef(null);
  const lastStepTimeRef = useRef(0);
  const stepIntervalRef = useRef(0.6);
  const lastNetSentRef = useRef(0);
  // 정지/Idle 상태로 한 번 보낸 뒤에는 같은 정지 상태를 더 보내지 않기 위한 플래그
  const sentIdleRef = useRef(false);
  const lastSentPosRef = useRef({ x: NaN, y: NaN, z: NaN, ry: NaN });

  useEffect(() => {
    stepAudioRef.current = new Audio('/resources/Sounds/Step2.wav');
    stepAudioRef.current.volume = 0.7;
    stepAudioRef.current.preload = 'auto';
  }, []);

  useEffect(() => {
    if (characterRef.current) {
      characterRef.current.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
    }
    // 카메라가 캐릭터를 추적할 수 있도록 modelGroupRef를 외부에 노출
    if (modelGroupRef.current) {
      characterRef.current = modelGroupRef.current;
    }
  }, [characterRef]);

  // 마운트 시 Idle 한 번 재생 (T-pose 방지)
  useEffect(() => {
    const idle = actions['Idle'];
    if (idle) idle.reset().fadeIn(0.2).play();
  }, [actions]);

  // 디버그: P 키 누르면 현재 캐릭터 월드 좌표를 콘솔에 출력
  useEffect(() => {
    const onKey = (e) => {
      if (e.key.toLowerCase() !== 'p') return;
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (!rigidBodyRef.current) return;
      const t = rigidBodyRef.current.translation();
      console.log(`[spawn-pos] [${t.x.toFixed(2)}, ${t.y.toFixed(2)}, ${t.z.toFixed(2)}]`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let next = 'Idle';
    if (forward || backward || left || right) next = shift ? 'Run' : 'Walk';

    if (currentAnimation !== next) {
      const oldAction = actions[currentAnimation];
      const newAction = actions[next];
      if (oldAction) oldAction.fadeOut(0.3);
      if (newAction) newAction.reset().fadeIn(0.3).play();
      setCurrentAnimation(next);

      if (next === 'Walk' || next === 'Run') {
        lastStepTimeRef.current = Date.now();
        stepIntervalRef.current = next === 'Run' ? 0.45 : 0.6;
      }
    }
  }, [forward, backward, left, right, shift, actions, currentAnimation]);

  const playStep = () => {
    if (!stepAudioRef.current) return;
    stepAudioRef.current.currentTime = 0;
    stepAudioRef.current.play().catch(() => {});
  };

  useFrame(() => {
    if (!rigidBodyRef.current || !modelGroupRef.current) return;

    const speed = shift ? RUN_SPEED : WALK_SPEED;
    _direction.set(0, 0, 0);
    if (forward) _direction.z -= 1;
    if (backward) _direction.z += 1;
    if (left) _direction.x -= 1;
    if (right) _direction.x += 1;

    const moving = _direction.lengthSq() > 0;
    const currentY = rigidBodyRef.current.linvel().y;

    if (moving) {
      _direction.normalize();

      const targetAngle = Math.atan2(_direction.x, _direction.z);
      _targetQuat.setFromAxisAngle(_yAxis, targetAngle);
      currentRotationRef.current.slerp(_targetQuat, 0.25);

      rigidBodyRef.current.setLinvel({
        x: _direction.x * speed,
        y: currentY,
        z: _direction.z * speed,
      });

      if (currentAnimation === 'Walk' || currentAnimation === 'Run') {
        const now = Date.now();
        if (now - lastStepTimeRef.current > stepIntervalRef.current * 1000) {
          playStep();
          lastStepTimeRef.current = now;
        }
      }
    } else {
      rigidBodyRef.current.setLinvel({ x: 0, y: currentY, z: 0 });
    }

    // 모델의 회전만 직접 적용 (위치는 RigidBody가 자식 group에 자동으로 보간 적용)
    modelGroupRef.current.quaternion.copy(currentRotationRef.current);

    // ── 네트워크 송신 ──
    if (!onNetUpdate) return;
    const now = Date.now();
    if (now - lastNetSentRef.current < NET_INTERVAL_MS) return;

    const rb = rigidBodyRef.current.translation();
    _euler.setFromQuaternion(currentRotationRef.current);
    const ry = _euler.y;

    // 정지(Idle) 상태이면, 정지 전환 직후 1회만 전송하고 그 뒤로는 같은 상태를 반복 전송하지 않는다.
    const isIdle = currentAnimation === 'Idle';
    if (isIdle) {
      if (sentIdleRef.current) return; // 이미 정지 상태를 알린 후엔 송신 생략
      sentIdleRef.current = true;
    } else {
      sentIdleRef.current = false;
    }

    // 추가 안전장치: 같은 위치/회전을 다시 보내지 않는다 (소수점 변화 0.001 이하 무시)
    const last = lastSentPosRef.current;
    const same =
      Math.abs(rb.x - last.x) < 0.001 &&
      Math.abs(rb.y - last.y) < 0.001 &&
      Math.abs(rb.z - last.z) < 0.001 &&
      Math.abs(ry - last.ry) < 0.001;
    if (same && isIdle) return;

    lastNetSentRef.current = now;
    last.x = rb.x;
    last.y = rb.y;
    last.z = rb.z;
    last.ry = ry;
    onNetUpdate({ x: rb.x, y: rb.y, z: rb.z, ry, anim: currentAnimation });
  });

  return (
    <RigidBody
      ref={rigidBodyRef}
      type="dynamic"
      colliders={false}
      mass={1}
      linearDamping={2.0}
      angularDamping={1.0}
      enabledRotations={[false, false, false]}
      position={spawnPosition}
      lockRotations
      canSleep={false}
    >
      <CapsuleCollider args={[2, 1.3]} position={[0, 3.2, 0]} />
      <group ref={modelGroupRef}>
        <primitive ref={characterRef} object={cloned} scale={2} castShadow receiveShadow />
        {nickname && <NameTag nickname={nickname} color={color} isSelf />}
      </group>
    </RigidBody>
  );
}

useGLTF.preload(CHARACTER_URL);
