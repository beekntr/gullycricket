import * as THREE from 'three'
import noiseGLSL from '../shaders/noise.glsl.js'
import bumpGLSL from '../shaders/bump.glsl.js'
import { disposeObject } from '../utils/dispose.js'

/*
 * A procedural leather cricket ball, shared by every chapter that shows it.
 *
 * Built in code rather than loaded so it holds up at extreme close-up: the leather grain,
 * quarter seams and thread twist are evaluated per pixel in object space, so there is no
 * texture resolution to run out of when the camera pushes into the seam.
 *
 * Units are ball radii (1 unit ≈ 36 mm on a real 72 mm ball).
 * The main seam lies in the ball's local XZ plane, so local +Y is the seam axis.
 */

export const BALL_RADIUS = 1

const LEATHER_COLOR = 0x8c1c15
const THREAD_COLOR = 0xeee7d8

// The raised lip where the two halves meet: half-width, height, and the crease between the lips.
const RIDGE_HALF_WIDTH = 0.019
const RIDGE_HEIGHT = 0.0062
const RIDGE_CREASE = 0.0022
const STITCH_RADIUS = 0.0062
const STITCH_LENGTH = 0.018 // capsule body; the rounded caps add 2 × radius
const STITCH_FLATTEN = 0.6 // squash along the surface normal so thread lies flat on the leather
const STITCH_SINK = 0.0015 // how far each stitch is pulled into the leather
const STITCH_SLANT = 0.28 // radians off the meridian, mirrored either side of the seam
const STITCH_ROWS = [0.034, 0.063, 0.092] // latitude of each row of thread, per side (six rows total)
const TWIST_FREQUENCY = 1500 // twisted-ply bands along a stitch, per unit length

/** Shared vertex hook: pass object-space position and object scale to the fragment shader. */
function injectObjectSpace(shader) {
  shader.vertexShader = shader.vertexShader
    .replace(
      '#include <common>',
      '#include <common>\nvarying vec3 vObjPos;\nvarying float vObjScale;',
    )
    .replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvObjPos = position;\nvObjScale = length(modelMatrix[0].xyz);',
    )
}

const fragmentPreamble = /* glsl */ `
varying vec3 vObjPos;
varying float vObjScale;
uniform float uBumpScale;
${noiseGLSL}
${bumpGLSL}
`

function createLeatherMaterial(detail) {
  const material = new THREE.MeshPhysicalMaterial({
    color: LEATHER_COLOR,
    roughness: 0.42,
    specularIntensity: 0.55,
    // The polish/lacquer coat: stays smooth over the grain, which is what makes a new ball shine.
    clearcoat: 0.7,
    clearcoatRoughness: 0.12,
    fog: false, // the ball is the subject of every shot; scenery fades, it never does
  })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBumpScale = { value: 1 }
    shader.defines.LEATHER_DETAIL = detail ? 1 : 0
    injectObjectSpace(shader)

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
${fragmentPreamble}

// Each half of the ball is two quarters stitched together; the two halves' quarter seams sit
// 90° apart. Distance from, and arc position along, the quarter seam on this point's half.
float quarterSeamDistance(vec3 p) { return p.y > 0.0 ? abs(p.x) : abs(p.z); }
float quarterSeamArc(vec3 p) { return p.y > 0.0 ? atan(p.y, p.z) : atan(-p.y, p.x); }
`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
vec3 ballP = vObjPos;
float ballPx = length(fwidth(vObjPos)); // object-space size of one pixel, for anti-aliasing

// Fold: the leather is pulled down into the main seam by the stitching.
float seamFold = 1.0 - smoothstep(0.0, 0.11, abs(ballP.y));
seamFold *= seamFold;

// Quarter seam: a fine pressed line, faded rather than aliased once it's thinner than a pixel.
float qDist = quarterSeamDistance(ballP);
float qWidth = 0.0035;
float qLine = (1.0 - smoothstep(qWidth - ballPx, qWidth + ballPx, qDist)) * clamp(qWidth / ballPx, 0.0, 1.0);

// Dye and polish are never perfectly even.
float tone = nz_snoise(ballP * 2.2) * 0.6 + nz_snoise(ballP * 7.5 + 4.0) * 0.4;
diffuseColor.rgb *= 0.9 + 0.1 * tone;
diffuseColor.rgb *= mix(1.0, 0.68, seamFold);
diffuseColor.rgb *= mix(1.0, 0.5, qLine);
`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
float scuff = nz_snoise(ballP * 5.0 + 9.0) * 0.5 + 0.5;
roughnessFactor = clamp(roughnessFactor * (0.85 + 0.3 * scuff) + 0.12 * seamFold + 0.25 * qLine, 0.0, 1.0);
`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
{
  // Height in object units. Each octave fades out before it gets small enough to shimmer.
  float h = nz_snoise(ballP * 60.0) * 0.0002 * detailFade(ballPx, 60.0);
  h += nz_snoise(ballP * 170.0 + 5.0) * 0.00011 * detailFade(ballPx, 170.0);
  #if LEATHER_DETAIL
  h += nz_snoise(ballP * 420.0 + 17.0) * 0.000045 * detailFade(ballPx, 420.0);
  #endif
  h -= seamFold * 0.0025;
  h -= qLine * 0.0012;

  #if LEATHER_DETAIL
  // Stitch holes running either side of the quarter seam.
  float spacing = 0.034;
  float along = (fract(quarterSeamArc(ballP) / spacing) - 0.5) * spacing;
  float across = qDist - 0.011;
  float hole = 1.0 - smoothstep(0.0012, 0.0032, length(vec2(along, across)));
  h -= hole * 0.0009 * detailFade(ballPx, 120.0);
  #endif

  normal = perturbNormalByHeight(-vViewPosition, normal, h * vObjScale * uBumpScale, faceDirection);
}
`,
      )
  }
  material.customProgramCacheKey = () => `cricket-leather-${detail ? 1 : 0}`
  return material
}

function createThreadMaterial() {
  const material = new THREE.MeshPhysicalMaterial({
    color: THREAD_COLOR,
    roughness: 0.8,
    // Fabric sheen is what makes the stitching catch the rim light and glow at the silhouette.
    sheen: 1,
    sheenRoughness: 0.45,
    sheenColor: 0xffffff,
    fog: false,
  })

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBumpScale = { value: 1 }
    injectObjectSpace(shader)

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${fragmentPreamble}`)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
// vObjPos is in the capsule's own space: +Y runs along the stitch. Two-ply twist.
float twistPhase = vObjPos.y * ${TWIST_FREQUENCY.toFixed(1)};
float twistAA = 1.0 - smoothstep(0.8, 2.0, fwidth(twistPhase));
float twist = cos(twistPhase + atan(vObjPos.x, vObjPos.z) * 2.0) * twistAA;
diffuseColor.rgb *= 1.0 - 0.08 * (0.5 - 0.5 * twist);
`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
normal = perturbNormalByHeight(-vViewPosition, normal, twist * 0.00022 * vObjScale * uBumpScale, faceDirection);
`,
      )
  }
  material.customProgramCacheKey = () => 'cricket-thread'
  return material
}

/**
 * The seam lip, lathed around the seam axis: two rounded leather lips with a crease between,
 * blending back into the shell at either edge.
 */
function createRidgeGeometry(radialSegments) {
  const profile = []
  const steps = 28
  for (let i = 0; i <= steps; i++) {
    const y = -RIDGE_HALF_WIDTH + (2 * RIDGE_HALF_WIDTH * i) / steps
    const u = y / RIDGE_HALF_WIDTH
    const bump = RIDGE_HEIGHT * (1 - u * u) ** 2
    const crease = RIDGE_CREASE * Math.exp(-((y / 0.0024) ** 2))
    profile.push(new THREE.Vector2(BALL_RADIUS - 0.0015 + bump - crease, y))
  }
  return new THREE.LatheGeometry(profile, radialSegments)
}

/** Six rows of slanted stitches, three each side of the main seam, as one instanced mesh. */
function createStitches(material, perRow, radialSegments) {
  const geometry = new THREE.CapsuleGeometry(STITCH_RADIUS, STITCH_LENGTH, radialSegments > 8 ? 4 : 3, radialSegments)
  const count = STITCH_ROWS.length * 2 * perRow
  const mesh = new THREE.InstancedMesh(geometry, material, count)

  const normal = new THREE.Vector3()
  const east = new THREE.Vector3()
  const north = new THREE.Vector3()
  const along = new THREE.Vector3()
  const across = new THREE.Vector3()
  const matrix = new THREE.Matrix4()
  const squash = new THREE.Vector3(1, 1, STITCH_FLATTEN)
  const color = new THREE.Color()
  const lift = BALL_RADIUS - STITCH_SINK

  let index = 0
  for (const side of [1, -1]) {
    STITCH_ROWS.forEach((rowLatitude, row) => {
      const latitude = side * rowLatitude
      for (let k = 0; k < perRow; k++) {
        // Alternate rows are offset half a stitch so the thread reads as a woven band.
        const theta = ((k + (row % 2) * 0.5) / perRow) * Math.PI * 2

        normal.set(
          Math.cos(latitude) * Math.cos(theta),
          Math.sin(latitude),
          Math.cos(latitude) * Math.sin(theta),
        )
        east.set(-Math.sin(theta), 0, Math.cos(theta))
        north.crossVectors(east, normal)
        along
          .copy(north)
          .multiplyScalar(Math.cos(STITCH_SLANT))
          .addScaledVector(east, Math.sin(STITCH_SLANT) * side)
          .normalize()
        across.crossVectors(along, normal)

        // Capsule axes → (across, along, normal), flattened against the leather.
        matrix.makeBasis(across, along, normal).scale(squash)
        matrix.setPosition(normal.x * lift, normal.y * lift, normal.z * lift)
        mesh.setMatrixAt(index, matrix)

        // Thread picks up a little dirt unevenly.
        color.setScalar(0.88 + Math.random() * 0.12)
        mesh.setColorAt(index, color)
        index++
      }
    })
  }

  mesh.instanceMatrix.needsUpdate = true
  mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere()
  return mesh
}

export function createBall(quality) {
  const object = new THREE.Group()
  object.name = 'cricket-ball'

  const leather = createLeatherMaterial(quality.shaderDetail)
  const thread = createThreadMaterial()

  const segments = quality.sphereSegments
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, segments, Math.round(segments * 0.66)),
    leather,
  )
  // In close-up the shell only receives: casting would just self-shadow its own terminator (acne),
  // and the shadows worth having are the thread and seam lip falling across the leather.
  // Chapters with a floor turn casting on (castShadows below).
  shell.receiveShadow = true

  const ridge = new THREE.Mesh(createRidgeGeometry(quality.shaderDetail ? 480 : 320), leather)
  ridge.castShadow = true

  const stitches = createStitches(thread, quality.stitchesPerRow, quality.shaderDetail ? 14 : 8)
  stitches.castShadow = true

  object.add(shell, ridge, stitches)

  return {
    object,
    /** Whether the whole ball (not just its seam) casts a shadow, e.g. onto the pitch or the floor. */
    castShadows(enabled) {
      shell.castShadow = enabled
    },
    dispose() {
      object.removeFromParent()
      disposeObject(object)
    },
  }
}
