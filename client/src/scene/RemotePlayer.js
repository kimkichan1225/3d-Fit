import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { NameTag } from './NameTag';
import { applyCharacterColors } from './applyCharacterColors';

const CHARACTER_URL = '/resources/GameView/BaseCharacter.gltf';

// LocalCharacter의 송신 간격(80ms) + jitter 여유. 패킷이 늦게 와도 점프 없이 이어진다.
const INTERP_DURATION_MS = 120;

const _yAxis = new THREE.Vector3(0, 1, 0);

// 다른 플레이어. 서버에서 받은 스냅샷을 시간 기반으로 보간 렌더링.
export function RemotePlayer({ player }) {
  const { scene, animations } = useGLTF(CHARACTER_URL);
  const cloned = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const groupRef = useRef();
  const characterRef = useRef();
  const { actions } = useAnimations(animations, characterRef);
  const [currentAnimation, setCurrentAnimation] = useState('Idle');

  // 보간을 위한 두 스냅샷 (from → to)
  const fromPos = useRef(new THREE.Vector3(player.x ?? 0, player.y ?? 0, player.z ?? 0));
  const toPos = useRef(new THREE.Vector3(player.x ?? 0, player.y ?? 0, player.z ?? 0));
  const fromQuat = useRef(new THREE.Quaternion().setFromAxisAngle(_yAxis, player.ry ?? 0));
  const toQuat = useRef(new THREE.Quaternion().setFromAxisAngle(_yAxis, player.ry ?? 0));
  const interpStartRef = useRef(performance.now());

  const bubbleTimer = useRef(null);
  const [bubbleText, setBubbleText] = useState('');

  // 피부색/얼굴색 적용 (머티리얼 복제 후 색 설정)
  useEffect(() => {
    applyCharacterColors(cloned, { skinColor: player.skinColor, faceColor: player.faceColor });
  }, [cloned, player.skinColor, player.faceColor]);

  // 그림자 한 번만 활성화
  useEffect(() => {
    cloned.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    if (groupRef.current) {
      groupRef.current.position.set(player.x ?? 0, player.y ?? 0, player.z ?? 0);
      groupRef.current.quaternion.setFromAxisAngle(_yAxis, player.ry ?? 0);
    }
    // 의도적으로 마운트 시에만 1회. player 좌표는 아래의 스냅샷 useEffect에서 처리.
  }, []);

  // 새 스냅샷 도착 시 from = 현재 렌더 위치, to = 새 목표 위치, 타이머 리셋
  useEffect(() => {
    if (!groupRef.current) return;
    fromPos.current.copy(groupRef.current.position);
    fromQuat.current.copy(groupRef.current.quaternion);
    toPos.current.set(player.x ?? 0, player.y ?? 0, player.z ?? 0);
    toQuat.current.setFromAxisAngle(_yAxis, player.ry ?? 0);
    interpStartRef.current = performance.now();
  }, [player.x, player.y, player.z, player.ry]);

  // 마운트 시 Idle 한 번 재생 (T-pose 방지)
  useEffect(() => {
    const idle = actions['Idle'];
    if (idle) idle.reset().fadeIn(0.2).play();
  }, [actions]);

  useEffect(() => {
    const next = player.anim || 'Idle';
    if (next === currentAnimation) return;
    const oldAction = actions[currentAnimation];
    const newAction = actions[next];
    if (oldAction) oldAction.fadeOut(0.3);
    if (newAction) newAction.reset().fadeIn(0.3).play();
    setCurrentAnimation(next);
  }, [player.anim, actions, currentAnimation]);

  // 채팅 말풍선 — 새 메시지가 도착하면 4초간 표시
  useEffect(() => {
    if (!player.lastMessage) return;
    setBubbleText(player.lastMessage.text);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubbleText(''), 4000);
    return () => bubbleTimer.current && clearTimeout(bubbleTimer.current);
  }, [player.lastMessage]);

  useFrame(() => {
    if (!groupRef.current) return;
    const elapsed = performance.now() - interpStartRef.current;
    const t = Math.min(1, elapsed / INTERP_DURATION_MS);
    groupRef.current.position.lerpVectors(fromPos.current, toPos.current, t);
    groupRef.current.quaternion.slerpQuaternions(fromQuat.current, toQuat.current, t);
  });

  return (
    <group ref={groupRef}>
      <primitive ref={characterRef} object={cloned} scale={2} castShadow receiveShadow />
      <NameTag nickname={player.nickname} color={player.color} message={bubbleText} />
    </group>
  );
}
