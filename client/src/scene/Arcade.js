import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';

// 게임기와 상호작용 가능한 거리
const INTERACT_DISTANCE = 6;
const _charPos = new THREE.Vector3();
const _arcadePos = new THREE.Vector3();

// 레벨별 게임기 배치. position은 바닥에 놓이는 게임기 발치 좌표.
export const LEVEL_ARCADES = {
  2: [
    { id: 'tetris', title: '테트리스', position: [-35, 0.23, 5] },
    { id: 'omok', title: '오목', position: [-15, 0.23, 5] },
  ],
};

// 게임기 3D 오브젝트들을 렌더하고, 캐릭터가 가까워지면 onNearChange로 알린다.
export function Arcades({ characterRef, arcades, onNearChange }) {
  const nearIdRef = useRef(null);

  useFrame(() => {
    if (!characterRef.current || !arcades.length) return;
    characterRef.current.getWorldPosition(_charPos);

    let nearest = null;
    let nearestDist = INTERACT_DISTANCE;
    for (const a of arcades) {
      _arcadePos.set(a.position[0], a.position[1], a.position[2]);
      const d = _charPos.distanceTo(_arcadePos);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = a;
      }
    }

    const nextId = nearest ? nearest.id : null;
    if (nearIdRef.current !== nextId) {
      nearIdRef.current = nextId;
      onNearChange(nearest);
    }
  });

  return (
    <>
      {arcades.map((a) => (
        <group key={a.id} position={a.position}>
          {/* 본체 (바닥에서 위로 세움) */}
          <mesh position={[0, 2.0, 0]} castShadow receiveShadow>
            <boxGeometry args={[3, 4, 2.4]} />
            <meshStandardMaterial color="#3b3f6b" emissive="#5b8def" emissiveIntensity={0.45} />
          </mesh>
          {/* 화면 부분 */}
          <mesh position={[0, 2.7, 1.21]}>
            <planeGeometry args={[2.2, 1.7]} />
            <meshStandardMaterial color="#0b0d22" emissive="#22d3ee" emissiveIntensity={0.6} />
          </mesh>
          <Billboard position={[0, 5.0, 0]}>
            <Text
              fontSize={1.1}
              color="#fff"
              anchorX="center"
              anchorY="middle"
              outlineWidth={0.07}
              outlineColor="#1a1a2e"
            >
              {a.title}
            </Text>
          </Billboard>
        </group>
      ))}
    </>
  );
}
