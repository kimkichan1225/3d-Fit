import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import { RigidBody } from '@react-three/rapier';

// 레벨별 맵 파일 경로
export const LEVEL_MAPS = {
  1: '/resources/GameView/Level1Map.glb',
  2: '/resources/GameView/Level2Map.glb',
  3: '/resources/GameView/Level3Map.glb',
  4: '/resources/GameView/Level4Map.glb',
};

// 범용 맵 컴포넌트. GLB를 로드하고 'door'로 시작하는 노드의 월드 좌표를 추출해
// onDoorsFound로 전달한다. (문 위치가 맵 파일 안에 노드로 들어 있음)
export function GameMap({ url, onDoorsFound, ...props }) {
  const { scene } = useGLTF(url);

  const { cloned, doors } = useMemo(() => {
    const c = scene.clone();
    c.updateMatrixWorld(true); // getWorldPosition이 정확하도록 월드 행렬 갱신
    const found = {};
    c.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
      // door, door001, door002 등 문 노드의 월드 좌표 수집
      if (child.name && child.name.startsWith('door')) {
        const wp = new THREE.Vector3();
        child.getWorldPosition(wp);
        found[child.name] = wp;
      }
    });
    return { cloned: c, doors: found };
  }, [scene]);

  useEffect(() => {
    if (onDoorsFound) onDoorsFound(doors);
  }, [doors, onDoorsFound]);

  return (
    <RigidBody type="fixed" colliders="trimesh">
      <primitive object={cloned} {...props} />
    </RigidBody>
  );
}

// 모든 레벨 맵 미리 로드
Object.values(LEVEL_MAPS).forEach((url) => useGLTF.preload(url));
