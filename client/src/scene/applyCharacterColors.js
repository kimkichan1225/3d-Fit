import * as THREE from 'three';

// 캐릭터 모델의 Skin/Face 머티리얼 색을 적용한다.
// SkeletonUtils.clone()은 머티리얼을 복제하지 않고 참조를 공유하므로,
// 색을 바꾸기 전에 머티리얼을 복제해서 다른 캐릭터 인스턴스에 색이 번지지 않게 한다.
export function applyCharacterColors(root, { skinColor, faceColor } = {}) {
  if (!root) return;

  const colorize = (mat) => {
    let target = null;
    if (mat.name === 'Skin' && skinColor) target = skinColor;
    else if (mat.name === 'Face' && faceColor) target = faceColor;
    if (!target) return mat;

    const cloned = mat.clone();
    cloned.color = new THREE.Color(target);
    return cloned;
  };

  root.traverse((child) => {
    if (!child.isMesh || !child.material) return;
    child.material = Array.isArray(child.material)
      ? child.material.map(colorize)
      : colorize(child.material);
  });
}
