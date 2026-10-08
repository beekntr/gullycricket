import * as THREE from 'three'
import { BALL_RADIUS } from './props/ball.js'
import { closeUpDistance, closeUpOrientation, INK, SEAM_CLOSE_UP } from './story.js'
import { ease, logLerp, segment } from './utils/timing.js'

/*
 * Chapter 1 — HERO.
 * The ball floats in darkness, turning slowly under a single rim light. Scroll pushes the camera
 * in until the stitched seam fills the frame, while the ball settles onto the close-up pose and the
 * light swings round from behind to rake across the stitches. Ends on SEAM_CLOSE_UP.
 *
 * `state.intro` and `state.push` are written by GSAP (src/animations/hero.js).
 */

const { lerp } = THREE.MathUtils

const IDLE_SPIN_SPEED = 0.2 // rad/s around world Y
const STATIC_SPIN = 1.3 // reduced motion: the one fixed spin angle, chosen to show the seam lit at the rim
const IDLE_TILT = new THREE.Quaternion().setFromEuler(new THREE.Euler(1.05, 0, 0.5))

// Starts behind and above-left as a rim; ends as SEAM_CLOSE_UP's raking light.
const RIM_DIRECTION = new THREE.Vector3(-0.5, 0.45, -1.1).normalize()

// Where the ball sits on screen before the push: its height as a fraction of the viewport,
// capped by width on narrow screens, and its centre measured down from the top.
const FRAMING = {
  desktop: { height: 0.52, width: 0.5, centerY: 0.41 },
  mobile: { height: 0.44, width: 0.74, centerY: 0.35 },
}

const Y_AXIS = new THREE.Vector3(0, 1, 0)

export function createHeroScene({ stage, rig, ball, reducedMotion, isMobile }) {
  const camera = stage.camera
  const state = { intro: reducedMotion ? 1 : 0, push: 0 }
  const frame = { distance: 8, offsetY: 0, closeUp: 0.5 }

  const idle = new THREE.Quaternion()
  const closeUp = new THREE.Quaternion()
  const spin = new THREE.Quaternion()
  const lightDirection = new THREE.Vector3()
  const lightTarget = new THREE.Vector3()
  const lookTarget = new THREE.Vector3()

  function resize({ aspect }) {
    const layout = isMobile || aspect < 0.8 ? FRAMING.mobile : FRAMING.desktop
    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(SEAM_CLOSE_UP.fov / 2))
    // Half the visible height at the ball's distance that fits the ball by height and by width.
    const halfHeight = Math.max(BALL_RADIUS / layout.height, BALL_RADIUS / (layout.width * aspect))
    frame.distance = halfHeight / tanHalfFov
    frame.offsetY = (0.5 - layout.centerY) * 2 * halfHeight
    frame.closeUp = closeUpDistance(aspect)
  }

  function update(dt, time, isOwner) {
    if (!isOwner) return
    const t = reducedMotion ? 0 : time
    const { intro, push } = state

    // Settle onto the close-up pose over the first three quarters of the push.
    const settle = ease.soft(segment(push, 0, 0.75))

    // --- Ball ---
    spin.setFromAxisAngle(Y_AXIS, reducedMotion ? STATIC_SPIN : t * IDLE_SPIN_SPEED)
    idle.multiplyQuaternions(spin, IDLE_TILT)
    closeUpOrientation(t, closeUp)
    ball.object.quaternion.slerpQuaternions(idle, closeUp, settle)
    ball.object.position.set(0, Math.sin(t * 0.6) * 0.035 * (1 - settle), 0)
    ball.object.scale.setScalar(1)
    ball.object.visible = true

    // --- Camera ---
    // Ease the distance *to the leather* in log space so the zoom rate feels even all the way in.
    const introDolly = 1 + (1 - intro) * 0.08
    const gap = logLerp(frame.distance * introDolly - BALL_RADIUS, frame.closeUp, push)
    const y = lerp(-frame.offsetY, 0, ease.soft(segment(push, 0, 0.6)))
    const arc = Math.sin(push * Math.PI) * 0.14

    rig.lens(SEAM_CLOSE_UP.fov, 0.01, 100)
    camera.position.set(arc, y, BALL_RADIUS + gap)
    lookTarget.set(0, y, lerp(0, BALL_RADIUS, push))
    camera.lookAt(lookTarget)

    // --- Light ---
    const swing = ease.soft(segment(push, 0.15, 0.85))
    lightDirection.lerpVectors(RIM_DIRECTION, SEAM_CLOSE_UP.lightDirection, swing).normalize()
    lightTarget.lerpVectors(ball.object.position, SEAM_CLOSE_UP.point, settle)
    rig.light({
      target: lightTarget,
      direction: lightDirection,
      intensity: lerp(8, SEAM_CLOSE_UP.lightIntensity, swing) * intro * intro,
      // Tighten the shadow frustum onto the seam as we close in, for crisp stitch shadows.
      extent: lerp(1.2, frame.closeUp * 0.6, settle),
      distance: SEAM_CLOSE_UP.lightDistance,
    })
    // Just enough of the HDRI to give the lacquer a reflection; more as we close in.
    rig.environment(lerp(0.1, SEAM_CLOSE_UP.environment, push) * intro, SEAM_CLOSE_UP.environmentYaw)
    rig.background(INK)
    rig.fog(1e4, 2e4)
  }

  return { id: 'hero', state, resize, update }
}
