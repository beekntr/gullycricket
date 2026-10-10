import * as THREE from 'three'

/*
 * Shared machinery for the stylised cricketers: a jointed skeleton of capsules, poses as flat
 * arrays of joint angles, Catmull-Rom interpolation through keyed poses (so motion carries smoothly
 * through each key and scrubs backwards as cleanly as forwards), and foot planting.
 *
 * Local frame: the figure faces +Z with its feet on y = 0, at 11 units per metre (about 1.75 m tall).
 * Joint angles are Euler XYZ:
 *   - hanging limbs: +x swings the limb backwards (a bowling arm windmills through increasing x:
 *     down 0 → back π/2 → up π → forward 3π/2); +z swings it towards the figure's left (+X)
 *   - spine, chest, neck: +x leans forward, +y turns to the figure's left, -z leans to the left
 */

export const D = {
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

const JOINTS = [
  'pelvis', 'spine', 'chest', 'neck',
  'shoulderR', 'elbowR', 'wristR', 'shoulderL', 'elbowL',
  'hipR', 'kneeR', 'ankleR', 'hipL', 'kneeL', 'ankleL',
]
export const POSE_SIZE = 4 + JOINTS.length * 3

function joint(parent, x, y, z) {
  const node = new THREE.Group()
  node.position.set(x, y, z)
  parent.add(node)
  return node
}

export function buildSkeleton() {
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
  // The right wrist carries whatever is held (the batter's bat).
  j.wristR = joint(j.handR, 0, -D.hand * 0.6, 0)
  return { root, joints: j }
}

/*
 * A pose: `root` is the pelvis position, `yaw` turns the whole body, `plant` names the foot on the
 * ground (its sole is snapped to y = 0), and any joint not listed is at rest. `extra` carries any
 * other numbers a figure wants splined with the pose (the batter's bat direction); they follow the
 * joint values, from index POSE_SIZE.
 */
function flatten(pose) {
  const extra = pose.extra ?? []
  const out = new Float32Array(POSE_SIZE + extra.length)
  out.set(pose.root, 0)
  out[3] = pose.yaw ?? 0
  JOINTS.forEach((name, i) => out.set(pose.joints[name] ?? [0, 0, 0], 4 + i * 3))
  out.set(extra, POSE_SIZE)
  return out
}

export function applyPose({ root, joints }, values) {
  root.position.set(values[0], values[1], values[2])
  root.rotation.set(0, values[3], 0)
  JOINTS.forEach((name, i) => joints[name].rotation.set(values[4 + i * 3], values[5 + i * 3], values[6 + i * 3]))
  root.updateMatrixWorld(true)
}

const sole = new THREE.Vector3()

/** Raise or lower a pose so the planted foot's sole sits on the ground (skeleton not yet parented). */
function plant(skeleton, values, foot) {
  applyPose(skeleton, values)
  skeleton.joints[`ankle${foot}`].getWorldPosition(sole)
  values[1] -= sole.y - D.foot
  return values
}

/** Turn [[at, pose], …] into splineable keys, with planted feet solved. */
export function solveKeys(skeleton, sequence) {
  return sequence.map(([at, pose]) => {
    const values = flatten(pose)
    if (pose.plant) plant(skeleton, values, pose.plant)
    return { at, values }
  })
}

/** Catmull-Rom through keyed poses, so velocity carries smoothly through each key. */
export function splineKeys(keys, t, out) {
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
  for (let n = 0; n < out.length; n++) {
    out[n] =
      0.5 *
      (2 * k1[n] + (-k0[n] + k2[n]) * f + (2 * k0[n] - 5 * k1[n] + 4 * k2[n] - k3[n]) * f2 + (-k0[n] + 3 * k1[n] - 3 * k2[n] + k3[n]) * f3)
  }
  return out
}

/** Blend `into` towards `target` by `amount`, in place. */
export function blendPose(into, target, amount) {
  for (let n = 0; n < into.length; n++) into[n] += (target[n] - into[n]) * amount
  return into
}

// --- Meshes -------------------------------------------------------------------------------------

/** A capsule hanging (or, with direction 1, standing) from a joint along its local Y. */
export function limb(parent, length, radius, material, direction = -1) {
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(length - radius * 2, 0.01), 4, 10), material)
  mesh.position.y = (direction * length) / 2
  mesh.castShadow = true
  parent.add(mesh)
  return mesh
}

/** Whites, skin and shoes. `hair: false` leaves the head bare for a helmet. */
export function dressBody({ joints: j }, { kit, skin, hair, shoes }) {
  const hips = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), kit)
  hips.scale.set(1.35, 0.95, 0.95)
  hips.castShadow = true
  j.pelvis.add(hips)

  limb(j.spine, D.spine + 0.6, 1.25, kit, 1).scale.set(1.1, 1, 0.82)
  limb(j.chest, D.chest + 0.4, 1.55, kit, 1).scale.set(1.3, 1, 0.78)

  limb(j.neck, D.neck + 0.3, 0.48, skin, 1)
  const head = new THREE.Mesh(new THREE.SphereGeometry(D.head, 20, 16), skin)
  head.position.y = D.neck + D.head * 0.85
  head.scale.set(0.92, 1.05, 1)
  head.castShadow = true
  j.neck.add(head)
  if (hair) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(D.head * 1.06, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), hair)
    cap.rotation.x = -0.25
    head.add(cap)
  }

  for (const side of ['R', 'L']) {
    // Short sleeves, so the forearms show.
    limb(j[`shoulder${side}`], D.upperArm + 0.3, 0.6, kit)
    limb(j[`elbow${side}`], D.forearm + 0.2, 0.43, skin)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(D.hand, 12, 10), skin)
    hand.position.y = -D.hand * 0.4
    hand.scale.set(0.9, 1.2, 0.7)
    j[`hand${side}`].add(hand)

    limb(j[`hip${side}`], D.thigh + 0.4, 0.82, kit)
    limb(j[`knee${side}`], D.shin + 0.2, 0.6, kit)
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.95, D.foot + 0.1, 2.3), shoes)
    shoe.position.set(0, -D.foot / 2, 0.55)
    shoe.castShadow = true
    j[`ankle${side}`].add(shoe)
  }
  return head
}
