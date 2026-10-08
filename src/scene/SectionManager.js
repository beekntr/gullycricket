import { disposeObject } from './utils/dispose.js'

/*
 * Lifecycle for each chapter's 3D content.
 *
 * Residency: a chapter is loaded and mounted from one viewport before its scroll range starts
 * until one viewport after it ends. Outside that window its group is removed and its GPU
 * resources disposed, so only the neighbourhood of the current scroll position is on the GPU.
 * Freshly loaded content is compiled asynchronously before it's shown, so it doesn't hitch.
 *
 * Ownership: the latest resident chapter whose range has started "owns" the frame: it drives the
 * shared camera, light rig, ball and phone, and only its own group is drawn.
 *
 * A chapter is { id, group?, load?(), mount?(), unmount?(), update(dt, time, isOwner), resize?(size) }.
 * load() builds `group` (or acquires shared props); unmount() releases what load() acquired.
 */

const RESIDENT_MARGIN = 1 // viewports either side of a chapter's scroll range

export class SectionManager {
  #entries = []
  #owner = null

  /** `beforeUpdate` runs each frame before the chapters, e.g. to hide shared props by default. */
  constructor(stage, { beforeUpdate } = {}) {
    this.stage = stage
    this.beforeUpdate = beforeUpdate
    stage.onResize((size) => {
      for (const { section } of this.#entries) section.resize?.(size)
    })
  }

  /** `range` returns the chapter's [start, end] scroll position in px. */
  add(section, range) {
    this.#entries.push({ section, range, status: 'idle' })
    section.resize?.(this.stage.size)
  }

  /** Load and mount straight away, regardless of scroll (the hero, behind the loader). */
  async activate(section) {
    const entry = this.#entries.find((candidate) => candidate.section === section)
    await this.#load(entry)
    this.#mount(entry)
  }

  update = (dt, time) => {
    const scroll = window.scrollY
    const margin = window.innerHeight * RESIDENT_MARGIN
    let owner = null

    for (const entry of this.#entries) {
      const [start, end] = entry.range()
      const near = scroll >= start - margin && scroll <= end + margin

      if (near && entry.status === 'idle') this.#load(entry)
      else if (near && entry.status === 'loaded') this.#mount(entry)
      else if (!near && (entry.status === 'loaded' || entry.status === 'mounted')) this.#evict(entry)

      if (entry.status === 'mounted' && (!owner || scroll >= start)) owner = entry
    }

    if (owner !== this.#owner) {
      this.#owner = owner
      this.stage.requestRender()
    }

    this.beforeUpdate?.()
    for (const entry of this.#entries) {
      if (entry.status !== 'mounted') continue
      const isOwner = entry === owner
      if (entry.section.group) entry.section.group.visible = isOwner
      entry.section.update(dt, time, isOwner)
    }
  }

  async #load(entry) {
    entry.status = 'loading'
    try {
      await entry.section.load?.()
      const { group } = entry.section
      if (group) await this.stage.renderer.compileAsync(group, this.stage.camera, this.stage.scene)
      entry.status = 'loaded'
    } catch (error) {
      entry.status = 'failed'
      console.error(`[sections] "${entry.section.id}" failed to load`, error)
    }
  }

  #mount(entry) {
    if (entry.status !== 'loaded') return
    const { section } = entry
    if (section.group) this.stage.scene.add(section.group)
    section.mount?.()
    entry.status = 'mounted'
    this.stage.requestRender()
  }

  #evict(entry) {
    const { section } = entry
    if (section.group) {
      section.group.removeFromParent()
      disposeObject(section.group)
      section.group = null
    }
    section.unmount?.()
    entry.status = 'idle'
    this.stage.requestRender()
  }
}
