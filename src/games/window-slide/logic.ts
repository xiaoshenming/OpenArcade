export type SceneApex = { x: number; y: number; sweep: number }
export type SceneStar = { x: number; y: number; r: number }
export type SceneRidge = { color: string; apexes: SceneApex[] }
export type SceneMoon = { x: number; y: number; r: number; glow: number; color: string; glowColor: string }

export interface Scene {
  name: string
  sky: readonly [string, string, string]
  star: string
  stars: SceneStar[]
  moon: SceneMoon
  ridges: SceneRidge[]
}

export interface SceneSlice {
  image: string
  position: string
  size: string
}

interface PaletteSpec {
  name: string
  sky: [string, string, string]
  ridge: [string, string, string]
  moon: string
  glow: string
  star: string
}

const PALETTES: readonly PaletteSpec[] = [
  { name: '月夜', sky: ['#0a0f24', '#1d2c55', '#4a6a96'], ridge: ['#243a68', '#182a4e', '#101c38'], moon: '#f2eeda', glow: 'rgba(242,238,218,.30)', star: 'rgba(255,255,255,.92)' },
  { name: '暮橙', sky: ['#1a1030', '#5b2a4e', '#e8895b'], ridge: ['#4a2450', '#331a3e', '#1f1029'], moon: '#ffd9a0', glow: 'rgba(255,190,120,.28)', star: 'rgba(255,235,210,.9)' },
  { name: '青晨', sky: ['#123047', '#1f5a6b', '#7fc9b4'], ridge: ['#1d505e', '#143a47', '#0b2632'], moon: '#eef7f2', glow: 'rgba(210,240,230,.26)', star: 'rgba(240,255,250,.85)' },
  { name: '紫霭', sky: ['#170f2e', '#3a2358', '#8a5d94'], ridge: ['#3d2657', '#2b1a41', '#1a102b'], moon: '#f5e8ff', glow: 'rgba(230,200,255,.30)', star: 'rgba(245,235,255,.9)' },
  { name: '霜晨', sky: ['#132038', '#2e4a6b', '#a8c4d8'], ridge: ['#33506f', '#243c58', '#15263e'], moon: '#f7fbff', glow: 'rgba(220,235,250,.30)', star: 'rgba(255,255,255,.88)' },
  { name: '琥珀', sky: ['#241305', '#5c3410', '#d29a4a'], ridge: ['#4c2c12', '#371f0c', '#20120a'], moon: '#ffe9c0', glow: 'rgba(255,210,150,.30)', star: 'rgba(255,240,215,.85)' },
  { name: '黛山', sky: ['#0c1f1d', '#1b4038', '#4f8a72'], ridge: ['#173a33', '#102b26', '#081b17'], moon: '#e8f5ec', glow: 'rgba(200,240,220,.25)', star: 'rgba(230,250,240,.85)' },
  { name: '绯夜', sky: ['#1c0d1c', '#451b3a', '#b0526a'], ridge: ['#3a1a3d', '#28122c', '#170a1b'], moon: '#ffe4ea', glow: 'rgba(255,190,205,.28)', star: 'rgba(255,235,240,.9)' },
]

const RIDGE_BASES = [36, 58, 80] as const
const DEPTH = 'linear-gradient(0deg, rgba(5,9,20,.46) 0%, rgba(5,9,20,.16) 7%, transparent 16%)'
const round2 = (value: number) => Math.round(value * 100) / 100

export function buildScene(random: () => number, size: number): Scene {
  const palette = PALETTES[Math.floor(random() * PALETTES.length) % PALETTES.length]
  const stars = Array.from({ length: 10 + size * 2 }, () => ({
    x: round2(random() * 100),
    y: round2(3 + random() * 22),
    r: round2(0.9 + random() * 0.6),
  }))
  const radius = round2(3.6 + random() * 1.8)
  const moon: SceneMoon = {
    x: round2(14 + random() * 72),
    y: round2(6 + random() * 14),
    r: radius,
    glow: round2(radius * 3.4),
    color: palette.moon,
    glowColor: palette.glow,
  }
  const ridges = RIDGE_BASES.map((base, index) => {
    const count = size + 1
    const apexes = Array.from({ length: count }, (_, apex) => ({
      x: round2(-12 + (124 * apex) / (count - 1) + (random() * 8 - 4)),
      y: round2(base + (random() * 12 - 6)),
      sweep: round2(118 + random() * 14),
    }))
    return { color: palette.ridge[index], apexes }
  })
  return { name: palette.name, sky: palette.sky, star: palette.star, stars, moon, ridges }
}

function ridgeGradients(ridge: SceneRidge) {
  return ridge.apexes.map((apex) => `conic-gradient(from 180deg at ${apex.x}% ${apex.y}%, ${ridge.color} 0deg ${apex.sweep}deg, transparent ${apex.sweep}deg)`)
}

export function sceneLayers(scene: Scene): string {
  const layers = [
    DEPTH,
    ...ridgeGradients(scene.ridges[2]),
    ...ridgeGradients(scene.ridges[1]),
    ...ridgeGradients(scene.ridges[0]),
    ...scene.stars.map((star) => `radial-gradient(${star.r}% ${star.r}% at ${star.x}% ${star.y}%, ${scene.star} 0 42%, transparent 80%)`),
    `radial-gradient(${scene.moon.glow}% ${scene.moon.glow}% at ${scene.moon.x}% ${scene.moon.y}%, ${scene.moon.glowColor} 0%, transparent 72%)`,
    `radial-gradient(${scene.moon.r}% ${scene.moon.r}% at ${scene.moon.x}% ${scene.moon.y}%, ${scene.moon.color} 0 52%, ${scene.moon.glowColor} 64%, transparent 74%)`,
    `linear-gradient(178deg, ${scene.sky[0]} 0%, ${scene.sky[1]} 52%, ${scene.sky[2]} 100%)`,
  ]
  return layers.join(',')
}

export function tilePosition(size: number, index: number): string {
  const step = 100 / (size - 1)
  const row = Math.floor(index / size)
  const col = index % size
  return `${round2(col * step)}% ${round2(row * step)}%`
}

export function sceneSlice(scene: Scene): SceneSlice {
  return { image: sceneLayers(scene), position: '0% 0%', size: '100% 100%' }
}

export function tileSlice(scene: Scene, size: number, index: number): SceneSlice {
  return { image: sceneLayers(scene), position: tilePosition(size, index), size: `${size * 100}% ${size * 100}%` }
}

/** 联动瓦：一对相邻瓦片，点击其中一块时两块同时顺时针旋转。 */
export interface LinkedPair { readonly a: number; readonly b: number }

export function linkedPartner(links: readonly LinkedPair[], index: number): number {
  const pair = links.find(({ a, b }) => a === index || b === index)
  if (!pair) return -1
  return pair.a === index ? pair.b : pair.a
}

/** 把全部瓦片划成互不相交的求解单元：联动对为一个单元，其余瓦各自成单元。 */
export function solveUnits(count: number, links: readonly LinkedPair[]): number[][] {
  const units: number[][] = []
  const paired = new Set<number>()
  links.forEach(({ a, b }) => {
    units.push([a, b])
    paired.add(a)
    paired.add(b)
  })
  for (let index = 0; index < count; index += 1) if (!paired.has(index)) units.push([index])
  return units
}

export function rotateTile(turns: readonly number[], index: number, partner = -1): number[] {
  return turns.map((turn, position) => (position === index || position === partner ? turn + 1 : turn))
}

/**
 * 镜像差（180° 对偶）：每瓦可叠加 0 或 2 的镜像偏移，镜像瓦在转数 ≡ 2（mod 4）时归位，
 * 比普通瓦多出 2 转的归位转数，玩家须按瓦推断各自目标朝向。
 */
export function turnExcess(turn: number, delta = 0): number {
  return (((turn - delta) % 4) + 4) % 4
}

export function isSolved(turns: readonly number[], deltas: readonly number[] = []): boolean {
  return turns.every((turn, index) => turnExcess(turn, deltas[index] ?? 0) === 0)
}

/** 联动对内每次点击两块同转，单元内各瓦的“超出转数”（转数 − 镜像差）mod 4 守恒；所需点击数按单元头计算。 */
export function clicksToSolve(turns: readonly number[], links: readonly LinkedPair[] = [], deltas: readonly number[] = []): number {
  return solveUnits(turns.length, links).reduce((sum, unit) => {
    const head = unit[0]
    return sum + ((((deltas[head] ?? 0) - turns[head]) % 4) + 4) % 4
  }, 0)
}

/**
 * 按求解单元打乱：单元共享基准转数，但每瓦独立叠加 (0 或 2) 的镜像差扰动——
 * 联动对内两瓦转数可以相差 2（180° 对偶），单元内各瓦的超出转数（转数 − 镜像差）仍一致，
 * 保证联动打乱后可解且最少复原点击数恒等于打乱深度；玩家必须分别推断每瓦的目标朝向。
 */
export function scrambleTurns(count: number, units: readonly (readonly number[])[], depth: number, random: () => number) {
  const required = units.map(() => 0)
  let applied = 0
  let stall = 0
  while (applied < depth && stall < 240) {
    const unit = Math.floor(random() * units.length) % units.length
    if (required[unit] >= 3) {
      stall += 1
      continue
    }
    required[unit] += 1
    applied += 1
    stall = 0
  }
  const deltas = Array.from({ length: count }, () => 0)
  units.forEach((unit) => unit.forEach((tile) => { deltas[tile] = random() < 0.35 ? 2 : 0 }))
  const turns = Array.from({ length: count }, () => 0)
  units.forEach((unit, index) => unit.forEach((tile) => { turns[tile] = (((deltas[tile] - required[index]) % 4) + 4) % 4 }))
  return { turns, deltas, applied }
}

export function scoreFor(clicks: number, par: number, peeks = 0) {
  return Math.max(100, 1000 - Math.max(0, clicks - par) * 12 - peeks * 30)
}
