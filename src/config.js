const matches = (query) => window.matchMedia(query).matches

export const reducedMotion = matches('(prefers-reduced-motion: reduce)')

// "Mobile" means the lighter scene tier: phones, and touch tablets in portrait.
export const isMobile = matches('(max-width: 767px)') || matches('(pointer: coarse) and (max-width: 1024px)')

export const MAX_PIXEL_RATIO = isMobile ? 1.5 : 2

export const quality = {
  shadows: !isMobile,
  // Extra procedural detail in the leather/thread shaders (fine grain octave, stitch holes).
  shaderDetail: !isMobile,
  sphereSegments: isMobile ? 96 : 160,
  stitchesPerRow: isMobile ? 150 : 200,
}

/** Resolve a file in /public against the deploy base path. */
export const asset = (path) => `${import.meta.env.BASE_URL}${path}`
