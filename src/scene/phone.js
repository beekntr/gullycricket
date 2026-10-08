import * as THREE from 'three'
import { BALL_RADIUS } from './props/ball.js'
import { CATCH_POINT, catchDistance, phoneRestOffset, presentOrientation, STORY_FOV, studioLight } from './story.js'
import { ease, segment } from './utils/timing.js'

/*
 * Chapter 3 — THE PHONE.
 * The caught ball hangs in the dark. A phone turns up into frame and lies back beneath it; the ball
 * shrinks and drops into the screen, which ripples and lights up with the app. The phone then
 * stands up beside the copy, in the rest pose the features chapter starts from.
 */

const { lerp } = THREE.MathUtils

const euler = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z))

// Phone poses, relative to the catch point.
const HIDDEN = { position: new THREE.Vector3(0, -11, -4), rotation: euler(0.5, Math.PI + 0.7, 0.35) }
const LYING = { position: new THREE.Vector3(0, -1.9, -2.6), rotation: euler(-1.18, 0, 0) }
export const REST_ROTATION = { landscape: euler(0.02, -0.3, 0), portrait: euler(0.03, -0.16, 0) }

const BALL_IN_PHONE_SCALE = 0.32

export function createPhoneScene({ stage, rig, ball, props }) {
  const camera = stage.camera
  const state = { u: 0 }
  const frame = { distance: 24, rest: new THREE.Vector3(), restRotation: REST_ROTATION.landscape }
  let device = null

  const section = { id: 'phone', state, load, unmount, resize, update }

  async function load() {
    device = await props.acquire('device')
  }

  function unmount() {
    props.release('device')
    device = null
  }

  function resize({ aspect }) {
    frame.distance = catchDistance(aspect)
    phoneRestOffset(aspect, frame.rest)
    frame.restRotation = aspect < 0.9 ? REST_ROTATION.portrait : REST_ROTATION.landscape
  }

  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const target = new THREE.Vector3()

  function update(dt, time, isOwner) {
    if (!isOwner || !device) return
    const { u } = state

    rig.lens(STORY_FOV, 0.1, 400)
    camera.position.set(CATCH_POINT.x, CATCH_POINT.y, CATCH_POINT.z + frame.distance)
    camera.lookAt(CATCH_POINT)
    studioLight(rig)

    // --- Phone: turn up into frame, lie back under the ball, then stand up beside the copy ---
    const rise = ease.inOut(segment(u, 0.16, 0.5))
    const standUp = ease.inOut(segment(u, 0.7, 0.97))
    position.lerpVectors(HIDDEN.position, LYING.position, rise).lerp(frame.rest, standUp)
    rotation.slerpQuaternions(HIDDEN.rotation, LYING.rotation, rise).slerp(frame.restRotation, standUp)
    device.object.position.copy(CATCH_POINT).add(position)
    device.object.quaternion.copy(rotation)
    device.object.visible = true

    // --- Screen: dark glass until the ball lands, then a ripple and the home screen ---
    device.screen.show(0)
    device.screen.power(ease.soft(segment(u, 0.62, 0.72)))
    device.screen.ripple(segment(u, 0.62, 0.86))

    // --- Ball: drift, then shrink and drop into the screen ---
    const shrink = ease.soft(segment(u, 0.46, 0.62))
    const drop = ease.in(segment(u, 0.5, 0.62))
    const absorb = ease.in(segment(u, 0.62, 0.65))
    const scale = lerp(1, BALL_IN_PHONE_SCALE, shrink) * (1 - absorb)

    const { point, normal } = device.screen.center()
    target.copy(point).addScaledVector(normal, BALL_RADIUS * scale)
    ball.object.position.lerpVectors(CATCH_POINT, target, drop)
    presentOrientation(time, ball.object.quaternion)
    ball.object.scale.setScalar(Math.max(scale, 1e-4))
    ball.object.visible = scale > 0.001
  }

  return section
}
