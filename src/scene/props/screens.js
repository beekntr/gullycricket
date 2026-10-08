import * as THREE from 'three'
import { asset } from '../../config.js'
import { canvasTexture, createCanvas, FONT_DISPLAY, painter } from '../utils/canvas.js'
import { nextIdle } from '../utils/timing.js'

/*
 * The app screens shown on the phone. Each one is drawn as a placeholder UI with dummy data.
 *
 * To use real screenshots instead, drop them in /public/screens/ and set the paths below
 * (portrait, ~19.5:9, no larger than 2048 px tall). Anything left null is drawn here.
 */
export const SCREEN_IMAGES = {
  home: null, // e.g. 'screens/home.png'
  team: null,
  live: null,
  contests: null,
}

export const SCREEN_ORDER = ['home', 'team', 'live', 'contests']

const BRAND = import.meta.env.VITE_BRAND_NAME ?? 'Brand'

// Designed in iPhone points; drawn at `scale` pixels per point.
const W = 390
const H = 845

const C = {
  bg: '#0B0B0A',
  surface: '#161614',
  raised: '#22221F',
  line: 'rgba(242,239,232,0.09)',
  chalk: '#F2EFE8',
  muted: 'rgba(242,239,232,0.58)',
  faint: 'rgba(242,239,232,0.3)',
  pitch: '#1F3B2C',
  red: '#B3261E',
  ink: '#0B0B0A',
}

const display = (size) => ({ size, weight: 400, family: FONT_DISPLAY })

function frame(p) {
  p.ctx.fillStyle = C.bg
  p.ctx.fillRect(0, 0, W, H)
  // Status bar and Dynamic Island.
  p.text('9:41', 38, 34, { size: 16, weight: 600 })
  p.rect(133, 11, 124, 36, 18, '#000')
  for (let i = 0; i < 4; i++) p.rect(288 + i * 6, 30 - (i + 1) * 3, 4, (i + 1) * 3, 1, C.chalk)
  p.stroke(316, 20, 27, 13, 4, C.muted, 1.2)
  p.rect(318.5, 22.5, 18, 8, 2, C.chalk)
  // Home indicator.
  p.rect(128, 832, 134, 5, 3, C.chalk)
}

function tabBar(p, active) {
  p.rect(0, 760, W, 1, 0, C.line)
  const tabs = ['Home', 'Matches', 'Contests', 'Profile']
  tabs.forEach((label, i) => {
    const x = 49 + i * 97
    const color = label === active ? C.chalk : C.faint
    const { ctx } = p
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    if (i === 0) {
      ctx.moveTo(x - 10, 787)
      ctx.lineTo(x, 778)
      ctx.lineTo(x + 10, 787)
      ctx.moveTo(x - 7, 785)
      ctx.lineTo(x - 7, 797)
      ctx.lineTo(x + 7, 797)
      ctx.lineTo(x + 7, 785)
    } else if (i === 1) {
      ctx.arc(x, 788, 9, 0, Math.PI * 2)
      ctx.moveTo(x - 9, 788)
      ctx.quadraticCurveTo(x, 782, x + 9, 788)
    } else if (i === 2) {
      ctx.moveTo(x - 8, 779)
      ctx.lineTo(x + 8, 779)
      ctx.lineTo(x + 6, 790)
      ctx.quadraticCurveTo(x, 794, x - 6, 790)
      ctx.closePath()
      ctx.moveTo(x, 793)
      ctx.lineTo(x, 798)
      ctx.moveTo(x - 5, 798)
      ctx.lineTo(x + 5, 798)
    } else {
      ctx.arc(x, 783, 5, 0, Math.PI * 2)
      ctx.moveTo(x - 9, 798)
      ctx.quadraticCurveTo(x, 786, x + 9, 798)
    }
    ctx.stroke()
    p.text(label, x, 815, { size: 10, weight: 600, color, align: 'center' })
  })
}

function sectionLabel(p, label, y, right) {
  p.text(label, 20, y, { size: 11, weight: 700, color: C.muted, tracking: 1.6 })
  if (right) p.text(right, 370, y, { size: 12, weight: 500, color: C.muted, align: 'right' })
}

function drawHome(p) {
  frame(p)
  p.text(BRAND.toUpperCase(), 20, 98, display(26))
  p.rect(268, 72, 102, 34, 17, C.raised)
  p.text('₹1,250', 319, 94, { size: 14, weight: 700, align: 'center' })

  p.text('Upcoming', 20, 142, { size: 15, weight: 700 })
  p.rect(20, 150, 70, 2, 1, C.chalk)
  p.circle(122, 137, 3.5, C.red)
  p.text('Live', 132, 142, { size: 15, weight: 600, color: C.muted })
  p.text('Results', 182, 142, { size: 15, weight: 600, color: C.muted })

  // Featured match.
  p.rect(16, 168, 358, 214, 22, C.pitch)
  p.text('T20 INTERNATIONAL · MATCH 3', 36, 200, { size: 11, weight: 700, color: C.muted, tracking: 1.4 })
  for (const [x, code, name] of [
    [72, 'IND', 'India'],
    [318, 'AUS', 'Australia'],
  ]) {
    p.circle(x, 252, 28, 'rgba(242,239,232,0.12)')
    p.text(code, x, 260, { ...display(19), align: 'center' })
    p.text(name, x, 302, { size: 13, weight: 600, color: C.muted, align: 'center' })
  }
  p.text('02h 14m', 195, 258, { ...display(32), align: 'center' })
  p.text('Today, 19:30', 195, 282, { size: 12, weight: 500, color: C.muted, align: 'center' })
  p.rect(36, 322, 318, 42, 21, C.chalk)
  p.text('Create your team', 195, 349, { size: 15, weight: 700, color: C.ink, align: 'center' })

  sectionLabel(p, 'MY CONTESTS', 420, 'See all')
  p.rect(16, 434, 358, 74, 18, C.surface)
  p.text('Head-to-head', 34, 464, { size: 15, weight: 700 })
  p.text('Entry ₹100 · Win ₹180', 34, 488, { size: 12, color: C.muted })
  p.stroke(286, 456, 70, 26, 13, C.faint, 1.2)
  p.text('JOINED', 321, 473, { size: 10, weight: 700, align: 'center', tracking: 1 })

  p.rect(16, 518, 358, 74, 18, C.surface)
  p.text('Friends League', 34, 548, { size: 15, weight: 700 })
  p.text('6 of 10 joined · Free', 34, 572, { size: 12, color: C.muted })
  ;['#3a3a36', '#2c4d3a', '#5a2420'].forEach((color, i) => p.circle(300 + i * 18, 555, 14, color))

  sectionLabel(p, 'COMING UP', 628)
  for (const [y, teams, when] of [
    [642, 'ENG vs SA', 'Tomorrow, 19:30'],
    [700, 'NZ vs PAK', 'Sat, 14:00'],
  ]) {
    p.rect(16, y, 358, 50, 14, C.surface)
    p.text(teams, 34, y + 31, { size: 15, weight: 700 })
    p.text(when, 356, y + 31, { size: 12, color: C.muted, align: 'right' })
  }
  tabBar(p, 'Home')
}

const SQUAD = [
  ['KV', 'K. Varma', 'IND · BAT', '9.5', '412', 'C'],
  ['LB', 'L. Brooks', 'AUS · BAT', '9.0', '388', null],
  ['RN', 'R. Nair', 'IND · BAT', '8.5', '351', 'VC'],
  ['DF', 'D. Fischer', 'AUS · BAT', '8.0', '296', null],
  ['SB', 'S. Banerjee', 'IND · BAT', '7.5', '240', 'off'],
  ['JK', 'J. Kowalski', 'AUS · BAT', '7.0', '198', 'off'],
]

function drawTeam(p) {
  frame(p)
  p.text('‹', 18, 102, { size: 32, weight: 400 })
  p.text('Create team', 40, 97, { size: 18, weight: 700 })
  p.text('02h 14m left', 370, 97, { size: 12, color: C.muted, align: 'right' })

  p.rect(16, 116, 358, 92, 18, C.surface)
  p.text('Players', 34, 142, { size: 11, color: C.muted })
  p.text('11/11', 34, 176, display(28))
  p.text('Credits left', 140, 142, { size: 11, color: C.muted })
  p.text('7.5', 140, 176, display(28))
  for (let i = 0; i < 11; i++) p.rect(236 + i * 11, 156, 8, 18, 2, i < 11 ? C.chalk : C.raised)
  p.text('IND 6 · AUS 5', 356, 196, { size: 11, color: C.muted, align: 'right' })

  const tabs = [
    ['WK 1', 50],
    ['BAT 4', 140],
    ['AR 2', 240],
    ['BOWL 4', 330],
  ]
  tabs.forEach(([label, x], i) => p.text(label, x, 244, { size: 13, weight: 700, color: i === 1 ? C.chalk : C.faint, align: 'center' }))
  p.rect(0, 256, W, 1, 0, C.line)
  p.rect(108, 254, 64, 3, 1.5, C.chalk)

  p.text('Player', 70, 280, { size: 11, color: C.faint })
  p.text('Points', 258, 280, { size: 11, color: C.faint, align: 'right' })
  p.text('Credits', 318, 280, { size: 11, color: C.faint, align: 'right' })

  SQUAD.forEach(([initials, name, meta, credits, points, badge], i) => {
    const y = 292 + i * 64
    const picked = badge !== 'off'
    if (picked) p.rect(0, y, W, 62, 0, 'rgba(242,239,232,0.03)')
    p.circle(42, y + 31, 20, C.raised)
    p.text(initials, 42, y + 36, { size: 13, weight: 700, align: 'center' })
    if (badge === 'C') {
      p.circle(58, y + 15, 10, C.red)
      p.text('C', 58, y + 19, { size: 11, weight: 800, align: 'center' })
    } else if (badge === 'VC') {
      p.circle(58, y + 15, 10, C.chalk)
      p.text('VC', 58, y + 18.5, { size: 8.5, weight: 800, color: C.ink, align: 'center' })
    }
    p.text(name, 74, y + 28, { size: 15, weight: 700, color: picked ? C.chalk : C.muted })
    p.text(meta, 74, y + 47, { size: 11, color: C.muted })
    p.text(points, 258, y + 37, { size: 14, weight: 600, color: C.muted, align: 'right' })
    p.text(credits, 318, y + 37, { size: 15, weight: 700, align: 'right' })
    if (picked) {
      p.circle(352, y + 31, 12, C.chalk)
      const { ctx } = p
      ctx.strokeStyle = C.ink
      ctx.lineWidth = 2.2
      ctx.beginPath()
      ctx.moveTo(346, y + 31)
      ctx.lineTo(350.5, y + 35.5)
      ctx.lineTo(358, y + 26.5)
      ctx.stroke()
    } else {
      p.stroke(340, y + 19, 24, 24, 12, C.faint, 1.5)
      p.text('+', 352, y + 37, { size: 16, weight: 600, color: C.muted, align: 'center' })
    }
    p.rect(20, y + 62, 350, 1, 0, C.line)
  })

  p.stroke(16, 734, 171, 50, 25, C.faint, 1.5)
  p.text('Preview', 101.5, 765, { size: 15, weight: 700, align: 'center' })
  p.rect(203, 734, 171, 50, 25, C.chalk)
  p.text('Save team', 288.5, 765, { size: 15, weight: 700, color: C.ink, align: 'center' })
}

const FEED = [
  ['17.3', '4', 'D. Fischer to K. Varma', 'Four, driven through cover', '+4'],
  ['17.2', 'W', 'M. Okafor to P. Rana', 'Caught at mid-on', '+25'],
  ['17.1', '•', 'M. Okafor to P. Rana', 'Dot ball, beaten outside off', '+1'],
  ['16.6', '6', 'A. Haddad to K. Varma', 'Six over long-on', '+8'],
  ['16.5', '1', 'A. Haddad to R. Nair', 'Single to deep square', '+1'],
]

function drawLive(p) {
  frame(p)
  p.circle(26, 92, 4.5, C.red)
  p.text('LIVE', 38, 97, { size: 12, weight: 800, color: C.red, tracking: 1.6 })
  p.text('T20I · Match 3', 370, 97, { size: 12, color: C.muted, align: 'right' })

  p.rect(16, 114, 358, 124, 22, C.surface)
  p.text('AUS  174/6  (20)', 34, 144, { size: 13, weight: 600, color: C.muted })
  p.text('RRR 5.20', 356, 144, { size: 12, color: C.muted, align: 'right' })
  p.text('IND', 34, 190, display(22))
  p.text('162/4', 80, 192, display(42))
  p.text('(17.3)', 186, 190, { size: 13, color: C.muted })
  p.text('India need 13 off 15 balls', 34, 222, { size: 13, weight: 600 })

  p.rect(16, 250, 358, 152, 22, C.pitch)
  p.text('YOUR TEAM', 34, 280, { size: 11, weight: 700, color: C.muted, tracking: 1.6 })
  p.text('487.5', 34, 340, display(56))
  p.text('pts', 34 + p.measure('487.5', 56, 400, FONT_DISPLAY) + 8, 338, { size: 14, weight: 600, color: C.muted })
  p.text('Rank #1,284', 34, 378, { size: 14, weight: 700 })
  p.text('up 312 places', 130, 378, { size: 12, color: C.muted })
  // Points by over.
  const series = [8, 14, 13, 22, 30, 33, 41, 46, 52, 60, 64, 73, 80]
  const { ctx } = p
  ctx.strokeStyle = C.chalk
  ctx.lineWidth = 2
  ctx.lineJoin = 'round'
  ctx.beginPath()
  series.forEach((value, i) => {
    const x = 222 + i * 11
    const y = 372 - value
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()
  p.circle(222 + 12 * 11, 372 - 80, 4, C.chalk)

  sectionLabel(p, 'BALL BY BALL', 434)
  FEED.forEach(([over, event, who, what, points], i) => {
    const y = 446 + i * 62
    if (i === 0) p.rect(10, y + 2, 370, 58, 14, 'rgba(242,239,232,0.04)')
    p.text(over, 22, y + 37, { size: 12, weight: 600, color: C.muted })
    const fill = event === 'W' ? C.red : event === '4' || event === '6' ? C.chalk : C.raised
    p.circle(80, y + 31, 17, fill)
    p.text(event, 80, y + 37, { size: 15, weight: 800, color: fill === C.chalk ? C.ink : C.chalk, align: 'center' })
    p.text(who, 108, y + 27, { size: 14, weight: 700 })
    p.text(what, 108, y + 46, { size: 12, color: C.muted })
    p.text(points, 368, y + 37, { size: 15, weight: 800, align: 'right' })
  })
  tabBar(p, 'Matches')
}

const CONTESTS = [
  { y: 166, h: 196, label: 'MEGA CONTEST', prize: '₹50,00,000', entry: '₹49', fill: 0.78, left: '6,63,210 joined', right: '8,50,000 spots', foot: '1st prize ₹10 Lakh · 58% win', cta: 'Join', primary: true },
  { y: 374, h: 116, label: 'HEAD-TO-HEAD', prize: '₹180', entry: '₹100', foot: '1 spot left', cta: 'Join' },
  { y: 502, h: 116, label: 'FRIENDS LEAGUE · PRIVATE', prize: '6/10', entry: 'Free', foot: 'Closes at the toss', cta: 'Invite' },
  { y: 630, h: 116, label: 'PRACTICE', prize: 'Free play', entry: 'Free', foot: 'Unlimited spots', cta: 'Join' },
]

function drawContests(p) {
  frame(p)
  p.text('Contests', 20, 98, { size: 22, weight: 800 })
  p.text('IND vs AUS · 02h 14m', 370, 97, { size: 12, color: C.muted, align: 'right' })

  let x = 20
  ;['All', 'Mega', 'Head-to-head', 'Free'].forEach((chip, i) => {
    const width = p.measure(chip, 13, 700) + 28
    if (i === 0) p.rect(x, 116, width, 32, 16, C.chalk)
    else p.stroke(x, 116, width, 32, 16, C.faint, 1.2)
    p.text(chip, x + width / 2, 137, { size: 13, weight: 700, color: i === 0 ? C.ink : C.chalk, align: 'center' })
    x += width + 8
  })

  for (const contest of CONTESTS) {
    const { y, h } = contest
    p.rect(16, y, 358, h, 22, C.surface)
    p.text(contest.label, 34, y + 30, { size: 11, weight: 700, color: C.muted, tracking: 1.4 })

    if (contest.primary) {
      p.text('Prize pool', 34, y + 54, { size: 12, color: C.muted })
      p.text(contest.prize, 34, y + 94, display(38))
      p.text('Entry', 356, y + 54, { size: 12, color: C.muted, align: 'right' })
      p.text(contest.entry, 356, y + 84, { ...display(24), align: 'right' })
      p.rect(34, y + 112, 322, 6, 3, C.raised)
      p.rect(34, y + 112, 322 * contest.fill, 6, 3, C.chalk)
      p.text(contest.left, 34, y + 140, { size: 12, color: C.muted })
      p.text(contest.right, 356, y + 140, { size: 12, color: C.muted, align: 'right' })
      p.text(contest.foot, 34, y + h - 22, { size: 12, color: C.muted })
      p.rect(276, y + h - 46, 80, 34, 17, C.red)
      p.text(contest.cta, 316, y + h - 24, { size: 14, weight: 700, align: 'center' })
      continue
    }

    // Compact card: prize and note on the left, entry and action on the right.
    p.text(contest.prize, 34, y + 76, display(30))
    p.text(contest.foot, 34, y + 100, { size: 12, color: C.muted })
    p.text(`Entry ${contest.entry}`, 356, y + 30, { size: 12, weight: 600, color: C.muted, align: 'right' })
    p.rect(276, y + 58, 80, 34, 17, C.chalk)
    p.text(contest.cta, 316, y + 80, { size: 14, weight: 700, color: C.ink, align: 'center' })
  }
  tabBar(p, 'Contests')
}

const PAINTERS = { home: drawHome, team: drawTeam, live: drawLive, contests: drawContests }

async function loadImage(path, renderer) {
  const texture = await new THREE.TextureLoader().loadAsync(asset(path))
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  return texture
}

/** Build every screen texture, yielding between each so the main thread never stalls for long. */
export async function createScreens(renderer, { width }) {
  const scale = width / W
  const textures = {}
  for (const name of SCREEN_ORDER) {
    await nextIdle()
    if (SCREEN_IMAGES[name]) {
      textures[name] = await loadImage(SCREEN_IMAGES[name], renderer)
    } else {
      const { canvas, ctx } = createCanvas(Math.round(W * scale), Math.round(H * scale))
      ctx.scale(scale, scale)
      PAINTERS[name](painter(ctx))
      textures[name] = canvasTexture(canvas, renderer)
    }
    renderer.initTexture(textures[name]) // upload now rather than on first sight
  }
  return textures
}
