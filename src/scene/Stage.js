import * as THREE from 'three'
import gsap from 'gsap'

/**
 * The one persistent WebGL canvas: renderer, scene and camera, plus a render loop that
 * runs on GSAP's ticker so scroll (Lenis → ScrollTrigger) is always resolved before a frame draws.
 */
export class Stage {
  constructor(canvas, { maxPixelRatio, shadows }) {
    this.canvas = canvas
    this.maxPixelRatio = maxPixelRatio

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setClearColor(0x0b0b0a, 1)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1
    this.renderer.shadowMap.enabled = shadows
    this.renderer.shadowMap.type = THREE.PCFShadowMap

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100)

    this.size = { width: 1, height: 1, aspect: 1 }
    this.frameListeners = new Set()
    this.resizeListeners = new Set()

    // Continuous rendering normally; reduced-motion switches to render-on-demand.
    this.continuous = true
    this.needsRender = true
    this.running = false

    window.addEventListener('resize', this.resize)
    this.resize()
  }

  onFrame(listener) {
    this.frameListeners.add(listener)
    return () => this.frameListeners.delete(listener)
  }

  onResize(listener) {
    this.resizeListeners.add(listener)
    listener(this.size)
    return () => this.resizeListeners.delete(listener)
  }

  requestRender() {
    this.needsRender = true
  }

  resize = () => {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    this.size = { width, height, aspect: width / height }

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.maxPixelRatio))
    this.renderer.setSize(width, height, false)
    this.camera.aspect = this.size.aspect
    this.camera.updateProjectionMatrix()

    for (const listener of this.resizeListeners) listener(this.size)
    this.needsRender = true
  }

  // gsap.ticker signature: (time in s, deltaTime in ms, frame)
  tick = (time, deltaMs) => {
    // Clamp so a backgrounded tab doesn't come back with a huge step.
    const dt = Math.min(deltaMs / 1000, 1 / 20)
    for (const listener of this.frameListeners) listener(dt, time)

    if (this.continuous || this.needsRender) {
      this.renderer.render(this.scene, this.camera)
      this.needsRender = false
    }
  }

  start() {
    if (this.running) return
    this.running = true
    gsap.ticker.add(this.tick)
  }

  stop() {
    this.running = false
    gsap.ticker.remove(this.tick)
  }

  /** Compile every program in the scene up front so the first scrolled frame doesn't hitch. */
  precompile() {
    return this.renderer.compileAsync(this.scene, this.camera)
  }
}
