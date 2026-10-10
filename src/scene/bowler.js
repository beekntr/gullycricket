import * as THREE from 'three'

/*
 * A stylised right-arm fast bowler in whites: a jointed figure of capsules, posed through the
 * delivery (bound → back-foot landing → front-foot landing → release → follow-through) and a
 * celebration. Poses are keyframes of joint angles; any moment is interpolated from a progress
 * value, so the action scrubs backwards with the scroll as cleanly as forwards.
 *
 * Local frame: the figure faces +Z (down the pitch) with its feet on y = 0. Units match the pitch
 * (11 per metre), so he stands about 1.75 m tall.
 *
 * Joint angles are Euler XYZ. For hanging limbs, +x swings the limb backwards (so the bowling arm
 * windmills through increasing x: down 0 → back π/2 → up π → forward 3π/2). For the spine, +x leans
 * forward. For arms, +z swings the limb towards the figure's left (+X).
 */

const D = {
  hipWidth: 0.95,
  hipDrop: 0.2,
  thigh: 4.9,
  shin: 4.6,
  foot: 0.6, // ankle to sole
  spine: 2.6,
  chest: 3.2,
  neck: 1.0,
  head: 1.15,
  shoulderWidth: 2.0,
  shoulderHeight: 2.7,
  upperArm: 3.7,
  forearm: 2.9,
  hand: 0.45,
}
export const STANDING_PELVIS = D.hipDrop + D.thigh + D.shin + D.foot

const JOINTS = ['pelvis', 'spine', 'chest', 'neck', 'shoulderR', 'elbowR', 'shoulderL', 'elbowL', 'hipR', 'kneeR', 'ankleR', 'hipL', 'kneeL', 'ankleL']

/*
 * Keyframes. `root` is the pelvis position, `yaw` turns the whole body (negative = side-on, left
 * shoulder towards the batter), `plant` names the foot that's on the ground (its sole is snapped to
 * y = 0), and every joint not listed is at rest.
 */
const BOUND = {
  root: [0, 0, 0], // height is solved so the ball sits exactly at the hero's origin
  yaw: -0.45,
  joints: {
    spine: [0.12, 0, 0],
    neck: [-0.1, 0.35, 0],
    // Ball gathered in front of the chin with both hands.
    shoulderR: [-1.25, 0, 0.45],
    elbowR: [-1.75, 0, 0],
    shoulderL: [-1.2, 0, -0.55],
    elbowL: [-1.7, 0, 0],
    hipL: [-1.5, 0, 0.05],
    kneeL: [1.8, 0, 0],
    ankleL: [0.3, 0, 0],
    hipR: [0.45, 0, -0.05],
    kneeR: [1.5, 0, 0],
    ankleR: [0.4, 0, 0],
  },
}

const BACK_FOOT = {
  root: [0.3, 0, 6],
  yaw: -1.25,
  plant: 'R',
  joints: {
    spine: [-0.28, 0, 0],
    chest: [-0.1, -0.2, 0],
    neck: [0.2, 0.95, 0],
    shoulderR: [0.55, 0, -0.15],
    elbowR: [-0.35, 0, 0],
    shoulderL: [-2.75, 0, -0.15],
    elbowL: [-0.25, 0, 0],
    hipR: [0.05, 0, -0.1],
    kneeR: [0.4, 0, 0],
    hipL: [-1.15, 0, 0.1],
    kneeL: [1.1, 0, 0],
    ankleL: [0.2, 0, 0],
  },
}

const FRONT_FOOT = {
  root: [0.6, 0, 14],
  yaw: -1.0,
  plant: 'L',
  joints: {
    spine: [-0.12, 0, 0],
    chest: [0, -0.1, 0],
    neck: [0.1, 0.8, 0],
    shoulderR: [1.75, 0, -0.1], // bowling arm trailing back, about to whip over
    shoulderL: [-2.45, 0, -0.25], // front arm still pointing at the batter
    elbowL: [-0.4, 0, 0],
    hipL: [-0.6, 0, 0.05],
    kneeL: [0.08, 0, 0],
    hipR: [0.6, 0, -0.05],
    kneeR: [0.55, 0, 0],
    ankleR: [0.5, 0, 0],
  },
}

const RELEASE = {
  root: [0.6, 0, 17],
  yaw: -0.4,
  plant: 'L',
  joints: {
    spine: [0.28, 0, 0],
    chest: [0.15, 0.25, 0],
    neck: [-0.2, 0.3, 0],
    shoulderR: [3.35, 0, 0.12],
    shoulderL: [0.25, 0, -0.35],
    elbowL: [-1.2, 0, 0],
    hipL: [-0.4, 0, 0.05],
    kneeL: [0.12, 0, 0],
    hipR: [0.8, 0, -0.05],
    kneeR: [0.95, 0, 0],
    ankleR: [0.6, 0, 0],
  },
}

const FOLLOW_THROUGH = {
  root: [0.9, 0, 24],
  yaw: 0.25,
  plant: 'L',
  joints: {
    spine: [0.6, 0, 0],
    chest: [0.35, 0.35, 0],
    neck: [-0.5, 0, 0],
    shoulderR: [5.6, 0, 0.75],
    elbowR: [-0.45, 0, 0],
    shoulderL: [0.95, 0, -0.25],
    elbowL: [-0.8, 0, 0],
    hipL: [0.15, 0, 0],
    kneeL: [0.4, 0, 0],
    hipR: [-1.0, 0, 0.05],
    kneeR: [1.2, 0, 0],
  },
}

const CELEBRATE = {
  root: [1.0, 0, 34],
  yaw: 0.05,
  plant: 'L',
  joints: {
    spine: [-0.08, 0, 0],
    chest: [-0.08, 0, 0],
    neck: [-0.15, 0, 0],
    shoulderR: [3.5, 0, -0.55],
    elbowR: [-0.25, 0, 0],
    shoulderL: [-2.78, 0, 0.55],
    elbowL: [-0.25, 0, 0],
    hipL: [-0.1, 0, 0.12],
    kneeL: [0.1, 0, 0],
    hipR: [0.1, 0, -0.12],
    kneeR: [0.12, 0, 0],
  },
}

/** The delivery as progress keys (0–1); the ball leaves the hand at RELEASE_AT. */
const ACTION = [
  [0, BOUND],
  [0.3, BACK_FOOT],
  [0.52, FRONT_FOOT],
  [0.68, RELEASE],
  [1, FOLLOW_THROUGH],
]
export const RELEASE_AT = 0.68

// --- Skeleton -----------------------------------------------------------------------------------

function joint(parent, x, y, z) {
  const node = new THREE.Group()
  node.position.set(x, y, z)
  parent.add(node)
  return node
}

function buildSkeleton() {
  const root = new THREE.Group()
  const j = {}
  j.pelvis = joint(root, 0, 0, 0)
  j.spine = joint(j.pelvis, 0, D.hipDrop, 0)
  j.chest = joint(j.spine, 0, D.spine, 0)
  j.neck = joint(j.chest, 0, D.chest, 0)
  for (const [side, x] of [
    ['R', -1],
    ['L', 1],
  ]) {
    j[`shoulder${side}`] = joint(j.chest, x * D.shoulderWidth, D.shoulderHeight, 0)
    j[`elbow${side}`] = joint(j[`shoulder${side}`], 0, -D.upperArm, 0)
    j[`hand${side}`] = joint(j[`elbow${side}`], 0, -D.forearm, 0)
    j[`hip${side}`] = joint(j.pelvis, x * D.hipWidth, -D.hipDrop, 0)
    j[`knee${side}`] = joint(j[`hip${side}`], 0, -D.thigh, 0)
    j[`ankle${side}`] = joint(j[`knee${side}`], 0, -D.shin, 0)
  }
  // Where the ball sits in the bowling hand: at the fingertips, just in front of the palm.
  j.socket = joint(j.handR, 0, -D.hand * 1.1, 0.3)
  return { root, joints: j }
}

// --- Poses as flat number arrays, so they can be splined ----------------------------------------

const POSE_SIZE = 4 + JOINTS.length * 3

function flatten(pose, out = new Float32Array(POSE_SIZE)) {
  out.set(pose.root, 0)
  out[3] = pose.yaw
  JOINTS.forEach((name, i) => out.set(pose.joints[name] ?? [0, 0, 0], 4 + i * 3))
  return out
}

function apply(skeleton, values) {
  const { root, joints } = skeleton
  root.position.set(values[0], values[1], values[2])
  root.rotation.set(0, values[3], 0)
  JOINTS.forEach((name, i) => joints[name].rotation.set(values[4 + i * 3], values[5 + i * 3], values[6 + i * 3]))
  root.updateMatrixWorld(true)
}

const sole = new THREE.Vector3()

/** Lift or drop a pose so the planted foot's sole sits on the ground. */
function plantPose(skeleton, values, foot) {
  apply(skeleton, values)
  skeleton.joints[`ankle${foot}`].getWorldPosition(sole)
  values[1] -= sole.y - D.foot
  return values
}

/** Catmull-Rom through keyed poses, so velocity carries smoothly through each key. */
function splineKeys(keys, t, out) {
  const last = keys.length - 1
  let i = 0
  while (i < last - 1 && t > keys[i + 1].at) i++
  const k0 = keys[Math.max(i - 1, 0)].values
  const k1 = keys[i].values
  const k2 = keys[Math.min(i + 1, last)].values
  const k3 = keys[Math.min(i + 2, last)].values
  const span = keys[Math.min(i + 1, last)].at - keys[i].at
  const f = span > 0 ? THREE.MathUtils.clamp((t - keys[i].at) / span, 0, 1) : 0
  const f2 = f * f
  const f3 = f2 * f
  for (let n = 0; n < POSE_SIZE; n++) {
    out[n] =
      0.5 *
      (2 * k1[n] + (-k0[n] + k2[n]) * f + (2 * k0[n] - 5 * k1[n] + 4 * k2[n] - k3[n]) * f2 + (-k0[n] + 3 * k1[n] - 3 * k2[n] + k3[n]) * f3)
  }
  return out
}

/**
 * Solve the keyframes once: plant feet, and lift the bound so the ball in the bowling hand is
 * `ballHeight` above the ground. Returns everything the scene needs to place the pitch around him.
 */
function solveKeys(skeleton, ballHeight) {
  const socket = new THREE.Vector3()
  const action = ACTION.map(([at, pose]) => {
    const values = flatten(pose)
    if (pose.plant) plantPose(skeleton, values, pose.plant)
    return { at, values }
  })
  // The bound is airborne: set its height from where the ball must be.
  apply(skeleton, action[0].values)
  skeleton.joints.socket.getWorldPosition(socket)
  action[0].values[1] += ballHeight - socket.y

  const celebrate = [
    { at: 0, values: action[action.length - 1].values },
    { at: 1, values: plantPose(skeleton, flatten(CELEBRATE), CELEBRATE.plant) },
  ]
  return { action, celebrate }
}

export function createBowler({ ballHeight, materials = null }) {
  const skeleton = buildSkeleton()
  const keys = solveKeys(skeleton, ballHeight)
  const values = new Float32Array(POSE_SIZE)
  const celebrateValues = new Float32Array(POSE_SIZE)

  if (materials) dress(skeleton, materials)

  const bowler = {
    object: skeleton.root,
    joints: skeleton.joints,

    /**
     * Pose the figure: `action` runs the delivery (0 = bound … 1 = follow-through), then
     * `celebrate` blends from the follow-through into arms-up.
     */
    pose(action, celebrate = 0) {
      splineKeys(keys.action, action, values)
      if (celebrate > 0) {
        splineKeys(keys.celebrate, celebrate, celebrateValues)
        for (let n = 0; n < POSE_SIZE; n++) values[n] += (celebrateValues[n] - values[n]) * celebrate
      }
      apply(skeleton, values)
    },

    /** World position of the ball held in the bowling hand. */
    ballPosition(out) {
      return skeleton.joints.socket.getWorldPosition(out)
    },

    /** World position of a sole (for placing creases around the front foot). */
    footPosition(side, out) {
      return skeleton.joints[`ankle${side}`].getWorldPosition(out)
    },
  }
  bowler.pose(0)
  return bowler
}

// --- Meshes -------------------------------------------------------------------------------------

/** Capsule hanging (or standing, with direction 1) from a joint along its local Y. */
function segment(parent, length, radius, material, direction = -1) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(length - radius * 2, 0.01), 4, 10), material)
  mesh.position.y = (direction * length) / 2
  mesh.castShadow = true
  parent.add(mesh)
  return mesh
}

function dress({ joints: j }, { kit, skin, hair, shoes }) {
  // Torso: hips, waist and chest as squashed capsules.
  const hips = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), kit)
  hips.scale.set(1.35, 0.95, 0.95)
  hips.castShadow = true
  j.pelvis.add(hips)

  const waist = segment(j.spine, D.spine + 0.6, 1.25, kit, 1)
  waist.scale.set(1.1, 1, 0.82)
  const chest = segment(j.chest, D.chest + 0.4, 1.55, kit, 1)
  chest.scale.set(1.3, 1, 0.78)

  segment(j.neck, D.neck + 0.3, 0.48, skin, 1)
  const head = new THREE.Mesh(new THREE.SphereGeometry(D.head, 20, 16), skin)
  head.position.y = D.neck + D.head * 0.85
  head.scale.set(0.92, 1.05, 1)
  head.castShadow = true
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(D.head * 1.06, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), hair)
  hairCap.rotation.x = -0.25
  head.add(hairCap)
  j.neck.add(head)

  for (const side of ['R', 'L']) {
    // Short sleeves, so the forearms show.
    segment(j[`shoulder${side}`], D.upperArm + 0.3, 0.6, kit)
    segment(j[`elbow${side}`], D.forearm + 0.2, 0.43, skin)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(D.hand, 12, 10), skin)
    hand.position.y = -D.hand * 0.4
    hand.scale.set(0.9, 1.2, 0.7)
    j[`hand${side}`].add(hand)

    segment(j[`hip${side}`], D.thigh + 0.4, 0.82, kit)
    segment(j[`knee${side}`], D.shin + 0.2, 0.6, kit)
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.95, D.foot + 0.1, 2.3), shoes)
    shoe.position.set(0, -D.foot / 2, 0.55)
    shoe.castShadow = true
    j[`ankle${side}`].add(shoe)
  }
}
