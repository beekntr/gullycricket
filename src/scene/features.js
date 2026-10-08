import * as THREE from 'three'
import { REST_ROTATION } from './phone.js'
import { CATCH_POINT, catchDistance, phoneRestOffset, STORY_FOV, studioLight } from './story.js'
import { canvasTexture, createCanvas, FONT_DISPLAY, painter } from './utils/canvas.js'
import { ease, nextIdle, segment } from './utils/timing.js'

/*
 * Chapter 4 — FEATURES, three pinned steps.
 * The phone turns to a new pose for each step while its screen wipes to the matching app screen,
 * and a 3D accent plays around it:
 *   (a) Build your XI   — eleven player cards fan out behind the phone
 *   (b) Live points     — points chips fly out of the screen as the balls are bowled
 *   (c) Join contests   — a trophy rises in front of the phone
 * Ends with everything sinking into darkness, ready for the stadium.
 */

const { lerp } = THREE.MathUtils
const euler = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z))

// Step timings in chapter progress u: [turn starts, turn ends]. Text in animations/features.js matches.
export const FEATURE_STEPS = [
  [0.2, 0.3],
  [0.44, 0.52],
  [0.67, 0.75],
]
const EXIT = [0.92, 1]

// Phone pose per step, offset from the rest pose.
const POSES = [
  { offset: new THREE.Vector3(0, 0, 0), rotation: euler(0.06, -0.44, 0.03) },
  { offset: new THREE.Vector3(0.2, 0, 0.2), rotation: euler(-0.06, 0.36, -0.03) },
  { offset: new THREE.Vector3(0, 0.15, 0.6), rotation: euler(0.1, -0.14, 0) },
]
const EXIT_POSE = { offset: new THREE.Vector3(0, -11, -3), rotation: euler(0.7, -0.8, 0.2) }

const PLAYERS = [
  ['KV', 'K. Varma', 'BAT', '9.5'],
  ['LB', 'L. Brooks', 'BAT', '9.0'],
  ['RN', 'R. Nair', 'BAT', '8.5'],
  ['DF', 'D. Fischer', 'BAT', '8.0'],
  ['AH', 'A. Haddad', 'AR', '9.0'],
  ['NO', 'N. Desai', 'WK', '8.5'],
  ['TL', 'T. Lindqvist', 'AR', '8.0'],
  ['MO', 'M. Okafor', 'BOWL', '8.5'],
  ['PR', 'P. Rana', 'BOWL', '8.0'],
  ['SK', 'S. Kaur', 'BOWL', '7.5'],
  ['JW', 'J. Wells', 'BOWL', '7.0'],
]
const CHIPS = [
  { label: '+4', caption: 'FOUR', fill: '#F2EFE8', ink: '#0B0B0A', edge: 0xd9d4c8 },
  { label: '+8', caption: 'SIX', fill: '#F2EFE8', ink: '#0B0B0A', edge: 0xd9d4c8 },
  { label: '+25', caption: 'WICKET', fill: '#B3261E', ink: '#F2EFE8', edge: 0x8f1e18 },
  { label: '+1', caption: 'DOT BALL', fill: '#1F3B2C', ink: '#F2EFE8', edge: 0x1a3226 },
]
// Where each chip settles, relative to the phone's rest position (x scaled to fit the screen).
const CHIP_SPOTS = [
  new THREE.Vector3(-2.9, 2.3, 1.2),
  new THREE.Vector3(2.8, 1.3, 0.9),
  new THREE.Vector3(-2.6, -1.0, 1.4),
  new THREE.Vector3(2.9, -2.3, 0.8),
]

const CARD = { width: 1.45, height: 2, columns: 4, rows: 3, pixelWidth: 256, pixelHeight: 352 }

/** Eleven player cards in one atlas texture. */
function drawCardAtlas(renderer) {
  const { canvas, ctx } = createCanvas(CARD.pixelWidth * CARD.columns, CARD.pixelHeight * CARD.rows)
  const p = painter(ctx)
  PLAYERS.forEach(([initials, name, role, credits], i) => {
    const x = (i % CARD.columns) * CARD.pixelWidth
    const y = Math.floor(i / CARD.columns) * CARD.pixelHeight
    const w = CARD.pixelWidth
    const h = CARD.pixelHeight
    p.rect(x + 4, y + 4, w - 8, h - 8, 26, i % 3 === 0 ? '#1F3B2C' : '#1A1A18')
    p.stroke(x + 4, y + 4, w - 8, h - 8, 26, 'rgba(242,239,232,0.14)', 2)
    p.text(role, x + 26, y + 50, { size: 22, weight: 800, color: 'rgba(242,239,232,0.7)', tracking: 2 })
    p.text(credits, x + w - 26, y + 50, { size: 26, weight: 800, align: 'right' })
    p.circle(x + w / 2, y + 160, 64, 'rgba(242,239,232,0.1)')
    p.text(initials, x + w / 2, y + 190, { size: 82, family: FONT_DISPLAY, weight: 400, align: 'center' })
    p.text(name, x + w / 2, y + 282, { size: 26, weight: 700, align: 'center' })
    p.text(i < 5 ? 'IND' : 'AUS', x + w / 2, y + 316, { size: 18, weight: 600, color: 'rgba(242,239,232,0.55)', align: 'center', tracking: 2 })
    if (i === 0) {
      p.circle(x + w - 40, y + 96, 20, '#B3261E')
      p.text('C', x + w - 40, y + 104, { size: 22, weight: 800, align: 'center' })
    }
  })
  return canvasTexture(canvas, renderer)
}

function drawChip(renderer, { label, caption, fill, ink }) {
  const { canvas, ctx } = createCanvas(256, 256)
  const p = painter(ctx)
  ctx.fillStyle = fill
  ctx.fillRect(0, 0, 256, 256)
  p.text(label, 128, 150, { size: 104, family: FONT_DISPLAY, weight: 400, color: ink, align: 'center' })
  p.text(caption, 128, 196, { size: 22, weight: 800, color: ink, align: 'center', tracking: 3 })
  return canvasTexture(canvas, renderer)
}

/** A brushed-silver cup on a dark plinth with a thin red band. */
function createTrophy() {
  const silver = new THREE.MeshPhysicalMaterial({ color: 0xdcd8cf, metalness: 1, roughness: 0.2, fog: false })
  const plinthMaterial = new THREE.MeshStandardMaterial({ color: 0x151514, roughness: 0.45, fog: false })
  const band = new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.4, fog: false })

  const profile = [
    [0, 0.7], [0.62, 0.7], [0.66, 0.78], [0.5, 0.86], [0.2, 1.05], [0.16, 1.7], [0.3, 1.82], [0.18, 1.95],
    [0.3, 2.1], [0.78, 2.45], [1.02, 2.95], [1.12, 3.55], [1.18, 3.62], [1.1, 3.64], [1.0, 3.1], [0, 2.75],
  ].map(([r, y]) => new THREE.Vector2(r, y))
  const cup = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), silver)

  const handleGeometry = new THREE.TorusGeometry(0.42, 0.06, 12, 32, Math.PI * 1.1)
  const handles = [-1, 1].map((side) => {
    const handle = new THREE.Mesh(handleGeometry, silver)
    handle.position.set(side * 1.05, 3.0, 0)
    // The arc opens towards the cup on each side.
    handle.rotation.z = side > 0 ? -Math.PI * 0.55 : Math.PI * 0.45
    return handle
  })

  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, 0.7, 48), plinthMaterial)
  plinth.position.y = 0.35
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.885, 0.895, 0.08, 48), band)
  stripe.position.y = 0.5

  const trophy = new THREE.Group()
  trophy.add(cup, ...handles, plinth, stripe)
  trophy.traverse((child) => {
    child.castShadow = true
  })
  return trophy
}

export function createFeaturesScene({ stage, rig, ball, props }) {
  const camera = stage.camera
  const state = { u: 0 }
  const frame = { distance: 24, rest: new THREE.Vector3(), restRotation: REST_ROTATION.landscape, spread: 1, portrait: false }
  let device = null
  let cards = []
  let chips = []
  let trophy = null

  const section = { id: 'features', state, group: null, load, unmount, resize, update }

  async function load() {
    device = await props.acquire('device')
    const group = new THREE.Group()
    group.name = 'features'
    const { renderer } = stage

    // (a) Player cards: one plane each, UVs pointed at their cell in the atlas.
    const atlas = drawCardAtlas(renderer)
    const cardMaterial = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.55, side: THREE.DoubleSide, fog: false })
    cards = PLAYERS.map((_, i) => {
      const geometry = new THREE.PlaneGeometry(CARD.width, CARD.height)
      const column = i % CARD.columns
      const row = Math.floor(i / CARD.columns)
      const uv = geometry.attributes.uv
      for (let v = 0; v < uv.count; v++) {
        uv.setXY(v, (column + uv.getX(v)) / CARD.columns, 1 - (row + 1 - uv.getY(v)) / CARD.rows)
      }
      const card = new THREE.Mesh(geometry, cardMaterial)
      card.castShadow = true
      group.add(card)
      return card
    })
    await nextIdle()

    // (b) Points chips: a short cylinder with a printed face.
    const chipBody = new THREE.CylinderGeometry(0.62, 0.62, 0.12, 48).rotateX(Math.PI / 2)
    const chipFace = new THREE.CircleGeometry(0.6, 48)
    chips = CHIPS.map((chip) => {
      const coin = new THREE.Group()
      const body = new THREE.Mesh(chipBody, new THREE.MeshStandardMaterial({ color: chip.edge, roughness: 0.35, fog: false }))
      const face = new THREE.Mesh(chipFace, new THREE.MeshStandardMaterial({ map: drawChip(renderer, chip), roughness: 0.4, fog: false }))
      face.position.z = 0.062
      body.castShadow = true
      coin.add(body, face)
      group.add(coin)
      return coin
    })
    await nextIdle()

    // (c) Trophy.
    trophy = createTrophy()
    group.add(trophy)

    section.group = group
  }

  function unmount() {
    props.release('device')
    device = null
    cards = []
    chips = []
    trophy = null
  }

  function resize({ aspect }) {
    frame.distance = catchDistance(aspect)
    phoneRestOffset(aspect, frame.rest)
    frame.portrait = aspect < 0.9
    frame.restRotation = frame.portrait ? REST_ROTATION.portrait : REST_ROTATION.landscape
    // How far the accents can spread sideways from the phone and stay on screen.
    const halfWidth = frame.distance * Math.tan(THREE.MathUtils.degToRad(STORY_FOV / 2)) * aspect
    frame.spread = THREE.MathUtils.clamp((halfWidth - Math.abs(frame.rest.x)) / 4.4, 0.55, 1)
  }

  // Scratch.
  const rest = new THREE.Vector3()
  const position = new THREE.Vector3()
  const rotation = new THREE.Quaternion()
  const from = new THREE.Vector3()
  const to = new THREE.Vector3()
  const yAxisTurn = new THREE.Euler()

  function update(dt, time, isOwner) {
    if (!isOwner || !device) return
    const { u } = state
    const steps = FEATURE_STEPS.map(([a, b]) => ease.inOut(segment(u, a, b)))
    const exit = ease.in(segment(u, ...EXIT))

    rig.lens(STORY_FOV, 0.1, 400)
    camera.position.set(CATCH_POINT.x, CATCH_POINT.y, CATCH_POINT.z + frame.distance)
    camera.lookAt(CATCH_POINT)
    studioLight(rig, CATCH_POINT, 1 - exit)
    ball.object.visible = false

    // --- Phone: rest → pose a → b → c → sink away ---
    rest.copy(CATCH_POINT).add(frame.rest)
    position.copy(rest)
    rotation.copy(frame.restRotation)
    POSES.forEach((pose, i) => {
      position.lerp(to.copy(rest).add(pose.offset), steps[i])
      rotation.slerp(pose.rotation, steps[i])
    })
    position.lerp(to.copy(rest).add(EXIT_POSE.offset), exit)
    rotation.slerp(EXIT_POSE.rotation, exit)
    device.object.position.copy(position)
    device.object.quaternion.copy(rotation)
    device.object.visible = true

    device.screen.show(steps[0] + steps[1] + steps[2]) // home → team → live → contests
    device.screen.power(1 - ease.soft(segment(u, 0.93, 0.99)))
    device.screen.ripple(0)

    // --- (a) Cards fan out behind the phone, then gather back ---
    const fan = segment(u, 0.24, 0.44) * (1 - ease.inOut(segment(u, 0.44, 0.5)))
    const fanCenter = to.copy(rest).add(from.set(0, -3.2, -1.5))
    const radius = 5.6 * frame.spread
    cards.forEach((card, i) => {
      const local = ease.out(segment(fan, i * 0.035, i * 0.035 + 0.62))
      const angle = lerp(-1.05, 1.05, i / (cards.length - 1))
      from.copy(rest).add(position.set(0, 0, -0.7))
      position.set(Math.sin(angle) * radius, Math.cos(angle) * radius, -0.06 * Math.abs(i - 5)).add(fanCenter)
      card.position.lerpVectors(from, position, local)
      card.rotation.set(0, lerp(0, -angle * 0.25, local), -angle * local)
      card.scale.setScalar(lerp(0.5, 1, local))
      card.visible = local > 0.001
    })

    // --- (b) Chips fly out of the top of the screen and settle around it ---
    const chipsIn = segment(u, 0.5, 0.68) * (1 - ease.inOut(segment(u, 0.67, 0.72)))
    chips.forEach((chip, i) => {
      const local = ease.out(segment(chipsIn, i * 0.16, i * 0.16 + 0.52))
      from.copy(rest).add(position.set(0, 2.6, 0.4))
      to.copy(CHIP_SPOTS[i]).multiply(position.set(frame.spread, frame.portrait ? 0.8 : 1, 1)).add(rest)
      chip.position.lerpVectors(from, to, local)
      chip.position.y += Math.sin(local * Math.PI) * 1.2 + Math.sin(time * 0.9 + i) * 0.06 * local
      chip.rotation.copy(yAxisTurn.set(Math.sin(time * 0.7 + i) * 0.12, (1 - local) * Math.PI * 2.5, Math.sin(time * 0.5 + i * 2) * 0.08))
      chip.scale.setScalar(Math.max(local, 1e-4))
      chip.visible = local > 0.001
    })

    // --- (c) Trophy rises in front of the phone ---
    const cup = ease.out(segment(u, 0.72, 0.88))
    const trophyLevel = cup * (1 - exit)
    to.copy(rest).add(position.set(frame.portrait ? -1.4 : -2.4 * frame.spread, frame.portrait ? -3.1 : -2.3, 1.7))
    trophy.position.copy(to)
    trophy.position.y -= (1 - cup) * 7 + exit * 9
    trophy.rotation.y = (1 - cup) * -2.4 + time * 0.15
    trophy.scale.setScalar(lerp(0.6, frame.portrait ? 0.68 : 0.8, cup))
    trophy.visible = trophyLevel > 0.001
  }

  return section
}
