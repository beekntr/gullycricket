import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'

const PIN_LENGTH = '+=220%' // scroll distance the hero stays pinned for

/**
 * Section 1 motion: an intro that plays once when the loader clears, and a pinned, scrubbed
 * timeline that lifts the copy away while the camera pushes into the seam.
 *
 * The intro and the scroll-out deliberately animate different elements (words vs. lines,
 * [data-hero-fade] vs. [data-hero-exit]) so the two can overlap without fighting.
 */
export function createHeroAnimations(root, sceneState, { reducedMotion }) {
  const title = root.querySelector('[data-hero-title]')
  const lines = title.querySelectorAll('.hero__line')
  const fades = root.querySelectorAll('[data-hero-fade]')
  const exits = root.querySelectorAll('[data-hero-exit]')

  if (reducedMotion) {
    // No pin, no scrub: a static frame and a plain fade-in.
    const trigger = ScrollTrigger.create({ trigger: root, start: 'top top', end: 'bottom top' })
    const intro = gsap.timeline({ paused: true }).fromTo(
      [title, ...fades],
      { autoAlpha: 0 },
      { autoAlpha: 1, duration: 0.6, ease: 'power1.out' },
    )
    return { trigger, intro }
  }

  // aria: 'auto' keeps the heading readable as one phrase to assistive tech.
  const split = SplitText.create(title, { type: 'words', mask: 'words', aria: 'auto' })
  title.setAttribute('aria-label', title.textContent.replace(/\s+/g, ' ').trim())

  gsap.set(split.words, { yPercent: 105, autoAlpha: 0 })
  gsap.set(fades, { y: 24, autoAlpha: 0 })

  const intro = gsap
    .timeline({ paused: true })
    .to(sceneState, { intro: 1, duration: 3.2, ease: 'power2.inOut' }, 0)
    .to(split.words, { yPercent: 0, autoAlpha: 1, duration: 1.6, stagger: 0.09, ease: 'expo.out' }, 0.6)
    .to(fades, { y: 0, autoAlpha: 1, duration: 1.4, stagger: 0.12, ease: 'power3.out' }, 1.1)

  const scroll = gsap.timeline({
    defaults: { ease: 'none' },
    scrollTrigger: {
      trigger: root,
      start: 'top top',
      end: PIN_LENGTH,
      pin: true,
      scrub: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  })

  scroll
    .to(sceneState, { push: 1, duration: 1, ease: 'power3.inOut' }, 0)
    .to(lines, { yPercent: -35, autoAlpha: 0, duration: 0.24, stagger: 0.05, ease: 'power2.in' }, 0.02)
    .to(exits, { y: -24, autoAlpha: 0, duration: 0.2, ease: 'power2.in' }, 0)

  return { trigger: scroll.scrollTrigger, intro }
}
