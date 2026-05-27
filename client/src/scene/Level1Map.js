import { useMemo, useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import { RigidBody } from '@react-three/rapier';

const MAP_URL = '/resources/GameView/Level1Map.glb';

export function Level1Map(props) {
  const { scene } = useGLTF(MAP_URL);

  const cloned = useMemo(() => {
    const c = scene.clone();
    c.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);

  useEffect(() => () => {}, []);

  return (
    <RigidBody type="fixed" colliders="trimesh">
      <primitive object={cloned} {...props} />
    </RigidBody>
  );
}

useGLTF.preload(MAP_URL);
