export const STEP = 5
export const MIN_CHANNEL = 0
export const MAX_CHANNEL = 255
export const CHANNELS = ['r', 'g', 'b'] as const
export const BOTTLES = ['+r', '+g', '+b', '-r', '-g', '-b'] as const

export type Channel = (typeof CHANNELS)[number]
export type Rgb = Record<Channel, number>
export interface Drop {
  readonly key: string
  readonly drops: number
}
export interface HueLevel {
  readonly start: Rgb
  readonly target: Rgb
  readonly par: number
  readonly budget: number
  readonly droplets: readonly number[]
  readonly duds: readonly string[]
  readonly solution: readonly Drop[]
}

export const isBottle = (key: string): key is (typeof BOTTLES)[number] => (BOTTLES as readonly string[]).includes(key)
export const bottleChannel = (key: string): Channel => key.slice(1) as Channel
export const bottleSign = (key: string): 1 | -1 => (key.startsWith('+') ? 1 : -1)
export const neededKey = (channel: Channel, sign: 1 | -1): string => `${sign > 0 ? '+' : '-'}${channel}`

export function applyDrop(mix: Rgb, key: string, drops: number): Rgb | null {
  if (!isBottle(key) || !Number.isInteger(drops) || drops < 1) return null
  const value = mix[bottleChannel(key)] + bottleSign(key) * STEP * drops
  if (!Number.isInteger(value) || value < MIN_CHANNEL || value > MAX_CHANNEL) return null
  return { ...mix, [bottleChannel(key)]: value }
}

export const sameColor = (a: Rgb, b: Rgb) => a.r === b.r && a.g === b.g && a.b === b.b
export const cssColor = (color: Rgb) => `rgb(${color.r}, ${color.g}, ${color.b})`
export const inBounds = (color: Rgb) => CHANNELS.every((channel) => color[channel] >= MIN_CHANNEL && color[channel] <= MAX_CHANNEL)

export function channelDeltas(start: Rgb, target: Rgb): Record<Channel, number> {
  return { r: (target.r - start.r) / STEP, g: (target.g - start.g) / STEP, b: (target.b - start.b) / STEP }
}

export const greedyClicks = (delta: number, fives: boolean) => {
  const unit = Math.abs(delta)
  if (unit === 0) return 0
  return fives ? Math.floor(unit / 5) + (unit % 5) : unit
}

export function buildSolution(deltas: Record<Channel, number>, fives: boolean): Drop[] {
  const solution: Drop[] = []
  for (const channel of CHANNELS) {
    const delta = deltas[channel]
    if (delta === 0) continue
    const key = neededKey(channel, delta > 0 ? 1 : -1)
    if (fives) {
      const fivesCount = Math.floor(Math.abs(delta) / 5)
      for (let index = 0; index < fivesCount; index += 1) solution.push({ key, drops: 5 })
    }
    const ones = fives ? Math.abs(delta) % 5 : Math.abs(delta)
    for (let index = 0; index < ones; index += 1) solution.push({ key, drops: 1 })
  }
  return solution
}

export function replaySolution(start: Rgb, solution: readonly Drop[]): { mix: Rgb | null; steps: number } {
  let mix: Rgb | null = { ...start }
  let steps = 0
  for (const drop of solution) {
    const next = applyDrop(mix as Rgb, drop.key, drop.drops)
    if (!next) return { mix: null, steps }
    mix = next
    steps += 1
  }
  return { mix, steps }
}

export const scoreFor = (steps: number, par: number) => Math.max(100, 1000 - Math.max(0, steps - par) * 15)

export function minClicksBrute(delta: number, fives: boolean): number {
  const unit = Math.abs(delta)
  const table = [0]
  for (let need = 1; need <= unit; need += 1) {
    const best = [table[need - 1] + 1, need >= 5 && fives ? table[need - 5] + 1 : Number.POSITIVE_INFINITY]
    table[need] = Math.min(...best)
  }
  return table[unit]
}

export const neededBottles = (deltas: Record<Channel, number>): string[] => {
  const keys: string[] = []
  for (const channel of CHANNELS) {
    if (deltas[channel] > 0) keys.push(neededKey(channel, 1))
    if (deltas[channel] < 0) keys.push(neededKey(channel, -1))
  }
  return keys
}
