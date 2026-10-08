/** Free the GPU resources (geometries, materials, textures, shadow maps) under `root`. */
export function disposeObject(root) {
  root.traverse((object) => {
    object.geometry?.dispose()

    const materials = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if (!material) continue
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose()
      }
      material.dispose()
    }

    // Lights own their shadow map; instanced meshes own their instance buffers.
    if (object.isLight || object.isInstancedMesh) object.dispose()
  })
}
