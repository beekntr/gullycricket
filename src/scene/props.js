/**
 * Shared, reference-counted scene props (the phone appears in three chapters). The first chapter
 * to need a prop builds it; it's disposed when the last chapter using it is evicted.
 *
 * A prop factory returns { object, dispose() }; the object is added to the scene here.
 * Chapters that don't use a prop never touch it, and the owner of each frame decides visibility.
 */
export function createProps(stage) {
  const entries = new Map()

  return {
    define(name, factory) {
      entries.set(name, { factory, users: 0, promise: null, value: null })
    },

    acquire(name) {
      const entry = entries.get(name)
      entry.users++
      entry.promise ??= (async () => {
        const value = await entry.factory()
        value.object.visible = false
        stage.scene.add(value.object)
        await stage.renderer.compileAsync(value.object, stage.camera, stage.scene)
        entry.value = value
        return value
      })()
      return entry.promise
    },

    release(name) {
      const entry = entries.get(name)
      entry.users = Math.max(0, entry.users - 1)
      if (entry.users > 0 || !entry.promise) return
      const pending = entry.promise
      entry.promise = null
      entry.value = null
      pending.then((value) => value.dispose())
    },

    /** The prop if it's built and live, else null. */
    get(name) {
      return entries.get(name).value
    },
  }
}
