import * as THREE from 'three'

/*
 * Stadium floodlights without real lights. Real lights would change the scene's light count and
 * recompile every shader on the page; instead the stadium's own materials add a cheap diffuse
 * term from each lamp, driven by shared uniforms (lamp positions and on-levels).
 */

export function createFloodUniforms(count) {
  return {
    count,
    uLampPosition: { value: Array.from({ length: count }, () => new THREE.Vector3()) },
    uLampLevel: { value: new Array(count).fill(0) },
    uLampColor: { value: new THREE.Color(1, 0.95, 0.86) },
    uLampPower: { value: 1 },
    uLampFalloff: { value: 0.0001 },
  }
}

export function makeFloodlit(material, flood) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uLampPosition: flood.uLampPosition,
      uLampLevel: flood.uLampLevel,
      uLampColor: flood.uLampColor,
      uLampPower: flood.uLampPower,
      uLampFalloff: flood.uLampFalloff,
    })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFloodPosition;')
      .replace(
        '#include <worldpos_vertex>',
        /* glsl */ `#include <worldpos_vertex>
vec4 floodPosition = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
floodPosition = instanceMatrix * floodPosition;
#endif
vFloodPosition = (modelMatrix * floodPosition).xyz;`,
      )
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
#define LAMP_COUNT ${flood.count}
varying vec3 vFloodPosition;
uniform vec3 uLampPosition[LAMP_COUNT];
uniform float uLampLevel[LAMP_COUNT];
uniform vec3 uLampColor;
uniform float uLampPower;
uniform float uLampFalloff;`,
      )
      .replace(
        '#include <lights_fragment_end>',
        /* glsl */ `#include <lights_fragment_end>
{
  vec3 floodNormal = normalize((vec4(normal, 0.0) * viewMatrix).xyz); // view → world
  float flood = 0.0;
  for (int i = 0; i < LAMP_COUNT; i++) {
    vec3 toLamp = uLampPosition[i] - vFloodPosition;
    float d2 = dot(toLamp, toLamp);
    float facing = max(dot(floodNormal, toLamp * inversesqrt(d2)), 0.0);
    flood += uLampLevel[i] * (0.25 + 0.75 * facing) / (1.0 + d2 * uLampFalloff);
  }
  reflectedLight.directDiffuse += diffuseColor.rgb * uLampColor * uLampPower * flood;
}`,
      )
  }
  material.customProgramCacheKey = () => `floodlit-${flood.count}`
  return material
}
