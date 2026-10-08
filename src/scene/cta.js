import * as THREE from 'three'
import { CHALK, CTA_ORIGIN, STORY_FOV } from './story.js'

/*
 * Chapter 6 — CTA.
 * A calm product shot on chalk: the phone floating over its soft shadow, the ball resting beside
 * it. Reached through a cut hidden behind the chalk panel that slides up over the stadium.
 */

const LIGHT_DIRECTION = new THREE.Vector3(-0.45, 1, 0.4).normalize()
const PHONE_ROTATION = new THREE.Euler(0, -0.42, 0.05)
const BALL_ROTATION = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35, 0.9, 1.25))

export function createCtaScene({ stage, rig, ball, props, reducedMotion }) {
  const camera = stage.camera
  const state = { u: 0, releasedAt: () => Infinity }
  const frame = { distance: 26, shiftX: 0, shiftY: 0, unitsPerPixel: 0 }
  let device = null

  const section = { id: 'cta', state, group: null, load, unmount, resize, update }

  async function load() {
    device = await props.acquire('device')
    const group = new THREE.Group()
    group.name = 'cta'
    // An invisible floor that only shows the shadows falling on it.
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.ShadowMaterial({ opacity: 0.13, fog: false }),
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.copy(CTA_ORIGIN)
    floor.receiveShadow = true
    group.add(floor)
    section.group = group
  }

  function unmount() {
    props.release('device')
    device = null
  }

  function resize({ aspect }) {
    const tanHalf = Math.tan(THREE.MathUtils.degToRad(STORY_FOV / 2))
    const portrait = aspect < 0.9
    // Fit the ~6-unit-wide product: beside the copy on wide screens, above it on tall ones.
    frame.distance = portrait ? Math.max(26, 3.6 / (aspect * tanHalf)) : 26
    const halfHeight = frame.distance * tanHalf
    frame.shiftX = portrait ? 0 : halfHeight * aspect * 0.42
    frame.shiftY = portrait ? halfHeight * 0.36 : 0
    frame.unitsPerPixel = (halfHeight * 2) / window.innerHeight
  }

  const look = new THREE.Vector3()

  function update(dt, time, isOwner) {
    if (!isOwner || !device) return
    const t = reducedMotion ? 0 : time
    const { u } = state

    rig.background(CHALK)
    rig.fog(1e4, 2e4)
    rig.environment(0.9, 0.4)
    rig.light({
      target: look.copy(CTA_ORIGIN).setY(2),
      direction: LIGHT_DIRECTION,
      intensity: 2.4,
      extent: 9,
      distance: 40,
      softness: 10,
    })

    // A slow drift in as the chapter scrolls, the product held off-centre beside the copy.
    // After the pin releases, the camera tracks the page so the product scrolls away with its copy.
    rig.lens(STORY_FOV, 0.1, 300)
    const distance = frame.distance * (1.06 - u * 0.06)
    const scrolled = Math.max(0, window.scrollY - state.releasedAt()) * frame.unitsPerPixel
    const y = -frame.shiftY - scrolled
    camera.position.set(CTA_ORIGIN.x - frame.shiftX, 5.4 + y, CTA_ORIGIN.z + distance)
    look.set(CTA_ORIGIN.x - frame.shiftX, 3.5 + y, CTA_ORIGIN.z)
    camera.lookAt(look)

    device.object.position.set(CTA_ORIGIN.x + 0.8, 4.1 + Math.sin(t * 0.8) * 0.06, CTA_ORIGIN.z)
    device.object.rotation.set(PHONE_ROTATION.x, PHONE_ROTATION.y + Math.sin(t * 0.35) * 0.08, PHONE_ROTATION.z)
    device.object.visible = true
    device.screen.show(0)
    device.screen.power(1)
    device.screen.ripple(0)

    ball.object.position.set(CTA_ORIGIN.x - 2.3, 1, CTA_ORIGIN.z + 1.6)
    ball.object.quaternion.copy(BALL_ROTATION)
    ball.object.scale.setScalar(1)
    ball.object.visible = true
    ball.castShadows(true)
  }

  return section
}
