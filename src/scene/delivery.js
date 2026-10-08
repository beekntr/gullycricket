import * as THREE from 'three'
import { BALL_RADIUS } from './props/ball.js'
import {
  CATCH_POINT,
  catchDistance,
  closeUpDistance,
  closeUpOrientation,
  INK,
  presentOrientation,
  SEAM_CLOSE_UP,
  STORY_FOV,
  STUDIO,
} from './story.js'
import { canvasTexture, createCanvas } from './utils/canvas.js'
import { createFade, makeFadeable } from './utils/fade.js'
import { ease, logLerp, nextIdle, segment } from './utils/timing.js'

/*
 * Chapter 2 — THE DELIVERY.
 * Starts on the hero's seam close-up. The camera pulls back down a floodlit pitch to the striker's
 * end, the ball is bowled at us (late swing, a bounce on a good length, a trail behind it), and it
 * is "caught" hanging in front of the lens while the pitch dissolves into darkness. Ends on
 * CATCH_POINT, studio-lit, for the phone chapter.
 *
 * The ball's release point is the world origin, which is exactly where the hero left it.
 */

const { lerp } = THREE.MathUtils

const UPM = 11 // world units per metre: the ball reads ~3× real size against the pitch, poster-style
const PITCH_Y = -24 // pitch surface; the ball is released from the origin, 2.2 m up
const BOWLER_STUMPS_Z = -8
const STRIKER_STUMPS_Z = BOWLER_STUMPS_Z + 20.12 * UPM
const BOUNCE_Z = STRIKER_STUMPS_Z - 6 * UPM // a good length
const PITCH_WIDTH = 3.05 * UPM
const STRIP_MARGIN = 1.5 * UPM // the strip runs a little past each set of stumps
const STRIP_START = BOWLER_STUMPS_Z - STRIP_MARGIN
const STRIP_LENGTH = STRIKER_STUMPS_Z - BOWLER_STUMPS_Z + STRIP_MARGIN * 2
const STUMP_HEIGHT = 0.711 * UPM
const STUMP_RADIUS = 0.2
const STUMP_SPACING = 1.25
const PITCH_CENTER = new THREE.Vector3(0, PITCH_Y, (BOWLER_STUMPS_Z + STRIKER_STUMPS_Z) / 2)
const PITCH_LIGHT = new THREE.Vector3(-0.35, 1, 0.3).normalize()

// Timeline, in chapter progress u.
const PULL_BACK = [0, 0.36]
const BOWL = [0.44, 0.84]
const FREEZE = [0.84, 1]

const SWING = 2.2 // late outswing, world units
const S_BOUNCE = BOUNCE_Z / CATCH_POINT.z
const TRAIL_LENGTH = 0.14 // fraction of the delivery the trail covers
const TRAIL_POINTS = 48
const SPIN_TURNS = 7 // backspin over the delivery

const Z_AXIS = new THREE.Vector3(0, 0, 1)
const SEAM_UPRIGHT = new THREE.Quaternion().setFromAxisAngle(Z_AXIS, -Math.PI / 2) // seam axis → world X

/** Where the ball is at fraction `s` of the delivery: dipping under gravity, swinging late, bouncing. */
function deliveryPath(s, out) {
  const z = s * CATCH_POINT.z
  const floor = PITCH_Y + BALL_RADIUS
  if (s <= S_BOUNCE) {
    const k = s / S_BOUNCE
    return out.set(SWING * k * k, floor * (0.35 * k + 0.65 * k * k), z)
  }
  const k = (s - S_BOUNCE) / (1 - S_BOUNCE)
  return out.set(SWING * (1 - k) ** 1.5, floor + (CATCH_POINT.y - floor) * (1.6 * k - 0.6 * k * k), z)
}

const spinQuaternion = new THREE.Quaternion()
const wobbleQuaternion = new THREE.Quaternion()
const X_AXIS = new THREE.Vector3(1, 0, 0)
const Y_AXIS = new THREE.Vector3(0, 1, 0)

/** Seam upright and pointing down the pitch, with backspin and the faint wobble of a real seamer. */
function bowlingOrientation(s, out) {
  spinQuaternion.setFromAxisAngle(Y_AXIS, -s * SPIN_TURNS * Math.PI * 2)
  wobbleQuaternion.setFromAxisAngle(X_AXIS, Math.sin(s * 23) * 0.06)
  return out.multiplyQuaternions(SEAM_UPRIGHT, wobbleQuaternion).multiply(spinQuaternion)
}

/** The strip: worn grass, a little lighter where bowlers land and batters stand, chalk creases. */
function drawPitch(renderer) {
  const width = 384
  const height = 2048
  const { canvas, ctx } = createCanvas(width, height)
  const pxX = width / PITCH_WIDTH
  const pxZ = height / STRIP_LENGTH
  const toY = (z) => (z - STRIP_START) * pxZ

  ctx.fillStyle = '#56634c'
  ctx.fillRect(0, 0, width, height)

  // Mottling and grit.
  for (let i = 0; i < 5200; i++) {
    const light = Math.random() > 0.5
    ctx.fillStyle = light ? `rgba(242,239,232,${Math.random() * 0.06})` : `rgba(11,11,10,${Math.random() * 0.12})`
    const size = 1 + Math.random() * 5
    ctx.fillRect(Math.random() * width, Math.random() * height, size, size * (1 + Math.random() * 3))
  }

  // Wear: the lengths bowlers hit and the creases batters scuff.
  for (const z of [BOWLER_STUMPS_Z, STRIKER_STUMPS_Z]) {
    ctx.fillStyle = 'rgba(214,206,178,0.16)'
    ctx.fillRect(width * 0.18, toY(z) - 26 * pxZ, width * 0.64, 52 * pxZ)
  }
  ctx.fillStyle = 'rgba(214,206,178,0.1)'
  ctx.fillRect(width * 0.28, toY(BOUNCE_Z) - 30 * pxZ, width * 0.44, 60 * pxZ)

  // Creases (Laws of Cricket, in metres).
  ctx.fillStyle = 'rgba(242,239,232,0.92)'
  const line = 0.05 * UPM
  const bar = (x0, x1, z) => ctx.fillRect(width / 2 + x0 * pxX, toY(z) - (line * pxZ) / 2, (x1 - x0) * pxX, line * pxZ)
  const post = (x, z0, z1) => ctx.fillRect(width / 2 + x * pxX - (line * pxX) / 2, toY(Math.min(z0, z1)), line * pxX, Math.abs(z1 - z0) * pxZ)
  for (const [stumps, toward] of [
    [BOWLER_STUMPS_Z, 1],
    [STRIKER_STUMPS_Z, -1],
  ]) {
    const popping = stumps + toward * 1.22 * UPM
    bar(-1.32 * UPM, 1.32 * UPM, stumps) // bowling crease
    bar(-PITCH_WIDTH / 2, PITCH_WIDTH / 2, popping) // popping crease
    for (const side of [-1, 1]) post(side * 1.32 * UPM, popping, stumps - toward * 1.22 * UPM) // return creases
  }

  return canvasTexture(canvas, renderer, 16)
}

/** Outfield mowing stripes, tiled. */
function drawOutfield(renderer) {
  const { canvas, ctx } = createCanvas(256, 256)
  ctx.fillStyle = '#1f3b2c'
  ctx.fillRect(0, 0, 256, 256)
  ctx.fillStyle = '#23412f'
  ctx.fillRect(0, 0, 128, 256)
  const texture = canvasTexture(canvas, renderer, 8)
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(24, 24)
  return texture
}

export function createDeliveryScene({ stage, rig, ball, quality }) {
  const camera = stage.camera
  const state = { u: 0 }
  const frame = { closeUp: 0.5, catchCamera: new THREE.Vector3() }
  const fade = createFade(INK)

  let trail = null
  let mark = null

  const section = { id: 'delivery', state, group: null, load, resize, update }

  async function load() {
    const group = new THREE.Group()
    group.name = 'delivery'
    const { renderer } = stage
    const fadeable = (material) => makeFadeable(material, fade)

    const strip = new THREE.Mesh(
      new THREE.PlaneGeometry(PITCH_WIDTH, STRIP_LENGTH),
      fadeable(new THREE.MeshStandardMaterial({ map: drawPitch(renderer), roughness: 0.92 })),
    )
    strip.rotation.x = -Math.PI / 2
    strip.position.set(0, PITCH_Y, STRIP_START + STRIP_LENGTH / 2)
    strip.receiveShadow = true
    await nextIdle()

    const outfield = new THREE.Mesh(
      new THREE.CircleGeometry(520, quality.shaderDetail ? 96 : 48),
      fadeable(new THREE.MeshStandardMaterial({ map: drawOutfield(renderer), roughness: 1 })),
    )
    outfield.rotation.x = -Math.PI / 2
    outfield.position.set(0, PITCH_Y - 0.05, PITCH_CENTER.z)
    outfield.receiveShadow = true

    // Stumps and bails at both ends, painted chalk.
    const paint = fadeable(new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.45 }))
    const stumpGeometry = new THREE.CylinderGeometry(STUMP_RADIUS, STUMP_RADIUS, STUMP_HEIGHT, 12)
    const bailGeometry = new THREE.CylinderGeometry(0.09, 0.09, STUMP_SPACING * 0.95, 8).rotateZ(Math.PI / 2)
    for (const z of [BOWLER_STUMPS_Z, STRIKER_STUMPS_Z]) {
      for (const x of [-STUMP_SPACING, 0, STUMP_SPACING]) {
        const stump = new THREE.Mesh(stumpGeometry, paint)
        stump.position.set(x, PITCH_Y + STUMP_HEIGHT / 2, z)
        stump.castShadow = true
        group.add(stump)
      }
      for (const x of [-STUMP_SPACING / 2, STUMP_SPACING / 2]) {
        const bail = new THREE.Mesh(bailGeometry, paint)
        bail.position.set(x, PITCH_Y + STUMP_HEIGHT + 0.09, z)
        bail.castShadow = true
        group.add(bail)
      }
    }

    // Where the ball pitched.
    mark = new THREE.Mesh(
      new THREE.CircleGeometry(1.4, 24),
      new THREE.MeshBasicMaterial({ color: 0x2c3126, transparent: true, opacity: 0, depthWrite: false }),
    )
    mark.rotation.x = -Math.PI / 2
    deliveryPath(S_BOUNCE, mark.position)
    mark.position.y = PITCH_Y + 0.04

    trail = createTrail()

    group.add(strip, outfield, mark, trail.mesh)
    section.group = group
  }

  function resize({ aspect }) {
    frame.closeUp = closeUpDistance(aspect)
    frame.catchCamera.copy(CATCH_POINT).add(new THREE.Vector3(0, 0, catchDistance(aspect)))
  }

  // Scratch objects, reused every frame.
  const ballPosition = new THREE.Vector3()
  const orientation = new THREE.Quaternion()
  const bowl = new THREE.Quaternion()
  const blend = new THREE.Quaternion()
  const aim = new THREE.Vector3()
  const look = new THREE.Vector3()
  const direction = new THREE.Vector3()
  const lightDirection = new THREE.Vector3()
  const lightTarget = new THREE.Vector3()
  const ORIGIN = new THREE.Vector3()
  const MID_PITCH_AIM = new THREE.Vector3(0, -14, 120)

  function update(dt, time, isOwner) {
    if (!isOwner) return
    const { u } = state
    const pull = ease.inOut(segment(u, ...PULL_BACK))
    const s = segment(u, ...BOWL)
    const freeze = ease.soft(segment(u, ...FREEZE))

    // --- Ball ---
    deliveryPath(s, ballPosition)
    bowlingOrientation(s, bowl)
    // Turn the seam upright during the pull-back; settle into the slow presentation turn once caught.
    orientation.slerpQuaternions(closeUpOrientation(time, blend), bowl, ease.soft(segment(u, 0.04, 0.4)))
    if (freeze > 0) orientation.slerp(presentOrientation(time, blend), freeze)
    ball.object.position.copy(ballPosition)
    ball.object.quaternion.copy(orientation)
    ball.object.scale.setScalar(1)
    ball.object.visible = true
    ball.castShadows(true) // its shadow racing it down the pitch sells the height

    // --- Camera: dolly back along the line to the striker's end, then hold and track the ball in ---
    const startDistance = BALL_RADIUS + frame.closeUp
    const endDistance = frame.catchCamera.length()
    direction.copy(Z_AXIS).lerp(aim.copy(frame.catchCamera).normalize(), pull).normalize()
    camera.position.copy(direction).multiplyScalar(logLerp(startDistance, endDistance, pull))

    // Glance down the pitch towards the bounce, then pick the ball up as it rises at us.
    aim.lerpVectors(ORIGIN, MID_PITCH_AIM, ease.soft(segment(s, 0, 0.45)))
    look.lerpVectors(aim, ballPosition, ease.soft(segment(s, 0.62, 1)))
    camera.lookAt(look)

    const toBall = camera.position.distanceTo(ballPosition)
    rig.lens(lerp(SEAM_CLOSE_UP.fov, STORY_FOV, pull), THREE.MathUtils.clamp(toBall * 0.02, 0.01, 1), 1400)

    // --- Light: seam rake → floodlit pitch → studio light on the caught ball ---
    lightDirection.lerpVectors(SEAM_CLOSE_UP.lightDirection, PITCH_LIGHT, pull)
    lightDirection.lerp(STUDIO.lightDirection, freeze).normalize()
    lightTarget.lerpVectors(SEAM_CLOSE_UP.point, PITCH_CENTER, pull).lerp(CATCH_POINT, freeze)
    rig.light({
      target: lightTarget,
      direction: lightDirection,
      intensity: lerp(lerp(SEAM_CLOSE_UP.lightIntensity, 3.6, pull), STUDIO.lightIntensity, freeze),
      extent: logLerp(logLerp(frame.closeUp * 0.6, 140, pull), STUDIO.lightExtent, freeze),
      distance: logLerp(logLerp(SEAM_CLOSE_UP.lightDistance, 420, pull), STUDIO.lightDistance, freeze),
    })
    rig.environment(lerp(lerp(SEAM_CLOSE_UP.environment, 0.1, pull), STUDIO.environment, freeze), STUDIO.environmentYaw)
    rig.fog(logLerp(1e4, 180, pull), logLerp(2e4, 560, pull))
    rig.background(INK)

    // --- The pitch dissolves in as we pull back, and away once the ball is caught ---
    const visibility = ease.soft(segment(u, 0.08, 0.34)) * (1 - ease.soft(segment(u, 0.84, 0.96)))
    fade.uFade.value = visibility
    mark.material.opacity = segment(s, S_BOUNCE, S_BOUNCE + 0.04) * 0.75 * visibility

    // Trail: follows the ball, then shrinks into it as the ball comes to rest.
    const collapse = segment(u, FREEZE[0], FREEZE[0] + 0.05)
    trail.update(s, Math.max(0, s - TRAIL_LENGTH * (1 - collapse)), camera.position)
  }

  return section
}

/**
 * A camera-facing ribbon along the ball's recent path, tapering and fading towards the tail:
 * the motion blur a long exposure would leave. Rebuilt from the path each frame, so it scrubs
 * backwards correctly.
 */
function createTrail() {
  const positions = new Float32Array(TRAIL_POINTS * 2 * 3)
  const colors = new Float32Array(TRAIL_POINTS * 2 * 4)
  const indices = []
  for (let i = 0; i < TRAIL_POINTS - 1; i++) {
    const a = i * 2
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4).setUsage(THREE.DynamicDrawUsage))
  geometry.setIndex(indices)

  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    }),
  )
  mesh.frustumCulled = false

  const point = new THREE.Vector3()
  const ahead = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const toCamera = new THREE.Vector3()
  const side = new THREE.Vector3()
  const head = new THREE.Color(0xb3261e)
  const tail = new THREE.Color(0xf2efe8)
  const color = new THREE.Color()

  function update(sHead, sTail, cameraPosition) {
    mesh.visible = sHead > 0 && sHead - sTail > 0.002
    if (!mesh.visible) return

    for (let i = 0; i < TRAIL_POINTS; i++) {
      const k = i / (TRAIL_POINTS - 1) // 0 = tail, 1 = head
      const s = lerp(sTail, sHead, k)
      deliveryPath(s, point)
      deliveryPath(s + 0.001, ahead)
      tangent.subVectors(ahead, point).normalize()
      toCamera.subVectors(cameraPosition, point)
      side.crossVectors(tangent, toCamera).normalize().multiplyScalar(BALL_RADIUS * 0.82 * k ** 0.7)

      positions.set([point.x + side.x, point.y + side.y, point.z + side.z], i * 6)
      positions.set([point.x - side.x, point.y - side.y, point.z - side.z], i * 6 + 3)

      color.lerpColors(tail, head, k)
      const alpha = k ** 1.6 * 0.5
      colors.set([color.r, color.g, color.b, alpha, color.r, color.g, color.b, alpha], i * 8)
    }
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
  }

  return { mesh, update }
}
