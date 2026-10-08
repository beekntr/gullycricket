import '@fontsource/anton/400.css'
import '@fontsource-variable/hanken-grotesk/index.css'
import './styles/main.css'

import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'

import { isMobile, MAX_PIXEL_RATIO, quality, reducedMotion } from './config.js'
import { Stage } from './scene/Stage.js'
import { SectionManager } from './scene/SectionManager.js'
import { createRig } from './scene/rig.js'
import { createProps } from './scene/props.js'
import { loadEnvironment, manager, track } from './scene/assets.js'
import { createBall } from './scene/props/ball.js'
import { createDevice } from './scene/props/device.js'
import { createHeroScene } from './scene/hero.js'
import { createDeliveryScene } from './scene/delivery.js'
import { createPhoneScene } from './scene/phone.js'
import { createFeaturesScene } from './scene/features.js'
import { createStadiumScene } from './scene/stadium.js'
import { createCtaScene } from './scene/cta.js'
import { createSmoothScroll } from './animations/smoothScroll.js'
import { createHeroAnimations } from './animations/hero.js'
import { animateCta, animateDelivery, animateFeatures, animatePhone, animateStadium } from './animations/chapters.js'
import { createLoader } from './ui/loader.js'

gsap.registerPlugin(ScrollTrigger, SplitText)

// The story always starts at the top; restoring a mid-pin scroll position would skip the intro.
history.scrollRestoration = 'manual'
window.scrollTo(0, 0)
document.documentElement.classList.add('is-loading')

const chapterRoot = (name) => document.querySelector(`[data-chapter="${name}"]`)

/** Boot the WebGL side. Returns null (and the page carries on as plain HTML) if WebGL is unavailable. */
function createScene() {
  try {
    const stage = new Stage(document.querySelector('[data-webgl]'), {
      maxPixelRatio: MAX_PIXEL_RATIO,
      shadows: quality.shadows,
    })
    // Reduced motion: nothing animates, so only draw when something actually changes.
    stage.continuous = !reducedMotion

    const rig = createRig(stage, { shadows: quality.shadows })
    const props = createProps(stage)
    props.define('device', () => createDevice({ renderer: stage.renderer, quality }))

    const ball = createBall(quality)
    stage.scene.add(ball.object)

    // Shared props are hidden each frame unless the chapter that owns the frame shows them.
    const sections = new SectionManager(stage, {
      beforeUpdate() {
        ball.object.visible = false
        ball.castShadows(false)
        const device = props.get('device')
        if (device) device.object.visible = false
      },
    })

    const context = { stage, rig, ball, props, quality, reducedMotion, isMobile }
    const scenes = {
      hero: createHeroScene(context),
      delivery: createDeliveryScene(context),
      phone: createPhoneScene(context),
      features: createFeaturesScene(context),
      stadium: createStadiumScene(context),
      cta: createCtaScene(context),
    }
    return { stage, sections, scenes }
  } catch (error) {
    console.error('WebGL unavailable; continuing without the 3D scene.', error)
    document.querySelector('[data-webgl]').remove()
    return null
  }
}

async function init() {
  const loader = createLoader(document.querySelector('[data-loader]'), manager, { reducedMotion })
  // Register every boot task up front so the total is known and the % never runs backwards.
  const fontsLoaded = track('fonts')
  const shadersCompiled = track('shaders')

  const lenis = reducedMotion ? null : createSmoothScroll()
  lenis?.stop()

  const scene = createScene()

  await Promise.all([
    scene &&
      loadEnvironment(scene.stage, 'hdri/studio_small_09_1k.hdr').catch((error) =>
        console.error('HDRI failed to load; lighting without it.', error),
      ),
    Promise.all([document.fonts.load('1em Anton'), document.fonts.load('1em "Hanken Grotesk Variable"')])
      .catch(() => {})
      .then(fontsLoaded),
  ])

  // Scroll choreography, in page order (ScrollTrigger measures pins in creation order).
  // Each chapter's 3D state is a plain object its timeline writes and its scene reads.
  const state = (name) => (scene ? scene.scenes[name].state : {})
  const options = { reducedMotion }
  const hero = createHeroAnimations(chapterRoot('hero'), state('hero'), options)
  const chapters = {
    hero: { range: () => [hero.trigger.start, hero.trigger.end] },
    delivery: animateDelivery(chapterRoot('delivery'), state('delivery'), options),
    phone: animatePhone(chapterRoot('phone'), state('phone'), options),
    features: animateFeatures(chapterRoot('features'), state('features'), options),
    stadium: animateStadium(chapterRoot('stadium'), state('stadium'), options),
    cta: animateCta(chapterRoot('cta'), state('cta'), options),
  }

  if (scene) {
    const { stage, sections, scenes } = scene
    for (const [name, chapter] of Object.entries(chapters)) sections.add(scenes[name], chapter.range)
    await sections.activate(scenes.hero)
    stage.onFrame(sections.update)
    sections.update(0, 0)
    await stage.precompile()
    stage.start()
  }
  shadersCompiled()

  ScrollTrigger.refresh()
  await loader.finish()
  document.documentElement.classList.remove('is-loading')
  lenis?.start()
  hero.intro.play()
}

init()
