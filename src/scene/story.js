import * as THREE from 'three'

/*
 * The fixed points where one chapter hands the camera, ball and light to the next.
 * Each chapter's scene ends exactly on the pose the next one starts from, so the page reads as
 * one continuous shot even though every chapter owns its own scene.
 */

export const INK = 0x0b0b0a
export const CHALK = 0xf2efe8

const Y_AXIS = new THREE.Vector3(0, 1, 0)
const spin = new THREE.Quaternion()

// ---------------------------------------------------------------------------------------------
// Hero → Delivery: the close-up on the seam (ball at the origin, camera looking down -Z).

export const SEAM_CLOSE_UP = {
  // A roll about the view axis only, so the seam point facing the camera stays dead centre.
  pose: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.5)),
  drift: 0.025, // rad/s along the seam once framed, so the stitches keep moving
  point: new THREE.Vector3(0, 0, 1),
  lightDirection: new THREE.Vector3(0.3, 1, 0.28).normalize(),
  lightIntensity: 2.8,
  lightDistance: 6,
  environment: 0.32,
  environmentYaw: 1.1,
  fov: 30,
}

/** Camera-to-leather distance at full push. Portrait screens back off so the seam band still fits. */
export const closeUpDistance = (aspect) => 0.5 / Math.min(1, aspect)

export function closeUpOrientation(time, out) {
  spin.setFromAxisAngle(Y_AXIS, time * SEAM_CLOSE_UP.drift) // local Y is the seam axis
  return out.multiplyQuaternions(SEAM_CLOSE_UP.pose, spin)
}

// ---------------------------------------------------------------------------------------------
// Delivery → Phone → Features: the ball "caught" in front of the camera, then studio-lit.

export const CATCH_POINT = new THREE.Vector3(-8, -9, 250)
export const STORY_FOV = 22

/** Camera distance from the caught ball: phone-sized framing, pulled back on portrait screens. */
export const catchDistance = (aspect) => Math.max(24, 15 / aspect)

/** Where the phone rests (relative to the catch point) beside the chapter copy. */
export function phoneRestOffset(aspect, out) {
  const distance = catchDistance(aspect)
  const halfHeight = distance * Math.tan(THREE.MathUtils.degToRad(STORY_FOV / 2))
  const halfWidth = halfHeight * aspect
  if (aspect < 0.9) return out.set(0, halfHeight * 0.36, 0) // portrait: phone above, copy below
  return out.set(Math.min(halfWidth * 0.42, halfWidth - 2.4), 0, 0)
}

/** The slow turn the ball settles into once it's caught, shared by the delivery and phone chapters. */
const PRESENT_TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.95, 0, 0.45))
export function presentOrientation(time, out) {
  spin.setFromAxisAngle(Y_AXIS, time * 0.18)
  return out.multiplyQuaternions(spin, PRESENT_TILT)
}

export const STUDIO = {
  lightDirection: new THREE.Vector3(-0.55, 0.85, 0.6).normalize(),
  lightIntensity: 3,
  lightDistance: 40,
  lightExtent: 9,
  environment: 0.55,
  environmentYaw: 1.1,
}

// ---------------------------------------------------------------------------------------------
// The stadium and the closing product shot sit far away from everything else, so no other
// chapter's camera can ever see them. Both are reached through a cut hidden by darkness / a panel.

export const STADIUM_ORIGIN = new THREE.Vector3(4000, 0, 0)
export const CTA_ORIGIN = new THREE.Vector3(-4000, 0, 0)

/** Light the catch point like a product studio. `level` dims everything together (0 = black). */
export function studioLight(rig, target = CATCH_POINT, level = 1) {
  rig.light({
    target,
    direction: STUDIO.lightDirection,
    intensity: STUDIO.lightIntensity * level,
    extent: STUDIO.lightExtent,
    distance: STUDIO.lightDistance,
  })
  rig.environment(STUDIO.environment * level, STUDIO.environmentYaw)
  rig.background(INK)
  rig.fog(1e4, 2e4)
}
