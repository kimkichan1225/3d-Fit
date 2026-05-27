import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// 문과 상호작용 가능한 거리 (Portfolio와 동일)
const INTERACT_DISTANCE = 7;

const _charPos = new THREE.Vector3();

// 캐릭터와 현재 레벨의 문들 사이 거리를 매 프레임 체크해서, 가장 가까운 문이
// 상호작용 범위 안에 들어오면 onNearDoorChange로 알린다. (Canvas 안에서 사용)
export function DoorInteraction({ characterRef, doors, doorConfig, onNearDoorChange }) {
  const currentNameRef = useRef(null);

  useFrame(() => {
    if (!characterRef.current) return;
    characterRef.current.getWorldPosition(_charPos);

    let nearest = null;
    let nearestDist = INTERACT_DISTANCE;
    for (const name of Object.keys(doorConfig)) {
      const pos = doors[name];
      if (!pos) continue;
      const d = _charPos.distanceTo(pos);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = { name, ...doorConfig[name] };
      }
    }

    // 가까운 문이 바뀐 경우에만 부모에 알림
    const nextName = nearest ? nearest.name : null;
    if (currentNameRef.current !== nextName) {
      currentNameRef.current = nextName;
      onNearDoorChange(nearest);
    }
  });

  return null;
}
