import { mulberry32, seedFor } from '../../platform/rng'

export interface TeaLevel {
  level: number
  chapter: number
  customers: number
  quota: number
  minLen: number
  maxLen: number
  fadeMs: number
  reverseChance: number
  distractors: number
  bias: number
  title: string
  detail: string
}

export const INGREDIENTS = [
  { icon: '🍵', name: '茶汤' },
  { icon: '🌸', name: '花雨' },
  { icon: '🍬', name: '糖霜' },
  { icon: '🥛', name: '奶云' },
  { icon: '🧊', name: '冰晶' },
  { icon: '🍋', name: '柠光' },
] as const

export const CUSTOMERS = ['🦊', '🐼', '🐰'] as const
export const CUSTOMER_NAMES = ['甲', '乙', '丙'] as const

interface ChapterSpec {
  customers: number
  quota: number
  minLen: number
  maxLen: number
  fadeMs: number
  reverseChance: number
  distractors: number
  title: string
  detail: string
}

const CHAPTERS: ChapterSpec[] = [
  { customers: 1, quota: 3, minLen: 2, maxLen: 3, fadeMs: 0, reverseChance: 0, distractors: 0, title: '入门茶单', detail: '单客 2-3 料,看清订单依次冲泡' },
  { customers: 1, quota: 3, minLen: 3, maxLen: 4, fadeMs: 3000, reverseChance: 0, distractors: 0, title: '渐隐订单', detail: '订单展示数秒后隐去,凭记忆续冲' },
  { customers: 2, quota: 4, minLen: 3, maxLen: 4, fadeMs: 0, reverseChance: 0, distractors: 0, title: '双客交替', detail: '两单穿插进行,按亮起的头像切换' },
  { customers: 2, quota: 4, minLen: 3, maxLen: 5, fadeMs: 0, reverseChance: 0.55, distractors: 0, title: '逆序冲泡', detail: '带 ⇄ 徽记的客人要求倒序出品' },
  { customers: 3, quota: 6, minLen: 4, maxLen: 5, fadeMs: 2600, reverseChance: 0.6, distractors: 2, title: '三客风暴', detail: '渐隐、逆序与干扰原料同时登场' },
]

const CHAPTER_STARTS = [1, 12, 23, 34, 45]

export function chapterOf(level: number) {
  if (level <= 11) return 1
  if (level <= 22) return 2
  if (level <= 33) return 3
  if (level <= 44) return 4
  return 5
}

export function getTeaLevel(level: number): TeaLevel {
  const safe = Math.min(60, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1) || 1))
  const chapter = chapterOf(safe)
  const spec = CHAPTERS[chapter - 1]
  const inChapter = safe - CHAPTER_STARTS[chapter - 1]
  const bias = 0.2 + 0.6 * ((safe - 1) / 59)
  const fadeMs = spec.fadeMs === 0 ? 0 : Math.max(2000, spec.fadeMs - inChapter * 70)
  const distractors = chapter === 5 && safe >= 54 ? 3 : spec.distractors
  const quota = spec.quota + Math.floor(inChapter / 4)
  const customers = spec.customers >= 2 ? Math.min(CUSTOMERS.length, spec.customers + Math.floor(inChapter / 4)) : spec.customers
  return {
    level: safe, chapter, customers, quota, minLen: spec.minLen, maxLen: spec.maxLen,
    fadeMs, reverseChance: spec.reverseChance, distractors, bias,
    title: safe === 60 ? '终局·满堂茶香' : spec.title, detail: spec.detail,
  }
}

export interface TeaOrder {
  customer: number
  recipe: number[]
  reverse: boolean
}

export function makeTeaOrder(level: TeaLevel, index: number): TeaOrder {
  const rng = mulberry32(seedFor(level.level, index * 131 + 7))
  const span = level.maxLen - level.minLen + 1
  const length = rng() < level.bias ? level.maxLen : level.minLen + Math.floor(rng() * span)
  const recipe = Array.from({ length }, () => Math.floor(rng() * INGREDIENTS.length))
  const reverse = level.reverseChance > 0 && rng() < level.reverseChance
  return { customer: index % level.customers, recipe, reverse }
}
