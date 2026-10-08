import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { FEATURE_STEPS } from '../scene/features.js'
import { createChapter, fadeAway, fadeUp, riseWords, splitHeading } from './chapter.js'

/*
 * Scroll choreography for chapters 2–6. Each returns { range } for the scene manager.
 * Every position below is in that chapter's progress (0–1), the same `u` its 3D scene reads.
 */

const $ = (root, selector) => root.querySelector(selector)
const $$ = (root, selector) => [...root.querySelectorAll(selector)]

export function animateDelivery(root, state, { reducedMotion }) {
  const chapter = createChapter(root, state, { pin: 2.5, reducedMotion, staticProgress: 0.6 })
  const { timeline } = chapter
  if (!timeline) return chapter

  // Copy rides in with the section while the camera pulls back, then clears before the catch.
  riseWords(timeline, splitHeading($(root, 'h2')), 0.12, 0.14)
  fadeUp(timeline, $$(root, '[data-reveal]'), 0.18)
  fadeAway(timeline, $(root, '.chapter__inner'), 0.78)
  return chapter
}

export function animatePhone(root, state, { reducedMotion }) {
  const chapter = createChapter(root, state, { pin: 2.2, reducedMotion, staticProgress: 1 })
  const { timeline } = chapter
  if (!timeline) return chapter

  riseWords(timeline, splitHeading($(root, 'h2')), 0.14, 0.14)
  fadeUp(timeline, $$(root, '[data-reveal]'), 0.22)
  return chapter
}

export function animateFeatures(root, state, { reducedMotion }) {
  const chapter = createChapter(root, state, { pin: 3.3, reducedMotion, staticProgress: 0.38 })
  const { timeline } = chapter
  if (!timeline) return chapter

  const steps = $$(root, '[data-feature]')
  const count = $(root, '[data-step-count]')
  gsap.set(steps, { autoAlpha: 0 })

  steps.forEach((step, i) => {
    const [turnStart, turnEnd] = FEATURE_STEPS[i]
    const next = FEATURE_STEPS[i + 1]
    const title = step.querySelector('h3')
    timeline.fromTo(step, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, turnStart + 0.01)
    riseWords(timeline, splitHeading(title), turnStart + 0.01, turnEnd - turnStart)
    timeline.from(step.querySelectorAll('p, li'), { x: -36, autoAlpha: 0, duration: 0.06, stagger: 0.012, ease: 'power3.out' }, turnStart + 0.04)
    const out = next ? next[0] - 0.035 : 0.9
    timeline.to(step, { x: -40, autoAlpha: 0, duration: 0.035, ease: 'power2.in' }, out)
  })
  fadeUp(timeline, $(root, '.features__count'), FEATURE_STEPS[0][0])
  timeline.to($(root, '.features__count'), { autoAlpha: 0, duration: 0.03 }, 0.9)

  timeline.eventCallback('onUpdate', () => {
    const index = FEATURE_STEPS.findLastIndex(([start]) => state.u >= start - 0.02)
    count.textContent = String(Math.max(0, index) + 1).padStart(2, '0')
  })
  return chapter
}

const formatters = {
  decimal: (value) => value.toFixed(1),
  grouped: (value) => Math.round(value).toLocaleString('en-IN'),
  integer: (value) => String(Math.round(value)),
}

export function animateStadium(root, state, { reducedMotion }) {
  const chapter = createChapter(root, state, { pin: 2.4, reducedMotion, staticProgress: 1 })
  const { timeline } = chapter
  if (!timeline) return chapter

  riseWords(timeline, splitHeading($(root, 'h2')), 0.1, 0.16)
  fadeUp(timeline, $$(root, '[data-reveal]'), 0.18)

  // Counters climb as the last floodlights come on.
  $$(root, '[data-count]').forEach((element, i) => {
    const target = Number(element.dataset.count)
    const format = formatters[element.dataset.format ?? 'integer']
    const counter = { value: 0 }
    const stat = element.closest('.stat')
    timeline.from(stat, { y: 40, autoAlpha: 0, duration: 0.08, ease: 'power3.out' }, 0.5 + i * 0.05)
    timeline.to(
      counter,
      { value: target, duration: 0.26, ease: 'power2.out', onUpdate: () => (element.textContent = format(counter.value)) },
      0.52 + i * 0.05,
    )
    element.textContent = format(0)
  })
  return chapter
}

export function animateCta(root, state, { reducedMotion }) {
  const header = document.querySelector('.site-header')
  // The header switches to ink once the chalk panel is beneath it.
  ScrollTrigger.create({
    trigger: root,
    start: 'top 48px',
    endTrigger: '.footer',
    end: 'bottom top', // never reached, so the header stays ink right to the end of the page
    toggleClass: { targets: header, className: 'is-ink' },
  })

  const chapter = createChapter(root, state, { pin: 0.8, enter: false, reducedMotion, staticProgress: 0.5 })
  // Once unpinned the copy scrolls up into the footer; the product shot follows it (see scene/cta.js).
  state.releasedAt = () => chapter.range()[1]
  const { timeline } = chapter
  if (!timeline) return chapter

  // The panel arrives as solid chalk over the stadium; once pinned (and the 3D has cut to the
  // chalk studio beneath it) its backdrop clears to reveal the product shot.
  timeline.to($(root, '.cta__backdrop'), { autoAlpha: 0, duration: 0.3, ease: 'power2.inOut' }, 0)

  const words = splitHeading($(root, 'h2'))
  const reveal = gsap.timeline({
    scrollTrigger: { trigger: root, start: 'top 80%', end: 'top 10%', scrub: true },
  })
  reveal.from(words, { yPercent: 110, stagger: 0.08, ease: 'power3.out' })
  reveal.from($$(root, '[data-reveal]'), { y: 28, autoAlpha: 0, stagger: 0.1, ease: 'power3.out' }, 0.2)
  return chapter
}
