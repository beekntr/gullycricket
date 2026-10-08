import * as THREE from 'three'
import { INK, STADIUM_ORIGIN } from './story.js'
import { canvasTexture, createCanvas } from './utils/canvas.js'
import { createFloodUniforms, makeFloodlit } from './utils/floodlit.js'
import { ease, logLerp, nextIdle, segment } from './utils/timing.js'

/*
 * Chapter 5 — STADIUM / SCALE.
 * Out of the dark, a ground at night: four floodlight towers flick on one by one while the camera
 * rises from the boundary to high over the bowl. Low-poly and flat-shaded. The floodlights are
 * shader-only (utils/floodlit.js), so switching them on never recompiles anything.
 * Mobile gets the field, towers and lights, without the stands and crowd.
 */

const { lerp } = THREE.MathUtils

const FIELD_RADIUS = 62
const STRETCH = 1.16 // grounds are oval: x is stretched
const TOWER_ANGLES = [0.25, 0.75, 1.25, 1.75].map((turn) => turn * Math.PI)
const TOWER_RADIUS = 108
const TOWER_HEIGHT = 64
const STAND_GAP = 0.24 // radians left open around each tower
const LAMP_ON_AT = [0.31, 0.41, 0.51, 0.61] // chapter progress at which each tower switches on
const LAMP_POWER = 3.2

/** A lamp coming on: a strike, a stutter, then steady. Deterministic in scroll position. */
function flicker(x) {
  if (x <= 0) return 0
  if (x < 0.12) return 1
  if (x < 0.26) return 0.08
  if (x < 0.5) return 1
  if (x < 0.6) return 0.45
  return 1
}

const ellipse = (radius, angle, y, out) => out.set(radius * Math.sin(angle) * STRETCH, y, radius * Math.cos(angle))

function drawField(renderer) {
  const size = 1024
  const { canvas, ctx } = createCanvas(size, size)
  const scale = size / 2 / FIELD_RADIUS
  ctx.fillStyle = '#1f3b2c'
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#24432f'
  for (let x = 0; x < size; x += 64) ctx.fillRect(x, 0, 32, size)

  ctx.translate(size / 2, size / 2)
  // Thirty-yard circle, dashed.
  ctx.strokeStyle = 'rgba(242,239,232,0.45)'
  ctx.lineWidth = 3
  ctx.setLineDash([14, 12])
  ctx.beginPath()
  ctx.arc(0, 0, 24 * scale, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  // The square and the pitch.
  ctx.fillStyle = 'rgba(214,206,178,0.08)'
  ctx.fillRect(-9 * scale, -12 * scale, 18 * scale, 24 * scale)
  ctx.fillStyle = '#5b6a52'
  ctx.fillRect(-1.4 * scale, -9 * scale, 2.8 * scale, 18 * scale)
  ctx.fillStyle = 'rgba(242,239,232,0.85)'
  for (const z of [-7.6, 7.6]) ctx.fillRect(-1.6 * scale, z * scale - 1, 3.2 * scale, 2)
  return canvasTexture(canvas, renderer, 16)
}

function drawLampGrid(renderer) {
  const { canvas, ctx } = createCanvas(512, 320)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, 512, 320)
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 6; column++) {
      ctx.beginPath()
      ctx.arc(52 + column * 82, 46 + row * 76, 30, 0, Math.PI * 2)
      ctx.fillStyle = '#fff7ea'
      ctx.fill()
    }
  }
  return canvasTexture(canvas, renderer)
}

/** Raked seating as a lathed profile: a wall, ten steps of terracing, a back wall. */
function standProfile() {
  const points = [
    [64, 0],
    [64, 1.8],
    [66.5, 1.8],
  ]
  for (let i = 0; i < 10; i++) {
    const r = 66.5 + i * 3.3
    const y = 1.8 + (i + 1) * 2.3
    points.push([r, y], [r + 3.3, y])
  }
  points.push([99.5, 31], [101, 31], [101, 0])
  return points.map(([r, y]) => new THREE.Vector2(r, y))
}

export function createStadiumScene({ stage, rig, quality }) {
  const camera = stage.camera
  const state = { u: 0 }
  const flood = createFloodUniforms(TOWER_ANGLES.length)
  flood.uLampPower.value = LAMP_POWER
  let lampMaterials = []

  const frame = { shift: 0, reach: 1 }
  const section = { id: 'stadium', state, group: null, load, resize, update }

  function resize({ aspect }) {
    // On wide screens the final aerial sits right of centre, leaving dark sky behind the copy.
    frame.shift = aspect > 0.9 ? 38 : 0
    // Tall screens pull further back so the whole ground fits across the width.
    frame.reach = Math.max(1, 1.1 / aspect)
  }

  async function load() {
    const group = new THREE.Group()
    group.name = 'stadium'
    group.position.copy(STADIUM_ORIGIN)
    const { renderer } = stage
    const lit = (parameters) => makeFloodlit(new THREE.MeshStandardMaterial(parameters), flood)
    const full = quality.shaderDetail // desktop gets the whole bowl

    const field = new THREE.Mesh(new THREE.CircleGeometry(FIELD_RADIUS, 72), lit({ map: drawField(renderer), roughness: 1 }))
    field.rotation.x = -Math.PI / 2
    field.scale.x = STRETCH

    const rope = new THREE.Mesh(new THREE.RingGeometry(FIELD_RADIUS - 0.7, FIELD_RADIUS, 96), lit({ color: 0xe9e4d8, roughness: 0.8 }))
    rope.rotation.x = -Math.PI / 2
    rope.scale.x = STRETCH
    rope.position.y = 0.05

    const apron = new THREE.Mesh(new THREE.RingGeometry(FIELD_RADIUS, 140, 72), lit({ color: 0x1a1a18, roughness: 1 }))
    apron.rotation.x = -Math.PI / 2
    apron.scale.x = STRETCH
    apron.position.y = -0.02

    group.add(field, rope, apron)

    if (full) {
      // Sightscreens at both ends of the pitch.
      const screenMaterial = lit({ color: 0xe9e4d8, roughness: 0.85, flatShading: true })
      for (const z of [-FIELD_RADIUS - 1.5, FIELD_RADIUS + 1.5]) {
        const sightscreen = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 0.8), screenMaterial)
        sightscreen.position.set(0, 3, z)
        group.add(sightscreen)
      }
    }
    await nextIdle()

    // Floodlight towers: a square tapered pylon and a lamp head aimed at the middle.
    const pylonMaterial = lit({ color: 0x3a3a38, roughness: 0.6, flatShading: true })
    const headMaterial = lit({ color: 0x232322, roughness: 0.6, flatShading: true })
    const lampGrid = drawLampGrid(renderer)
    const pylonGeometry = new THREE.CylinderGeometry(0.9, 2.6, TOWER_HEIGHT, 4, 1).rotateY(Math.PI / 4)
    const aim = new THREE.Vector3(0, -12, 0)
    lampMaterials = TOWER_ANGLES.map((angle, i) => {
      const base = ellipse(TOWER_RADIUS, angle, 0, new THREE.Vector3())
      const pylon = new THREE.Mesh(pylonGeometry, pylonMaterial)
      pylon.position.copy(base).setY(TOWER_HEIGHT / 2)

      const head = new THREE.Group()
      head.position.copy(base).setY(TOWER_HEIGHT + 4)
      head.lookAt(aim)
      const frame = new THREE.Mesh(new THREE.BoxGeometry(16, 10, 1.4), headMaterial)
      const lampMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111,
        emissive: 0xffffff,
        emissiveMap: lampGrid,
        emissiveIntensity: 0,
        roughness: 0.4,
      })
      const lamps = new THREE.Mesh(new THREE.PlaneGeometry(15, 9), lampMaterial)
      lamps.position.z = 0.75
      head.add(frame, lamps)

      flood.uLampPosition.value[i].copy(head.position).add(STADIUM_ORIGIN)
      group.add(pylon, head)
      return lampMaterial
    })

    if (full) {
      await nextIdle()
      // Stands and roofs, in four sections between the towers.
      const standMaterial = lit({ color: 0x2b2b29, roughness: 0.85, flatShading: true, side: THREE.DoubleSide })
      const roofMaterial = lit({ color: 0x1d1d1c, roughness: 0.7, flatShading: true, side: THREE.DoubleSide })
      const profile = standProfile()
      const roofProfile = [new THREE.Vector2(102, 33), new THREE.Vector2(86, 37.5)]
      const spans = TOWER_ANGLES.map((angle) => [angle + STAND_GAP / 2, Math.PI / 2 - STAND_GAP])
      for (const [start, length] of spans) {
        const stand = new THREE.Mesh(new THREE.LatheGeometry(profile, 14, start, length), standMaterial)
        const roof = new THREE.Mesh(new THREE.LatheGeometry(roofProfile, 14, start, length), roofMaterial)
        stand.scale.x = roof.scale.x = STRETCH
        group.add(stand, roof)
      }
      await nextIdle()

      // The crowd: one instanced box per seat taken.
      const seats = []
      for (const [start, length] of spans) {
        for (let tier = 0; tier < 10; tier++) {
          const r = 66.5 + tier * 3.3 + 1.65
          const y = 1.8 + (tier + 1) * 2.3 + 0.55
          const count = Math.floor((r * length) / 1.25)
          for (let k = 0; k < count; k++) {
            if (Math.random() < 0.12) continue // empty seats
            seats.push([start + ((k + 0.5) / count) * length, r, y])
          }
        }
      }
      // Muted so the crowd reads as texture behind the copy, not confetti.
      const palette = [0x9d978a, 0x8a8577, 0x7a1e18, 0x1f3b2c, 0x3a3a36, 0x5d5a53, 0x6b6a63].map((hex) => new THREE.Color(hex))
      const crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.85, 1.1, 0.75), lit({ roughness: 0.9 }), seats.length)
      const matrix = new THREE.Matrix4()
      const position = new THREE.Vector3()
      const rotation = new THREE.Quaternion()
      const scale = new THREE.Vector3()
      const up = new THREE.Vector3(0, 1, 0)
      seats.forEach(([angle, r, y], i) => {
        ellipse(r, angle, y, position)
        rotation.setFromAxisAngle(up, angle)
        scale.set(1, 0.85 + Math.random() * 0.35, 1)
        crowd.setMatrixAt(i, matrix.compose(position, rotation, scale))
        crowd.setColorAt(i, palette[Math.floor(Math.random() * palette.length)])
      })
      crowd.computeBoundingSphere()
      group.add(crowd)
    }

    section.group = group
  }

  // Scratch.
  const center = new THREE.Vector3()
  const look = new THREE.Vector3()
  const moonDirection = new THREE.Vector3(0.3, 1, -0.5).normalize()

  function update(dt, time, isOwner) {
    if (!isOwner) return
    const { u } = state

    // --- Lights: moonlight first, then the towers one by one ---
    const moon = ease.soft(segment(u, 0, 0.12))
    LAMP_ON_AT.forEach((at, i) => {
      const level = flicker((u - at) / 0.05)
      flood.uLampLevel.value[i] = level
      lampMaterials[i].emissiveIntensity = level * 2.6
    })
    rig.light({
      target: center.copy(STADIUM_ORIGIN),
      direction: moonDirection,
      intensity: 0.55 * moon,
      color: 0xa9b8cf,
      extent: 160,
      distance: 400,
    })
    rig.environment(0.05 * moon, 0)
    // Start fully fogged (pure background) so the cut in from the features chapter is invisible.
    rig.fog(lerp(0, 220, moon), lerp(1, 820, moon))
    rig.background(INK)

    // --- Camera: from the boundary rope up and over the bowl ---
    // It stays between two towers, and climbs before it pulls out so it clears the stands.
    const rise = ease.inOut(segment(u, 0.06, 1))
    const azimuth = lerp(-0.22, 0.3, rise)
    const radius = logLerp(57, 175 * frame.reach, rise * rise)
    const height = logLerp(3.2, 190 * frame.reach, rise)
    camera.position.set(Math.sin(azimuth) * radius * STRETCH, height, Math.cos(azimuth) * radius).add(STADIUM_ORIGIN)
    const shift = frame.shift * rise
    look.set(-Math.cos(azimuth) * shift, lerp(14, 0, rise), Math.sin(azimuth) * shift).add(STADIUM_ORIGIN)
    camera.lookAt(look)
    rig.lens(lerp(42, 34, rise), 0.5, 1600)
  }

  return section
}
