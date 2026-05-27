import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

// Portfolio-main의 카메라 컨트롤러 이식. 캐릭터를 고정 오프셋에서 부드럽게 추적.
const CAMERA_OFFSET = new THREE.Vector3(-0.0, 28.35, 19.76);

export function CameraController({ characterRef }) {
  const { camera } = useThree();
  const targetPositionRef = useRef(new THREE.Vector3());
  const initializedRef = useRef(false);

  useEffect(() => {
    // 캐릭터가 등장하면 카메라를 한 번 즉시 스냅
    let raf;
    const tick = () => {
      if (characterRef.current) {
        const pos = new THREE.Vector3();
        characterRef.current.getWorldPosition(pos);
        targetPositionRef.current.copy(pos);
        camera.position.copy(pos.clone().add(CAMERA_OFFSET));
        camera.lookAt(pos);
        initializedRef.current = true;
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => raf && cancelAnimationFrame(raf);
  }, [camera, characterRef]);

  useFrame((_, delta) => {
    if (!characterRef.current) return;

    const worldPosition = new THREE.Vector3();
    characterRef.current.getWorldPosition(worldPosition);

    targetPositionRef.current.lerp(worldPosition, delta * 12.0);
    const targetCameraPosition = targetPositionRef.current.clone().add(CAMERA_OFFSET);
    camera.position.lerp(targetCameraPosition, delta * 2.0);
    camera.lookAt(targetPositionRef.current);
  });

  return null;
}
