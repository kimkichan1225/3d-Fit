import { useGLTF } from '@react-three/drei';

// 선택 가능한 캐릭터 모델
export const CHARACTERS = {
  male: { url: '/resources/GameView/Casual_Male.gltf', label: '남자' },
  female: { url: '/resources/GameView/Casual_Female.gltf', label: '여자' },
};
export const DEFAULT_CHARACTER = 'male';

// 색을 입힐 수 있는 머티리얼 부위 (key는 GLB 머티리얼 이름과 일치)
export const COLOR_PARTS = [
  { key: 'Skin', label: '피부' },
  { key: 'Hair', label: '머리' },
  { key: 'Face', label: '눈·눈썹' },
  { key: 'Shirt', label: '상의' },
  { key: 'Pants', label: '바지' },
  { key: 'Belt', label: '벨트' },
];

export const DEFAULT_COLORS = {
  Skin: '#e8a87c',
  Hair: '#3b2417',
  Face: '#3b2417',
  Shirt: '#5b8def',
  Pants: '#3b3f5c',
  Belt: '#5c3a21',
};

// 캐릭터 키가 유효하지 않으면 기본값
export const resolveCharacter = (key) => CHARACTERS[key] ? key : DEFAULT_CHARACTER;

// 모든 캐릭터 모델 미리 로드
Object.values(CHARACTERS).forEach((c) => useGLTF.preload(c.url));
