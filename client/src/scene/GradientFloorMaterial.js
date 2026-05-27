import * as THREE from 'three';
import { shaderMaterial } from '@react-three/drei';
import { extend } from '@react-three/fiber';

// 화면 좌표 기반 대각 그라데이션 셰이더 (그림자 매핑 지원). Portfolio-main에서 이식.
export const GradientFloorMaterial = shaderMaterial(
  {
    uColorStart: new THREE.Color('#90EE90'),
    uColorEnd: new THREE.Color('#E0FFE0'),
  },
  `
  #include <common>
  #include <shadowmap_pars_vertex>

  varying vec4 vScreenPosition;
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    vScreenPosition = gl_Position;

    #include <shadowmap_vertex>
  }
  `,
  `
  #include <common>
  #include <packing>
  #include <lights_pars_begin>
  #include <shadowmap_pars_fragment>

  uniform vec3 uColorStart;
  uniform vec3 uColorEnd;
  varying vec4 vScreenPosition;
  varying vec3 vWorldPosition;

  void main() {
    vec2 screenUV = (vScreenPosition.xy / vScreenPosition.w) * 0.5 + 0.5;
    float gradient = (screenUV.x + (1.0 - screenUV.y)) * 0.5;
    vec3 baseColor = mix(uColorStart, uColorEnd, gradient);

    float shadow = getShadow(
      directionalShadowMap[0],
      directionalLightShadow.shadowMapSize,
      directionalLightShadow.shadowBias,
      directionalLightShadow.shadowRadius,
      vDirectionalShadowCoord[0]
    );

    vec3 finalColor = baseColor * (0.3 + 0.7 * shadow);
    gl_FragColor = vec4(finalColor, 1.0);
  }
  `
);

extend({ GradientFloorMaterial });
