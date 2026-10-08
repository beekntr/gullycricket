import gsap from 'gsap'

/*
 * Every chapter's 3D choreography is a pure function of its scroll progress `u` (0–1), so it
 * scrubs backwards as cleanly as forwards. These helpers carve `u` into eased segments.
 */

export const clamp01 = (x) => Math.min(1, Math.max(0, x))

/** Progress of `u` through [from, to], clamped to 0–1. */
export const segment = (u, from, to) => clamp01((u - from) / (to - from))

// GSAP's own curves, so scroll-driven 3D moves with the same weight as the DOM tweens.
export const ease = {
  inOut: gsap.parseEase('power3.inOut'),
  soft: gsap.parseEase('power2.inOut'),
  out: gsap.parseEase('power3.out'),
  in: gsap.parseEase('power2.in'),
  expoOut: gsap.parseEase('expo.out'),
}

/** Interpolate in log space: distances and scales then move at an even perceived rate. */
export const logLerp = (a, b, t) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * t)

/** Yield to the browser between chunks of heavy work (geometry, canvas drawing, uploads). */
export const nextIdle = () =>
  new Promise((resolve) =>
    window.requestIdleCallback ? window.requestIdleCallback(() => resolve(), { timeout: 120 }) : setTimeout(resolve, 16),
  )
