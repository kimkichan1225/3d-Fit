import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';

// 게임기와 상호작용 가능한 거리
const INTERACT_DISTANCE = 6;
const _charPos = new THREE.Vector3();
const _arcadePos = new THREE.Vector3();

// 레벨별 게임기 배치. position은 게임기(박스) 중심 좌표.
export const LEVEL_ARCADES = {
  2: [{ id: 'tetris', title: '테트리스', position: [4, 1.1, 0] }],
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
          <mesh castShadow receiveShadow>
            <boxGeometry args={[1.5, 2.2, 1.2]} />
            <meshStandardMaterial color="#3b3f6b" emissive="#5b8def" emissiveIntensity={0.45} />
          </mesh>
          {/* 화면 부분 */}
          <mesh position={[0, 0.4, 0.62]}>
            <planeGeometry args={[1.1, 0.9]} />
            <meshStandardMaterial color="#0b0d22" emissive="#22d3ee" emissiveIntensity={0.6} />
          </mesh>
          <Text position={[0, 1.5, 0]} fontSize={0.32} color="#fff" anchorX="center" anchorY="middle">
            {a.title}
          </Text>
        </group>
      ))}
    </>
  );
}
