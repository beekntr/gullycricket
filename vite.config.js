import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // Keep three's core in its own long-cached chunk. Addons (GLTFLoader, DRACOLoader) are
        // left out so they stay in the lazily imported chunk the model sections pull in.
        manualChunks(id) {
          if (/node_modules\/three\/(build|src)\//.test(id)) return 'three'
        },
      },
    },
  },
})
