import * as THREE from 'three'
import { disposeObject } from '../utils/dispose.js'
import { nextIdle } from '../utils/timing.js'
import { createScreens, SCREEN_ORDER } from './screens.js'

/*
 * A generic flagship phone, built in code: titanium frame, frosted glass back, camera plateau,
 * and a display that can wipe between app screens, power on, and ripple where something lands.
 * Dimensions are in world units (≈ 1 unit per 23 mm, matching the ball's scale on the phone shots).
 */

export const PHONE = { width: 3.1, height: 6.4, depth: 0.33, corner: 0.5 }

function roundedRect(width, height, radius) {
  const shape = new THREE.Shape()
  const x = -width / 2
  const y = -height / 2
  shape.moveTo(x + radius, y)
  shape.lineTo(x + width - radius, y)
  shape.absarc(x + width - radius, y + radius, radius, -Math.PI / 2, 0)
  shape.lineTo(x + width, y + height - radius)
  shape.absarc(x + width - radius, y + height - radius, radius, 0, Math.PI / 2)
  shape.lineTo(x + radius, y + height)
  shape.absarc(x + radius, y + height - radius, radius, Math.PI / 2, Math.PI)
  shape.lineTo(x, y + radius)
  shape.absarc(x + radius, y + radius, radius, Math.PI, Math.PI * 1.5)
  return shape
}

/** A flat rounded rectangle with 0–1 UVs across it (ShapeGeometry's own UVs are in shape units). */
function panelGeometry(width, height, radius) {
  const geometry = new THREE.ShapeGeometry(roundedRect(width, height, radius), 24)
  const { position, uv } = geometry.attributes
  for (let i = 0; i < position.count; i++) {
    uv.setXY(i, position.getX(i) / width + 0.5, position.getY(i) / height + 0.5)
  }
  return geometry
}

function createScreenMaterial(textures, aspect) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMapA: { value: textures.home },
      uMapB: { value: textures.home },
      uMix: { value: 0 },
      uOn: { value: 0 },
      uRipple: { value: 0 },
      uAspect: { value: aspect },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMapA;
      uniform sampler2D uMapB;
      uniform float uMix;
      uniform float uOn;
      uniform float uRipple;
      uniform float uAspect;
      varying vec2 vUv;

      void main() {
        // A single ring spreading from the centre, where the ball lands.
        vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
        float r = length(p);
        float ring = exp(-pow((r - uRipple * 0.75) * 18.0, 2.0)) * (1.0 - uRipple) * step(0.0001, uRipple);
        vec2 uv = vUv - (r > 0.0001 ? p / r : vec2(0.0)) * ring * 0.012 / vec2(uAspect, 1.0);

        // Wipe top-to-bottom from screen A to screen B.
        float w = uMix * 1.1 - 0.05;
        float m = 1.0 - smoothstep(w - 0.05, w, 1.0 - vUv.y);
        vec3 color = mix(texture2D(uMapA, uv).rgb, texture2D(uMapB, uv).rgb, m);
        color += ring * 0.06;

        gl_FragColor = vec4(mix(vec3(0.004), color, uOn), 1.0);
        #include <colorspace_fragment>
      }`,
    toneMapped: false, // UI colours stay exactly as designed
  })
}

export async function createDevice({ renderer, quality }) {
  const { width, height, depth, corner } = PHONE
  const object = new THREE.Group()
  object.name = 'phone'

  const titanium = new THREE.MeshPhysicalMaterial({ color: 0xb4afa5, metalness: 1, roughness: 0.3, fog: false })
  const backGlass = new THREE.MeshPhysicalMaterial({
    color: 0xcdc8bd,
    roughness: 0.55,
    clearcoat: 0.35,
    clearcoatRoughness: 0.45,
    fog: false,
  })
  const blackGlass = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.15, clearcoat: 1, fog: false })

  // Body: extruded with a rounded bevel. Group 0 = front/back caps, group 1 = the frame.
  const bevel = 0.07
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedRect(width - bevel * 2, height - bevel * 2, corner - bevel), {
      depth: depth - bevel * 2,
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 6,
      curveSegments: 20,
    }).translate(0, 0, -(depth - bevel * 2) / 2),
    [backGlass, titanium],
  )
  body.castShadow = true
  body.receiveShadow = true

  // Front: black bezel glass, the display, and an additive glass layer that adds only reflections.
  const front = depth / 2
  const bezel = new THREE.Mesh(panelGeometry(width - 0.06, height - 0.06, corner - 0.03), blackGlass)
  bezel.position.z = front + 0.004

  await nextIdle()
  const textures = await createScreens(renderer, { width: quality.shaderDetail ? 900 : 600 })
  const displayWidth = width - 0.24
  const displayHeight = height - 0.24
  const screenMaterial = createScreenMaterial(textures, displayWidth / displayHeight)
  const display = new THREE.Mesh(panelGeometry(displayWidth, displayHeight, corner - 0.11), screenMaterial)
  display.position.z = front + 0.008

  const glass = new THREE.Mesh(
    panelGeometry(width - 0.06, height - 0.06, corner - 0.03),
    new THREE.MeshPhysicalMaterial({
      color: 0x000000,
      roughness: 0.05,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  )
  glass.position.z = front + 0.012

  // Camera plateau and lenses on the back.
  const plateau = new THREE.Mesh(
    new THREE.ExtrudeGeometry(roundedRect(1.32, 1.32, 0.36), {
      depth: 0.04,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 3,
      curveSegments: 16,
    }),
    new THREE.MeshPhysicalMaterial({ color: 0xc4bfb4, roughness: 0.25, clearcoat: 1, fog: false }),
  )
  plateau.position.set(-width / 2 + 0.82, height / 2 - 0.82, -front - 0.06)

  const ringGeometry = new THREE.CylinderGeometry(0.27, 0.27, 0.1, 40).rotateX(Math.PI / 2)
  const lensGeometry = new THREE.CylinderGeometry(0.2, 0.2, 0.11, 40).rotateX(Math.PI / 2)
  for (const [x, y] of [
    [-0.28, 0.28],
    [-0.28, -0.28],
    [0.3, 0],
  ]) {
    const ring = new THREE.Mesh(ringGeometry, titanium)
    const lens = new THREE.Mesh(lensGeometry, blackGlass)
    ring.position.set(plateau.position.x + x, plateau.position.y + y, -front - 0.1)
    lens.position.copy(ring.position)
    object.add(ring, lens)
  }

  // Side buttons.
  const buttonGeometry = new THREE.BoxGeometry(0.05, 1, 0.12)
  for (const [x, y, length] of [
    [-1, 2.15, 0.3],
    [-1, 1.5, 0.55],
    [-1, 0.85, 0.55],
    [1, 1.2, 0.85],
  ]) {
    const button = new THREE.Mesh(buttonGeometry, titanium)
    button.scale.y = length
    button.position.set(x * (width / 2 + 0.015), y, 0)
    object.add(button)
  }

  object.add(body, bezel, display, glass, plateau)

  const uniforms = screenMaterial.uniforms
  const screenPoint = new THREE.Vector3()
  const screenNormal = new THREE.Vector3()

  return {
    object,
    screen: {
      /** `position` indexes SCREEN_ORDER continuously: 1.5 is halfway through the wipe from team to live. */
      show(position) {
        const last = SCREEN_ORDER.length - 1
        const a = Math.min(Math.floor(position), last)
        uniforms.uMapA.value = textures[SCREEN_ORDER[a]]
        uniforms.uMapB.value = textures[SCREEN_ORDER[Math.min(a + 1, last)]]
        uniforms.uMix.value = position - a
      },
      power(level) {
        uniforms.uOn.value = level
      },
      ripple(progress) {
        uniforms.uRipple.value = progress
      },
      /** World-space centre of the display and its facing direction. */
      center(outPoint = screenPoint, outNormal = screenNormal) {
        object.updateMatrixWorld()
        outPoint.set(0, 0, front + 0.012).applyMatrix4(object.matrixWorld)
        outNormal.set(0, 0, 1).transformDirection(object.matrixWorld)
        return { point: outPoint, normal: outNormal }
      },
    },
    dispose() {
      object.removeFromParent()
      disposeObject(object)
      for (const texture of Object.values(textures)) texture.dispose()
    },
  }
}
