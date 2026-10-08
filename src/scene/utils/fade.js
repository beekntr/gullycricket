import * as THREE from 'three'

/*
 * Dissolve a whole world into the page background without touching its lights, so a chapter can
 * fade out around the ball while the ball itself stays lit. One shared uniform drives every
 * material it's applied to.
 */

export function createFade(hex) {
  const color = new THREE.Color(hex) // stored linear; the shader mixes after output encoding
  const srgb = color.clone().convertLinearToSRGB()
  return {
    uFade: { value: 1 },
    uFadeColor: { value: new THREE.Vector3(srgb.r, srgb.g, srgb.b) },
  }
}

export function makeFadeable(material, fade) {
  const previous = material.onBeforeCompile
  const previousKey = material.customProgramCacheKey()
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer)
    shader.uniforms.uFade = fade.uFade
    shader.uniforms.uFadeColor = fade.uFadeColor
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uFade;\nuniform vec3 uFadeColor;')
      .replace(
        '#include <dithering_fragment>',
        '#include <dithering_fragment>\ngl_FragColor.rgb = mix(uFadeColor, gl_FragColor.rgb, uFade);',
      )
  }
  // previousKey was captured up front: the default key is derived from onBeforeCompile itself.
  material.customProgramCacheKey = () => `${previousKey}|fade`
  return material
}
