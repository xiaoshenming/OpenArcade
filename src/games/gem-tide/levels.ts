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
// 果冻章逐关减免:仅对 bot 模拟中不可达的关卡下调配额(见 bot.test.ts 可达性测试)
const JELLY_RELIEF = [0, 0, 0, 0, 0, 0, 0, 2, 2, 0, 1]
// 终局章逐关参数:经启发式 bot 模拟标定,60 关全部可达且 bot 步数余量 ≤10%
const COMBO_TUNING: ReadonlyArray<{ moves: number, quota: number, jelly: number, locks: number }> = [
  { moves: 26, quota: 4600, jelly: 5, locks: 2 },
  { moves: 26, quota: 8200, jelly: 4, locks: 2 },
  { moves: 27, quota: 1350, jelly: 6, locks: 3 },
  { moves: 27, quota: 5275, jelly: 6, locks: 3 },
  { moves: 28, quota: 8200, jelly: 7, locks: 2 },
  { moves: 28, quota: 8200, jelly: 8, locks: 4 },
  { moves: 29, quota: 5575, jelly: 8, locks: 4 },
  { moves: 29, quota: 5475, jelly: 9, locks: 3 },
  { moves: 30, quota: 8175, jelly: 9, locks: 6 },
  { moves: 30, quota: 4550, jelly: 10, locks: 6 },
  { moves: 31, quota: 6450, jelly: 11, locks: 7 },
  { moves: 31, quota: 3000, jelly: 12, locks: 7 },
  { moves: 32, quota: 3300, jelly: 12, locks: 6 },
  { moves: 32, quota: 5575, jelly: 12, locks: 8 },
  { moves: 33, quota: 3325, jelly: 13, locks: 7 },
  { moves: 33, quota: 5175, jelly: 12, locks: 8 },
]
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
  if (chapter === 1) return { ...base, quota: 2050 + k * 30 }
  if (chapter === 2) {
    const random = mulberry32(seedFor(safe, 3))
    const pool = shuffle(random, [0, 1, 2, 3, 4, 5])
    const needed = k < 5 ? 2 : 3
    const count = k < 5 ? 7 + k : 5 + k
    return { ...base, moves: 25 + Math.floor(k / 2), targets: pool.slice(0, needed).map((color) => ({ color, count })) }
  }
  if (chapter === 3) return { ...base, moves: 24 + k, jelly: 6 + k - JELLY_RELIEF[k] }
  if (chapter === 4) return { ...base, moves: 21 + k, locks: 2 + k }
  return { ...base, ...COMBO_TUNING[k] }
}
