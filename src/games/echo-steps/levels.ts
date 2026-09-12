import { seedFor } from '../../platform/rng'

export type EchoMode = 'calm' | 'swift' | 'reverse' | 'silent' | 'gauntlet'

export interface EchoLevel {
  readonly level: number
  readonly chapter: number
  readonly mode: EchoMode
  readonly length: number
  readonly stepMs: number
  readonly reverse: boolean
  readonly silentRetries: boolean
  readonly distractors: number
  readonly maxLives: number
  readonly seed: number
  readonly title: string
  readonly detail: string
}

export const ECHO_LEVEL_COUNT = 60
const CHAPTER_BOUNDS: readonly number[] = [11, 22, 33, 44, 60]
const CHAPTER_COPY: readonly (readonly [string, string])[] = [
  ['星语初现', '六颗星依次闪烁，按同样的顺序点亮它们'],
  ['加速星流', '序列更长、节奏更快，专注每一次闪烁'],
  ['倒转星轨', '星星按正序演示，你需要从尾到头反向复现'],
  ['无声观测', '重播轮只亮不响，只靠眼睛守住轨迹'],
  ['万象星阵', '倒叙、静默与干扰星闪同时登场'],
] as const

export function echoChapter(level: number): number {
  const safe = Math.min(ECHO_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  return CHAPTER_BOUNDS.findIndex((bound) => safe <= bound) + 1
}

function sequenceLength(safe: number, chapter: number): number {
  if (chapter === 1) return 3 + Math.floor(((safe - 1) * 3) / 10)
  if (chapter === 2) return 6 + Math.floor(((safe - 12) * 3) / 10)
  if (chapter === 3) return 9 + Math.floor(((safe - 23) * 3) / 10)
  if (chapter === 4) return 12 + Math.floor(((safe - 34) * 2) / 10)
  return 14 + Math.floor(((safe - 45) * 2) / 15)
}

export function getEchoLevel(level: number): EchoLevel {
  const safe = Math.min(ECHO_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const chapter = echoChapter(safe)
  const mode: EchoMode = chapter === 1 ? 'calm' : chapter === 2 ? 'swift' : chapter === 3 ? 'reverse' : chapter === 4 ? 'silent' : 'gauntlet'
  const [title, base] = CHAPTER_COPY[chapter - 1]
  const extras: string[] = []
  if (chapter >= 3) extras.push('倒叙')
  if (chapter >= 4) extras.push('静默重播')
  if (chapter >= 5) extras.push('干扰星闪')
  const distractors = chapter >= 5 ? Math.min(4, 1 + Math.floor((safe - 45) / 5)) : 0
  const baseStepMs = Math.max(290, 810 - safe * 9)
  const stepMs = chapter >= 5 ? Math.max(210, Math.round(baseStepMs * 0.7)) : baseStepMs
  return {
    level: safe,
    chapter,
    mode,
    length: sequenceLength(safe, chapter),
    stepMs,
    reverse: chapter >= 3,
    silentRetries: chapter >= 4,
    distractors,
    maxLives: 3,
    seed: seedFor(safe, 11),
    title: safe === ECHO_LEVEL_COUNT ? '终局·星阵归一' : title,
    detail: extras.length ? `${base} · ${extras.join('＋')}` : base,
  }
}
