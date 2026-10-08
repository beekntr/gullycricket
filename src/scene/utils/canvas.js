import * as THREE from 'three'

export const FONT_DISPLAY = 'Anton'
export const FONT_BODY = '"Hanken Grotesk Variable"'

export function createCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return { canvas, ctx: canvas.getContext('2d') }
}

/** Upload-ready sRGB texture from a canvas, with anisotropic filtering for oblique views. */
export function canvasTexture(canvas, renderer, anisotropy = 8) {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = Math.min(anisotropy, renderer.capabilities.getMaxAnisotropy())
  return texture
}

/** Small drawing kit for the generated UI and labels. Coordinates are in the caller's units. */
export function painter(ctx) {
  return {
    ctx,
    fill(color) {
      ctx.fillStyle = color
      ctx.fill()
    },
    rect(x, y, w, h, r, color) {
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, r)
      ctx.fillStyle = color
      ctx.fill()
    },
    stroke(x, y, w, h, r, color, width = 1) {
      ctx.beginPath()
      ctx.roundRect(x + width / 2, y + width / 2, w - width, h - width, r)
      ctx.strokeStyle = color
      ctx.lineWidth = width
      ctx.stroke()
    },
    circle(x, y, r, color) {
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    },
    text(value, x, y, { size = 14, weight = 500, color = '#F2EFE8', align = 'left', family = FONT_BODY, tracking = 0 } = {}) {
      ctx.font = `${weight} ${size}px ${family}`
      ctx.fillStyle = color
      ctx.textAlign = align
      ctx.textBaseline = 'alphabetic'
      ctx.letterSpacing = `${tracking}px`
      ctx.fillText(value, x, y)
      ctx.letterSpacing = '0px'
    },
    measure(value, size, weight = 500, family = FONT_BODY) {
      ctx.font = `${weight} ${size}px ${family}`
      return ctx.measureText(value).width
    },
  }
}
