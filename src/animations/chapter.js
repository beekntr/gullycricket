import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'

/**
 * A pinned chapter of the story. The section pins for `pin` viewport-heights, and one scrubbed
 * timeline runs from the moment it *enters* (top of section at the bottom of the viewport) to the
 * end of the pin. Its 3D therefore picks up exactly where the previous chapter's left off, with
 * no dead scroll in between. Timeline positions are 0–1 across that whole range; `pinStart` is
 * where the pinned part begins.
 *
 * With reduced motion there is no pin and no timeline: just a range for the scene manager, taken
 * from when the section crosses the middle of the viewport.
 */
export function createChapter(root, state, { pin, enter = true, reducedMotion, staticProgress = 1 }) {
  if (reducedMotion) {
    state.u = staticProgress
    const trigger = ScrollTrigger.create({ trigger: root, start: 'top center', end: 'bottom center' })
    return { timeline: null, pinStart: 0, range: () => [trigger.start, trigger.end] }
  }

  const pinTrigger = ScrollTrigger.create({
    trigger: root,
    start: 'top top',
    end: `+=${pin * 100}%`,
    pin: true,
    anticipatePin: 1,
  })
  const timeline = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: root,
      start: enter ? 'top bottom' : 'top top',
      end: () => pinTrigger.end,
      scrub: true,
      invalidateOnRefresh: true,
    },
  })
  timeline.to(state, { u: 1, duration: 1 }, 0)

  return {
    timeline,
    pinStart: enter ? 1 / (1 + pin) : 0,
    range: () => [timeline.scrollTrigger.start, timeline.scrollTrigger.end],
  }
}

/** Split a heading into masked words, keeping it readable as one phrase to assistive tech. */
export function splitHeading(heading) {
  const split = SplitText.create(heading, { type: 'words', mask: 'words', aria: 'auto' })
  heading.setAttribute('aria-label', heading.textContent.replace(/\s+/g, ' ').trim())
  return split.words
}

/** Masked word rise, the shared headline entrance. Positions/durations are in chapter progress. */
export function riseWords(timeline, words, at, span = 0.12) {
  timeline.from(
    words,
    { yPercent: 110, duration: span * 0.6, stagger: (span * 0.4) / Math.max(1, words.length - 1), ease: 'power3.out' },
    at,
  )
}

export function fadeUp(timeline, targets, at, duration = 0.08) {
  timeline.from(targets, { y: 28, autoAlpha: 0, duration, stagger: duration * 0.3, ease: 'power3.out' }, at)
}

export function fadeAway(timeline, targets, at, duration = 0.06) {
  timeline.to(targets, { y: -32, autoAlpha: 0, duration, ease: 'power2.in' }, at)
}
