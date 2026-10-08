import * as THREE from 'three'
import { INK } from './story.js'

/**
 * The page's one shadow-casting key light, plus environment, fog, background and lens.
 *
 * Shared by every chapter so the scene's light count never changes: adding or removing a light
 * would recompile every shader on the page mid-scroll. Whichever chapter owns the frame sets it.
 */
export function createRig(stage, { shadows }) {
  const { scene, renderer, camera } = stage

  const key = new THREE.DirectionalLight(0xffffff, 0)
  key.castShadow = shadows
  if (shadows) {
    key.shadow.mapSize.set(2048, 2048)
    key.shadow.bias = -0.0002
  }
  scene.add(key, key.target)

  scene.fog = new THREE.Fog(INK, 1e4, 2e4)
  const background = new THREE.Color()
  let backgroundHex = null

  return {
    key,

    /**
     * Aim the key light at `target` from `direction`. `extent` is the half-size of the shadow
     * frustum: keep it tight around what matters for crisp shadows.
     */
    light({ target, direction, intensity, extent, distance, color = 0xfff2e2, softness = 3 }) {
      key.color.setHex(color)
      key.intensity = intensity
      key.target.position.copy(target)
      key.position.copy(target).addScaledVector(direction, distance)
      if (!shadows) return

      key.shadow.radius = softness
      key.shadow.normalBias = extent * 0.0025 // about two shadow-map texels, whatever the frustum size
      const shadowCamera = key.shadow.camera
      if (shadowCamera.top !== extent || shadowCamera.far !== distance * 2) {
        shadowCamera.left = shadowCamera.bottom = -extent
        shadowCamera.right = shadowCamera.top = extent
        shadowCamera.near = distance * 0.02
        shadowCamera.far = distance * 2
        shadowCamera.updateProjectionMatrix()
      }
    },

    environment(intensity, yaw = 0) {
      scene.environmentIntensity = intensity
      scene.environmentRotation.y = yaw
    },

    fog(near, far) {
      scene.fog.near = near
      scene.fog.far = far
    },

    background(hex) {
      if (hex === backgroundHex) return
      backgroundHex = hex
      background.setHex(hex)
      renderer.setClearColor(background)
      scene.fog.color.copy(background)
    },

    lens(fov, near, far) {
      if (camera.fov === fov && camera.near === near && camera.far === far) return
      camera.fov = fov
      camera.near = near
      camera.far = far
      camera.updateProjectionMatrix()
    },
  }
}
