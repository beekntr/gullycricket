import * as THREE from 'three'
import { applyPose, blendPose, buildSkeleton, D, dressBody, limb, POSE_SIZE, solveKeys, splineKeys } from './figure.js'

/*
 * A stylised right-handed batter: pads, gloves, helmet and bat. He waits in his stance, picks up
 * his backlift as the bowler gathers, plants a forward defence, is beaten between bat and pad, and
 * looks back at his stumps. Built on figure.js (see there for angle conventions).
 *
 * The scene turns him a quarter turn so his left shoulder points down the pitch, which makes his
 * local +X "towards the bowler" and his local +Z the off side he faces.
 */

const BAT = { handle: 3.3, blade: 6.2, width: 1.15, depth: 0.55, grip: 1.5 } // grip: handle above the bottom hand

/*
 * Each pose's `extra` is the bat, in his own frame: the direction from handle to toe, then the way
 * the face points. The handle is held in the bottom (right) hand wherever the arms put it.
 */
const STANCE = {
  root: [0, 0, 0],
  plant: 'R',
  extra: [-0.15, -1, 0.05, 0.6, 0, 0.8], // grounded by the back toe, face open
  joints: {
    spine: [0.42, 0, 0],
    chest: [0.05, 0.2, 0],
    neck: [-0.35, 1.15, 0],
    shoulderR: [-0.35, 0, 0.55],
    elbowR: [-0.4, 0, 0],
    shoulderL: [-0.4, 0, -0.25],
    elbowL: [-0.5, 0, 0],
    hipL: [-0.2, 0, 0.22],
    kneeL: [0.4, 0, 0],
    ankleL: [-0.2, 0, 0],
    hipR: [-0.2, 0, -0.22],
    kneeR: [0.4, 0, 0],
    ankleR: [-0.2, 0, 0],
  },
}

const BACKLIFT = {
  root: [-0.3, 0, 0],
  plant: 'R',
  extra: [-0.65, 0.7, -0.1, 0.2, 0.2, 1], // raised behind, towards the stumps
  joints: {
    spine: [0.38, 0, 0],
    chest: [0.05, 0.35, 0],
    neck: [-0.3, 1.2, 0],
    shoulderR: [-0.5, 0, -0.1],
    elbowR: [-1.3, 0, 0],
    shoulderL: [-0.9, 0, -0.7],
    elbowL: [-1.0, 0, 0],
    hipL: [-0.15, 0, 0.18],
    kneeL: [0.35, 0, 0],
    ankleL: [-0.15, 0, 0],
    hipR: [-0.25, 0, -0.25],
    kneeR: [0.45, 0, 0],
    ankleR: [-0.2, 0, 0],
  },
}

const DEFENCE = {
  root: [2.6, 0, 0.6],
  plant: 'L',
  extra: [-0.3, -0.95, 0.05, 1, -0.1, 0.1], // angled down beside the front pad, face to the bowler
  joints: {
    spine: [0.55, 0.15, -0.35],
    chest: [0.15, 0.2, 0],
    neck: [0.2, 0.75, 0],
    shoulderR: [-0.85, 0, 1.0],
    elbowR: [-0.3, 0, 0],
    shoulderL: [-0.75, 0, 0.75],
    elbowL: [-0.15, 0, 0],
    hipL: [-0.35, 0, 0.75],
    kneeL: [0.75, 0, 0],
    ankleL: [-0.3, 0, 0],
    hipR: [0, 0, -0.42],
    kneeR: [1.0, 0, 0],
    ankleR: [0.55, 0, 0], // back heel up, toe dragging
  },
}

const LOOK_BACK = {
  root: [2.2, 0, 0.3],
  plant: 'L',
  extra: [0, -1, 0.1, 0.3, 0, 1], // hanging by his side
  joints: {
    spine: [0.15, -0.3, 0],
    chest: [0, -0.5, 0],
    neck: [-0.05, -1.1, 0],
    shoulderR: [-0.15, 0, 0.1],
    elbowR: [-0.25, 0, 0],
    shoulderL: [-0.2, 0, -0.35],
    elbowL: [-0.8, 0, 0],
    hipL: [-0.15, 0, 0.6],
    kneeL: [0.4, 0, 0],
    ankleL: [-0.2, 0, 0],
    hipR: [0, 0, -0.4],
    kneeR: [0.15, 0, 0],
  },
}

/** The shot as progress keys: stance → backlift → forward defence. */
const PLAY = [
  [0, STANCE],
  [0.4, BACKLIFT],
  [1, DEFENCE],
]
const REACTION = [
  [0, DEFENCE],
  [1, LOOK_BACK],
]

function dressBatter(skeleton, { kit, skin, shoes, helmet, grille, willow, grip }) {
  const head = dressBody(skeleton, { kit, skin, hair: null, shoes })
  const { joints: j } = skeleton

  // Helmet: shell, peak and grille.
  const shell = new THREE.Mesh(new THREE.SphereGeometry(D.head * 1.18, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), helmet)
  shell.rotation.x = -0.2
  shell.castShadow = true
  const peak = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.12, 0.95), helmet)
  peak.position.set(0, 0.35, 1.15)
  peak.rotation.x = 0.2
  head.add(shell, peak)
  for (const [y, radius] of [
    [-0.05, 1.3],
    [-0.45, 1.25],
    [-0.85, 1.12],
  ]) {
    const bar = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.05, 6, 24, Math.PI * 0.75), grille)
    bar.rotation.set(Math.PI / 2, 0, Math.PI * 0.125)
    bar.position.y = y
    head.add(bar)
  }

  // Pads over the shins and knees, gloves over the hands.
  for (const side of ['R', 'L']) {
    const pad = limb(j[`knee${side}`], D.shin + 0.9, 0.78, kit)
    pad.position.set(0, -D.shin / 2 + 0.35, 0.28)
    pad.scale.set(1, 1, 0.85)
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), kit)
    glove.position.y = -D.hand * 0.4
    glove.scale.set(0.95, 1.15, 0.85)
    j[`hand${side}`].add(glove)
  }

  // The bat: origin at the bottom hand, handle running up (+y) through the top hand, blade below.
  const bat = new THREE.Group()
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, BAT.handle, 10), grip)
  handle.position.y = BAT.grip - BAT.handle / 2
  const blade = new THREE.Mesh(new THREE.BoxGeometry(BAT.width, BAT.blade, BAT.depth), willow)
  blade.position.set(0, BAT.grip - BAT.handle - BAT.blade / 2, 0)
  blade.castShadow = handle.castShadow = true
  bat.add(handle, blade)
  skeleton.root.add(bat)
  return bat
}

export function createBatter({ materials = null } = {}) {
  const skeleton = buildSkeleton()
  const play = solveKeys(skeleton, PLAY)
  const reaction = solveKeys(skeleton, REACTION)
  const bat = materials ? dressBatter(skeleton, materials) : null

  const values = new Float32Array(POSE_SIZE + 6)
  const reactValues = new Float32Array(POSE_SIZE + 6)
  const hand = new THREE.Vector3()
  const axis = new THREE.Vector3()
  const face = new THREE.Vector3()
  const side = new THREE.Vector3()
  const basis = new THREE.Matrix4()

  /** Put the bat's handle in the bottom hand and turn it to the pose's direction and face. */
  function holdBat() {
    if (!bat) return
    skeleton.joints.handR.getWorldPosition(hand)
    bat.position.copy(skeleton.root.worldToLocal(hand))
    axis.fromArray(values, POSE_SIZE).negate().normalize() // bat +y runs back up the handle
    face.fromArray(values, POSE_SIZE + 3)
    face.addScaledVector(axis, -face.dot(axis)).normalize()
    side.crossVectors(axis, face)
    bat.quaternion.setFromRotationMatrix(basis.makeBasis(side, axis, face))
  }

  const batter = {
    object: skeleton.root,
    bat,

    /** `shot` runs stance (0) → backlift → forward defence (1); `react` blends into looking back. */
    pose(shot, react = 0) {
      splineKeys(play, shot, values)
      if (react > 0) blendPose(values, splineKeys(reaction, react, reactValues), react)
      applyPose(skeleton, values)
      holdBat()
    },

    /** World position of an ankle (to plant the front foot beside the line of the ball). */
    footPosition(side, out) {
      return skeleton.joints[`ankle${side}`].getWorldPosition(out)
    },
  }
  batter.pose(0)
  return batter
}
