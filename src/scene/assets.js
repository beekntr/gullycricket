import * as THREE from 'three'
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js'
import { asset } from '../config.js'

/** Every network load and every tracked chunk of CPU work reports progress here. */
export const manager = new THREE.LoadingManager()

/**
 * Register a unit of work with the loading manager before it starts, so the total is known
 * up front and the progress readout never runs backwards.
 */
export function track(label) {
  manager.itemStart(label)
  let done = false
  return () => {
    if (done) return
    done = true
    manager.itemEnd(label)
  }
}

/**
 * Load the HDRI and install it as the scene's image-based lighting.
 * (three r180 renamed RGBELoader to HDRLoader; it is the same Radiance .hdr loader.)
 */
export async function loadEnvironment(stage, path) {
  const hdr = await new HDRLoader(manager).loadAsync(asset(path))
  const pmrem = new THREE.PMREMGenerator(stage.renderer)
  const envMap = pmrem.fromEquirectangular(hdr).texture
  hdr.dispose()
  pmrem.dispose()
  stage.scene.environment = envMap
  return envMap
}

let gltfLoader

/**
 * Load a Draco-compressed glTF. The loaders are code-split and only fetched the first time
 * a section asks for a model, so the hero never pays for them.
 */
export async function loadModel(path) {
  if (!gltfLoader) {
    const [{ GLTFLoader }, { DRACOLoader, DRACO_GLTF_CONFIG }] = await Promise.all([
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/loaders/DRACOLoader.js'),
    ])
    // The glTF-only decoder build; Vite bundles it from three via import.meta.url.
    const draco = new DRACOLoader(manager).setDecoderPath(DRACO_GLTF_CONFIG)
    gltfLoader = new GLTFLoader(manager).setDRACOLoader(draco)
  }
  return gltfLoader.loadAsync(asset(path))
}
