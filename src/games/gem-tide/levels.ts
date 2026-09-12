import { mulberry32, seedFor, shuffle } from '../../platform/rng'

export type TideMode = 'quota' | 'collect' | 'jelly' | 'locks' | 'combo'

export interface GemLevel {
  level: number
  chapter: number
  mode: TideMode
  moves: number
  quota?: number
  targets?: { color: number; count: number }[]
  jelly?: number
  locks?: number
  title: string
  detail: string
}

export const LEVEL_COUNT = 60

const chapterStart = [1, 12, 23, 34, 45]
const chapterCopy: Record<TideMode, [string, string]> = {
  quota: ['配额试炼', '在限定步数内掀起足够的消除波'],
  collect: ['拾光成串', '收集足量的指定颜色宝石'],
  jelly: ['凝霜果冻', '果冻格需要在其上消除两次'],
  locks: ['锁石秘藏', '带锁宝石参与一次消除即可解锁'],
  combo: ['终局·三潮合一', '配额、果冻与锁石同时生效'],
}

export function chapterOf(level: number) {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  if (safe <= 11) return 1
  if (safe <= 22) return 2
  if (safe <= 33) return 3
  if (safe <= 44) return 4
  return 5
}

export function getGemLevel(level: number): GemLevel {
  const safe = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const chapter = chapterOf(safe)
  const k = safe - chapterStart[chapter - 1]
  const mode: TideMode = chapter === 1 ? 'quota' : chapter === 2 ? 'collect' : chapter === 3 ? 'jelly' : chapter === 4 ? 'locks' : 'combo'
  const [title, detail] = chapterCopy[mode]
  const base: GemLevel = { level: safe, chapter, mode, moves: 20, title: safe === LEVEL_COUNT ? '终局·万波归海' : title, detail }
  if (chapter === 1) return { ...base, quota: 500 + k * 55 }
  if (chapter === 2) {
    const random = mulberry32(seedFor(safe, 3))
    const pool = shuffle(random, [0, 1, 2, 3, 4, 5])
    const needed = k < 5 ? 2 : 3
    const count = k < 5 ? 7 + k : 5 + k
    return { ...base, moves: 25 + Math.floor(k / 2), targets: pool.slice(0, needed).map((color) => ({ color, count })) }
  }
  if (chapter === 3) return { ...base, moves: 24 + k, jelly: 6 + k }
  if (chapter === 4) return { ...base, moves: 20 + k, locks: 4 + k }
  return { ...base, moves: 26 + Math.floor(k * 0.5), quota: 800 + k * 40, jelly: 6 + Math.floor(k * 0.6), locks: 3 + Math.floor(k * 0.5) }
}
