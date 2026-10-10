import * as THREE from 'three'
import { createBatter } from './batter.js'
import { createBowler, RELEASE_AT } from './bowler.js'
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
 * Starts on the hero's seam close-up: the ball is in a fast bowler's hands, frozen at the top of
 * his leap. The camera pulls back down a floodlit pitch to a keeper's-eye view over the batter's
 * shoulder, time restarts, and he bowls. The batter lifts his bat and plants a forward defence;
 * the ball pitches on a good length, beats him between bat and pad, and crashes into middle stump.
 * Bails fly, the bowler celebrates, the batter looks back, and the ball deflects up into the lens,
 * where it hangs as the pitch dissolves into darkness. Ends on CATCH_POINT, studio-lit, for the
 * phone chapter.
 *
 * The ball in his hands at the top of the leap is the world origin, exactly where the hero left it.
 * The pitch is laid out around the bowler's measured action (front foot, release point), and the
 * batter is placed so the ball's line runs through the gap between his front pad and bat.
 */

const { lerp, clamp } = THREE.MathUtils

const UPM = 11 // world units per metre
const PITCH_Y = -24 // pitch surface: the ball is 2.2 m up, held at the bowler's chin mid-leap
const BALL_IN_PLAY = 0.6 // ball scale beside the bowler: ~1.5× true size, so it still reads at distance
const BALL_R = BALL_RADIUS * BALL_IN_PLAY

// --- Lay the pitch out around the bowler's action -------------------------------------------------

const layout = (() => {
  const bowler = createBowler({ ballHeight: -PITCH_Y })
  const offset = new THREE.Vector3()
  bowler.pose(0)
  bowler.ballPosition(offset).negate() // shift him so the ball at the bound is the origin
  const release = new THREE.Vector3()
  const frontFoot = new THREE.Vector3()
  bowler.pose(RELEASE_AT)
  bowler.ballPosition(release).add(offset)
  bowler.footPosition('L', frontFoot).add(offset)
  return { offset, release, frontFoot }
})()

const BOWLER_POPPING_Z = layout.frontFoot.z + 2.2 // front foot lands just behind the line
const BOWLER_STUMPS_Z = BOWLER_POPPING_Z - 1.22 * UPM
const STRIKER_STUMPS_Z = BOWLER_STUMPS_Z + 20.12 * UPM
const PITCH_X = layout.release.x - 4 // over the wicket: the bowling hand passes just wide of the stumps
const PITCH_WIDTH = 3.05 * UPM
const STRIP_MARGIN = 1.5 * UPM
const STRIP_START = BOWLER_STUMPS_Z - STRIP_MARGIN
const STRIP_LENGTH = STRIKER_STUMPS_Z - BOWLER_STUMPS_Z + STRIP_MARGIN * 2
const STUMP_HEIGHT = 0.711 * UPM
const STUMP_RADIUS = 0.2
const STUMP_SPACING = 1.25
const PITCH_CENTER = new THREE.Vector3(PITCH_X, PITCH_Y, (BOWLER_STUMPS_Z + STRIKER_STUMPS_Z) / 2)
const PITCH_LIGHT = new THREE.Vector3(-0.35, 1, 0.3).normalize()
const STRIKER_FOV = 27 // a touch wider at the striker's end, to hold wicket, batter and bowler together
const STUMP_FOV = 25 // stump-cam, looking down the ball's line through the batter's gate

// The ball's flight: out of the hand, pitching 6 m short, rising into middle stump at knee height.
const RELEASE_POINT = layout.release
const BOUNCE_POINT = new THREE.Vector3(PITCH_X + 0.9, PITCH_Y + BALL_R, STRIKER_STUMPS_Z - 6 * UPM)
const IMPACT_POINT = new THREE.Vector3(PITCH_X + 0.15, PITCH_Y + 3, STRIKER_STUMPS_Z - STUMP_RADIUS - BALL_R * 0.9)
const S_BOUNCE = (BOUNCE_POINT.z - RELEASE_POINT.z) / (IMPACT_POINT.z - RELEASE_POINT.z)

// --- Place the batter so the ball goes through the gate -------------------------------------------

const BATTER_GATE = 1.7 // in his own frame: off-side distance between his front pad and bat
const BATTER_TURN = Math.PI / 2 // left shoulder down the pitch: his +X → world -Z, his +Z (off side) → world +X
const BATTER_PLACE = (() => {
  const batter = createBatter()
  const frontAnkle = new THREE.Vector3()
  batter.pose(1) // full forward defence
  batter.footPosition('L', frontAnkle)
  const frontFootZ = STRIKER_STUMPS_Z - 1.22 * UPM - 0.7 * UPM // stretched 0.7 m out of his crease
  const gateZ = frontFootZ + 2 // between the front pad and the bat
  const gateX = lerp(BOUNCE_POINT.x, IMPACT_POINT.x, (gateZ - BOUNCE_POINT.z) / (IMPACT_POINT.z - BOUNCE_POINT.z))
  return new THREE.Vector3(gateX - BATTER_GATE, PITCH_Y, frontFootZ + frontAnkle.x)
})()

// --- Timeline, in chapter progress u --------------------------------------------------------------

const PULL_BACK = [0, 0.34] // camera retreats; the bowler hangs frozen mid-leap
const ACTION = [0.34, 0.47] // landing, delivery stride, release, follow-through
const FROZEN_DRIFT = 0.03 // how far the action creeps during the frozen pull-back
const U_RELEASE = ACTION[0] + ((RELEASE_AT - FROZEN_DRIFT) / (1 - FROZEN_DRIFT)) * (ACTION[1] - ACTION[0])
const U_IMPACT = 0.72
const CELEBRATE = [U_IMPACT + 0.01, U_IMPACT + 0.11]
const STUMPS_FLY = [U_IMPACT, U_IMPACT + 0.16]
const DRIFT = [U_IMPACT, 0.97] // the deflected ball comes up into the lens
const FREEZE = [0.86, 1] // pitch dissolves, studio light on the ball

const TRAIL_LENGTH = 0.14 // fraction of the flight the trail covers
const TRAIL_POINTS = 48
const SPIN_TURNS = 7 // backspin over the flight

const Z_AXIS = new THREE.Vector3(0, 0, 1)
const X_AXIS = new THREE.Vector3(1, 0, 0)
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const TUMBLE_AXIS = new THREE.Vector3(1, 0.35, 0.2).normalize()
const SEAM_UPRIGHT = new THREE.Quaternion().setFromAxisAngle(Z_AXIS, -Math.PI / 2) // seam axis → world X

/** The ball at fraction `s` of its flight: dipping under gravity, angling in, pitching, rising. */
function deliveryPath(s, out) {
  if (s <= S_BOUNCE) {
    const k = s / S_BOUNCE
    return out.set(
      lerp(RELEASE_POINT.x, BOUNCE_POINT.x, 0.7 * k + 0.3 * k * k),
      RELEASE_POINT.y + (BOUNCE_POINT.y - RELEASE_POINT.y) * (0.35 * k + 0.65 * k * k),
      lerp(RELEASE_POINT.z, BOUNCE_POINT.z, k),
    )
  }
  const k = (s - S_BOUNCE) / (1 - S_BOUNCE)
  return out.set(
    lerp(BOUNCE_POINT.x, IMPACT_POINT.x, k),
    BOUNCE_POINT.y + (IMPACT_POINT.y - BOUNCE_POINT.y) * (1.6 * k - 0.6 * k * k),
    lerp(BOUNCE_POINT.z, IMPACT_POINT.z, k),
  )
}

const spinQuaternion = new THREE.Quaternion()
const wobbleQuaternion = new THREE.Quaternion()

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
  ctx.fillRect(width * 0.28, toY(BOUNCE_POINT.z) - 30 * pxZ, width * 0.44, 60 * pxZ)

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

/*
 * The striker's wicket breaking: middle stump knocked back, off stump nudged, both bails thrown up
 * and towards the camera. Ballistic and deterministic in `t`, so it scrubs both ways.
 */
const BAIL_GRAVITY = 38
const BAIL_LAUNCH = [
  { velocity: new THREE.Vector3(-2.5, 13, 9), spin: new THREE.Vector3(9, 1, 6) },
  { velocity: new THREE.Vector3(3, 15, 7.5), spin: new THREE.Vector3(-7, 2, 11) },
]

function breakWicket(wicket, t) {
  const knock = ease.out(clamp(t / 0.35, 0, 1))
  wicket.stumps[1].rotation.set(0.62 * knock, 0, -0.1 * knock) // middle, hit
  const nudge = ease.out(clamp((t - 0.05) / 0.4, 0, 1))
  wicket.stumps[2].rotation.set(0.14 * nudge, 0, 0.06 * nudge)
  wicket.stumps[0].rotation.set(0, 0, 0)

  const ground = PITCH_Y + 0.09
  wicket.bails.forEach((bail, i) => {
    const { velocity, spin } = BAIL_LAUNCH[i]
    const start = wicket.bailStarts[i]
    const drop = start.y - ground
    const landing = (velocity.y + Math.sqrt(velocity.y ** 2 + 2 * BAIL_GRAVITY * drop)) / BAIL_GRAVITY
    const time = Math.min(t, landing)
    bail.position.set(
      start.x + velocity.x * time,
      start.y + velocity.y * time - 0.5 * BAIL_GRAVITY * time * time,
      start.z + velocity.z * time,
    )
    bail.rotation.set(spin.x * time, spin.y * time, spin.z * time)
  })
}

export function createDeliveryScene({ stage, rig, ball, quality }) {
  const camera = stage.camera
  const state = { u: 0 }
  // strikerView/Aim: where the pull-back ends, high over the batter's shoulder, beside the copy.
  // stumpView/Aim: low behind the wicket on the ball's line, where the gate and the wicket show.
  // catchCamera: the hand-off pose for the phone chapter.
  const frame = {
    closeUp: 0.5,
    strikerView: new THREE.Vector3(),
    strikerAim: new THREE.Vector3(),
    stumpView: new THREE.Vector3(),
    stumpAim: new THREE.Vector3(),
    catchCamera: new THREE.Vector3(),
  }
  const fade = createFade(INK)

  let trail = null
  let mark = null
  let bowler = null
  let batter = null
  let wicket = null

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
    strip.position.set(PITCH_X, PITCH_Y, STRIP_START + STRIP_LENGTH / 2)
    strip.receiveShadow = true
    await nextIdle()

    const outfield = new THREE.Mesh(
      new THREE.CircleGeometry(520, quality.shaderDetail ? 96 : 48),
      fadeable(new THREE.MeshStandardMaterial({ map: drawOutfield(renderer), roughness: 1 })),
    )
    outfield.rotation.x = -Math.PI / 2
    outfield.position.set(PITCH_X, PITCH_Y - 0.05, PITCH_CENTER.z)
    outfield.receiveShadow = true

    // Stumps and bails at both ends, painted chalk. Each stump pivots at its base so it can be
    // knocked back; the striker's wicket is kept for breaking.
    const paint = fadeable(new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.45 }))
    const stumpGeometry = new THREE.CylinderGeometry(STUMP_RADIUS, STUMP_RADIUS, STUMP_HEIGHT, 12).translate(0, STUMP_HEIGHT / 2, 0)
    const bailGeometry = new THREE.CylinderGeometry(0.09, 0.09, STUMP_SPACING * 0.95, 8).rotateZ(Math.PI / 2)
    for (const z of [BOWLER_STUMPS_Z, STRIKER_STUMPS_Z]) {
      const stumps = [-STUMP_SPACING, 0, STUMP_SPACING].map((x) => {
        const stump = new THREE.Mesh(stumpGeometry, paint)
        stump.position.set(PITCH_X + x, PITCH_Y, z)
        stump.castShadow = true
        group.add(stump)
        return stump
      })
      const bails = [-STUMP_SPACING / 2, STUMP_SPACING / 2].map((x) => {
        const bail = new THREE.Mesh(bailGeometry, paint)
        bail.position.set(PITCH_X + x, PITCH_Y + STUMP_HEIGHT + 0.09, z)
        bail.castShadow = true
        group.add(bail)
        return bail
      })
      if (z === STRIKER_STUMPS_Z) wicket = { stumps, bails, bailStarts: bails.map((bail) => bail.position.clone()) }
    }
    await nextIdle()

    // The bowler, placed so the ball in his hands at the top of the leap is the origin.
    const whites = {
      kit: fadeable(new THREE.MeshStandardMaterial({ color: 0xe8e3d6, roughness: 0.85 })),
      skin: fadeable(new THREE.MeshStandardMaterial({ color: 0x7a4b30, roughness: 0.6 })),
      shoes: fadeable(new THREE.MeshStandardMaterial({ color: 0xdedad0, roughness: 0.7 })),
    }
    bowler = createBowler({
      ballHeight: -PITCH_Y,
      materials: { ...whites, hair: fadeable(new THREE.MeshStandardMaterial({ color: 0x141312, roughness: 0.8 })) },
    })
    const bowlerPlace = new THREE.Group()
    bowlerPlace.position.copy(layout.offset)
    bowlerPlace.add(bowler.object)

    // The batter, side-on at the striker's end.
    batter = createBatter({
      materials: {
        ...whites,
        helmet: fadeable(new THREE.MeshStandardMaterial({ color: 0x1f3b2c, roughness: 0.35 })),
        grille: fadeable(new THREE.MeshStandardMaterial({ color: 0x2a2a28, metalness: 0.8, roughness: 0.4 })),
        willow: fadeable(new THREE.MeshStandardMaterial({ color: 0xd9c79f, roughness: 0.65 })),
        grip: fadeable(new THREE.MeshStandardMaterial({ color: 0x151514, roughness: 0.8 })),
      },
    })
    const batterPlace = new THREE.Group()
    batterPlace.position.copy(BATTER_PLACE)
    batterPlace.rotation.y = BATTER_TURN
    batterPlace.add(batter.object)

    // Where the ball pitched.
    mark = new THREE.Mesh(
      new THREE.CircleGeometry(1.1, 24),
      new THREE.MeshBasicMaterial({ color: 0x2c3126, transparent: true, opacity: 0, depthWrite: false }),
    )
    mark.rotation.x = -Math.PI / 2
    mark.position.set(BOUNCE_POINT.x, PITCH_Y + 0.04, BOUNCE_POINT.z)

    trail = createTrail()

    group.add(strip, outfield, bowlerPlace, batterPlace, mark, trail.mesh)
    group.updateMatrixWorld(true) // so the bowler's hand has a world position before the first render
    section.group = group
  }

  function resize({ aspect }) {
    frame.closeUp = closeUpDistance(aspect)
    frame.catchCamera.copy(CATCH_POINT).add(new THREE.Vector3(0, 0, catchDistance(aspect)))
    // High behind the stumps and to the leg side: the broken wicket below, the batter mid-frame, the
    // bowler beyond him, all clear of one another. Portrait screens sit closer to the line.
    if (aspect < 0.9) frame.strikerView.set(PITCH_X - 3, PITCH_Y + 46, STRIKER_STUMPS_Z + 110)
    else frame.strikerView.set(PITCH_X - 24, PITCH_Y + 40, STRIKER_STUMPS_Z + 95)
    // Wide screens aim left of the pitch, so the run-up plays out right of the copy.
    if (aspect < 0.9) frame.strikerAim.set(PITCH_X, PITCH_Y + 2, STRIKER_STUMPS_Z - 67)
    else frame.strikerAim.set(PITCH_X - 12, PITCH_Y + 6, STRIKER_STUMPS_Z - 90)
    // Stump-cam: on the ball's line, raised just enough to see the delivery coming over the
    // batter's helmet and down into the gap between his bat and front pad.
    const back = aspect < 0.9 ? 62 : 48
    frame.stumpView.set(PITCH_X + 1.2, PITCH_Y + 25, STRIKER_STUMPS_Z + back)
    frame.stumpAim.set(PITCH_X + 0.6, PITCH_Y + 1, STRIKER_STUMPS_Z - 45)
  }

  // Scratch objects, reused every frame.
  const ballPosition = new THREE.Vector3()
  const orientation = new THREE.Quaternion()
  const flight = new THREE.Quaternion()
  const blend = new THREE.Quaternion()
  const tumble = new THREE.Quaternion()
  const aim = new THREE.Vector3()
  const look = new THREE.Vector3()
  const direction = new THREE.Vector3()
  const lightDirection = new THREE.Vector3()
  const lightTarget = new THREE.Vector3()

  function update(dt, time, isOwner) {
    if (!isOwner) return
    const { u } = state
    const pull = ease.inOut(segment(u, ...PULL_BACK))
    const s = segment(u, U_RELEASE, U_IMPACT) // flight
    const drift = segment(u, ...DRIFT)
    const freeze = ease.soft(segment(u, ...FREEZE))

    // --- Bowler: frozen mid-leap through the pull-back, then the delivery, then the celebration ---
    const action =
      u < ACTION[0]
        ? lerp(0, FROZEN_DRIFT, segment(u, ...PULL_BACK))
        : lerp(FROZEN_DRIFT, 1, segment(u, ...ACTION))
    bowler.pose(action, ease.inOut(segment(u, ...CELEBRATE)))

    // --- Batter: stance (frozen with everything else), backlift as the bowler gathers, forward
    // defence planted before the ball arrives, then a look back at the broken wicket ---
    const shot = u < U_RELEASE ? lerp(0, 0.4, segment(u, ACTION[0], U_RELEASE)) : lerp(0.4, 1, ease.soft(segment(s, 0.1, 0.8)))
    batter.pose(shot, ease.inOut(segment(u, U_IMPACT + 0.02, U_IMPACT + 0.12)))

    // --- Ball: in his hand, then in flight, then deflected off the stumps into the lens ---
    bowlingOrientation(s, flight)
    if (u < U_RELEASE) {
      bowler.ballPosition(ballPosition)
      // Turn from the hero's close-up pose into the bowler's grip during the pull-back.
      orientation.slerpQuaternions(closeUpOrientation(time, blend), flight, ease.soft(segment(u, 0.04, 0.3)))
    } else if (u < U_IMPACT) {
      deliveryPath(s, ballPosition)
      orientation.copy(flight)
    } else {
      ballPosition.lerpVectors(IMPACT_POINT, CATCH_POINT, ease.out(drift))
      ballPosition.y += Math.sin(drift * Math.PI) * 1.5
      tumble.setFromAxisAngle(TUMBLE_AXIS, ease.out(drift) * 9)
      orientation.multiplyQuaternions(flight, tumble)
      if (freeze > 0) orientation.slerp(presentOrientation(time, blend), freeze)
    }
    const shrink = ease.soft(segment(u, 0.02, 0.14))
    const grow = ease.soft(segment(u, U_IMPACT + 0.04, DRIFT[1]))
    ball.object.position.copy(ballPosition)
    ball.object.quaternion.copy(orientation)
    ball.object.scale.setScalar(lerp(lerp(1, BALL_IN_PLAY, shrink), 1, grow))
    ball.object.visible = true
    ball.castShadows(true) // its shadow racing it down the pitch sells the height

    // --- The wicket breaks on impact ---
    breakWicket(wicket, segment(u, ...STUMPS_FLY) * 1.4)

    // --- Camera: dolly back to the keeper's-eye view, hold through the delivery, then come down
    // with the deflected ball into the hand-off pose ---
    const startDistance = BALL_RADIUS + frame.closeUp
    const endDistance = frame.strikerView.length()
    direction.copy(Z_AXIS).lerp(aim.copy(frame.strikerView).normalize(), pull).normalize()
    camera.position.copy(direction).multiplyScalar(logLerp(startDistance, endDistance, pull))
    // Once the ball is out of the hand, glide down onto its line behind the stumps.
    const toStumps = ease.inOut(segment(u, U_RELEASE, lerp(U_RELEASE, U_IMPACT, 0.65)))
    camera.position.lerp(frame.stumpView, toStumps)
    const intoLens = ease.inOut(segment(u, U_IMPACT + 0.02, DRIFT[1]))
    camera.position.lerp(frame.catchCamera, intoLens)

    // Hold the ball centred while pulling back, settle on the wide striker's-end framing for the
    // run-up, look down the line through the gate, then follow the deflected ball into the lens.
    const holdBall = 1 - ease.soft(segment(u, 0.2, PULL_BACK[1]))
    aim.lerpVectors(frame.strikerAim, frame.stumpAim, toStumps)
    look.lerpVectors(aim, ballPosition, Math.max(holdBall, intoLens))
    camera.lookAt(look)

    const toBall = camera.position.distanceTo(ballPosition)
    const fov = lerp(lerp(lerp(SEAM_CLOSE_UP.fov, STRIKER_FOV, pull), STUMP_FOV, toStumps), STORY_FOV, intoLens)
    rig.lens(fov, clamp(toBall * 0.02, 0.01, 1), 1400)

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
    const visibility = ease.soft(segment(u, 0.08, 0.34)) * (1 - ease.soft(segment(u, FREEZE[0], 0.96)))
    fade.uFade.value = visibility
    mark.material.opacity = segment(s, S_BOUNCE, S_BOUNCE + 0.04) * 0.75 * visibility

    // Trail: follows the ball in flight, then snaps into it as it hits the stumps.
    const collapse = segment(u, U_IMPACT, U_IMPACT + 0.03)
    trail.update(s, Math.max(0, s - TRAIL_LENGTH * (1 - collapse)), camera.position, visibility)
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
  const behind = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const toCamera = new THREE.Vector3()
  const side = new THREE.Vector3()
  const head = new THREE.Color(0xb3261e)
  const tail = new THREE.Color(0xf2efe8)
  const color = new THREE.Color()

  function update(sHead, sTail, cameraPosition, opacity) {
    mesh.visible = sHead > 0 && sHead - sTail > 0.002
    if (!mesh.visible) return

    for (let i = 0; i < TRAIL_POINTS; i++) {
      const k = i / (TRAIL_POINTS - 1) // 0 = tail, 1 = head
      const s = lerp(sTail, sHead, k)
      deliveryPath(s, point)
      deliveryPath(Math.min(s + 0.001, 1), ahead)
      deliveryPath(Math.max(s - 0.001, 0), behind)
      tangent.subVectors(ahead, behind).normalize()
      toCamera.subVectors(cameraPosition, point)
      side.crossVectors(tangent, toCamera).normalize().multiplyScalar(BALL_R * 0.82 * k ** 0.7)

      positions.set([point.x + side.x, point.y + side.y, point.z + side.z], i * 6)
      positions.set([point.x - side.x, point.y - side.y, point.z - side.z], i * 6 + 3)

      color.lerpColors(tail, head, k)
      const alpha = k ** 1.6 * 0.5 * opacity
      colors.set([color.r, color.g, color.b, alpha, color.r, color.g, color.b, alpha], i * 8)
    }
    geometry.attributes.position.needsUpdate = true
    geometry.attributes.color.needsUpdate = true
  }

  return { mesh, update }
}
