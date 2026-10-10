import * as THREE from 'three'
import { applyPose, blendPose, buildSkeleton, D, dressBody, POSE_SIZE, solveKeys, splineKeys } from './figure.js'

/*
 * A stylised right-arm fast bowler in whites, posed through the delivery (bound → back-foot
 * landing → front-foot landing → release → follow-through) and a celebration. Built on figure.js;
 * see there for the skeleton's frame and angle conventions. Negative yaw here turns him side-on,
 * left shoulder towards the batter.
 */

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

const CELEBRATION = [
  [0, FOLLOW_THROUGH],
  [1, CELEBRATE],
]

export function createBowler({ ballHeight, materials = null }) {
  const skeleton = buildSkeleton()
  // Where the ball sits in the bowling hand: at the fingertips, just in front of the palm.
  const socket = new THREE.Group()
  socket.position.set(0, -D.hand * 1.1, 0.3)
  skeleton.joints.handR.add(socket)

  const action = solveKeys(skeleton, ACTION)
  const celebration = solveKeys(skeleton, CELEBRATION)
  // The bound is airborne: set its height from where the ball must be.
  const ball = new THREE.Vector3()
  applyPose(skeleton, action[0].values)
  socket.getWorldPosition(ball)
  action[0].values[1] += ballHeight - ball.y

  if (materials) dressBody(skeleton, materials)

  const values = new Float32Array(POSE_SIZE)
  const celebrateValues = new Float32Array(POSE_SIZE)

  const bowler = {
    object: skeleton.root,

    /**
     * Pose the figure: `progress` runs the delivery (0 = bound … 1 = follow-through), then
     * `celebrate` blends from the follow-through into arms-up.
     */
    pose(progress, celebrate = 0) {
      splineKeys(action, progress, values)
      if (celebrate > 0) blendPose(values, splineKeys(celebration, celebrate, celebrateValues), celebrate)
      applyPose(skeleton, values)
    },

    /** World position of the ball held in the bowling hand. */
    ballPosition(out) {
      return socket.getWorldPosition(out)
    },

    /** World position of an ankle (for placing the creases around the front foot). */
    footPosition(side, out) {
      return skeleton.joints[`ankle${side}`].getWorldPosition(out)
    },
  }
  bowler.pose(0)
  return bowler
}
