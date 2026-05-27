import { Suspense, useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, useAnimations } from '@react-three/drei';
import { SkeletonUtils } from 'three-stdlib';
import { CHARACTERS, resolveCharacter } from '../scene/characters';
import { applyCharacterColors } from '../scene/applyCharacterColors';

// 선택한 캐릭터/색을 적용해 천천히 회전하며 보여주는 모델
function PreviewModel({ character, colors }) {
  const url = CHARACTERS[resolveCharacter(character)].url;
  const { scene, animations } = useGLTF(url);
  const cloned = useMemo(() => SkeletonUtils.clone(scene), [scene]);
  const groupRef = useRef();
  const innerRef = useRef();
  const { actions } = useAnimations(animations, innerRef);

  useEffect(() => {
    applyCharacterColors(cloned, colors);
  }, [cloned, colors]);

  // 마운트 시 Idle 재생 (T-pose 방지)
  useEffect(() => {
    const idle = actions['Idle'];
    if (idle) idle.reset().fadeIn(0.2).play();
  }, [actions]);

  // 천천히 턴테이블 회전
  useFrame((_, delta) => {
    if (groupRef.current) groupRef.current.rotation.y += delta * 0.6;
  });

  return (
    <group ref={groupRef} position={[0, -0.85, 0]}>
      <primitive ref={innerRef} object={cloned} scale={0.7} />
    </group>
  );
}

// 입장 화면 좌측 캐릭터 미리보기 캔버스
export function CharacterPreview({ character, colors }) {
  return (
    <Canvas camera={{ position: [0, 0.3, 6.5], fov: 35 }} style={{ width: '100%', height: '100%' }}>
      <ambientLight intensity={0.9} />
      <directionalLight position={[3, 6, 4]} intensity={1.3} />
      <directionalLight position={[-3, 2, -2]} intensity={0.4} />
      <Suspense fallback={null}>
        {/* 캐릭터를 바꾸면 모델을 새로 로드하도록 key 지정 */}
        <PreviewModel key={character} character={character} colors={colors} />
      </Suspense>
    </Canvas>
  );
}
