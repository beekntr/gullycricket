import gsap from 'gsap'

/**
 * Minimal loading screen fed by the LoadingManager. The number eases toward the real progress
 * and never runs backwards.
 */
export function createLoader(element, manager, { reducedMotion }) {
  const value = element.querySelector('[data-loader-value]')
  const bar = element.querySelector('[data-loader-bar]')
  const shown = { progress: 0 }
  let target = 0

  const render = () => {
    const percent = Math.round(shown.progress * 100)
    value.textContent = percent
    bar.style.transform = `scaleX(${shown.progress})`
    element.setAttribute('aria-valuenow', percent)
  }

  const chase = (to, duration) =>
    gsap.to(shown, { progress: to, duration, ease: 'power3.out', overwrite: true, onUpdate: render })

  manager.onProgress = (_url, loaded, total) => {
    target = Math.max(target, loaded / total)
    chase(target, 0.8)
  }

  return {
    async finish() {
      // Later, lazily loaded sections report to the same manager; they're not the loader's business.
      manager.onProgress = undefined
      await chase(1, 0.5)
      await gsap.to(element, {
        autoAlpha: 0,
        duration: reducedMotion ? 0.3 : 0.9,
        ease: 'power3.inOut',
      })
      element.remove()
    },
  }
}
