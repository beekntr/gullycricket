import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/**
 * Lenis smooths the native window scroll; GSAP's ticker drives Lenis. Scroll, ScrollTrigger and
 * the WebGL render then all run in one requestAnimationFrame, in that order, so a frame is
 * never drawn against a stale scroll position.
 */
export function createSmoothScroll() {
  const lenis = new Lenis({
    lerp: 0.075, // lower = heavier glide
    wheelMultiplier: 0.9,
    anchors: true,
  })

  lenis.on('scroll', ScrollTrigger.update)
  gsap.ticker.add((time) => lenis.raf(time * 1000))
  // Lenis already smooths; GSAP's lag smoothing would make scrubbed scenes stutter after a hitch.
  gsap.ticker.lagSmoothing(0)

  return lenis
}
