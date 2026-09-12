import { mulberry32, seedFor } from '../../platform/rng'
import { createGemBoard, findValidSwaps, hasValidSwap, resolveSwap, shuffleBoard, goalSummary, colOf, SIZE, type BoardState, type ResolveResult } from './logic'
import { getGemLevel, type GemLevel } from './levels'

export interface BotOutcome {
  won: boolean
  movesUsed: number
  score: number
  collected: number[]
  locksLeft: number
  jellyLeft: number
}

const WEIGHT_SCORE = 1
const WEIGHT_TARGET = 26
const WEIGHT_JELLY = 26
const WEIGHT_LOCK = 64
const WEIGHT_ADJACENT = 7
const WEIGHT_FUTURE = 0.42
const DEAD_PENALTY = 40
const RESHUFFLE_GUARD = 40

const NEIGHBOR_OFFSETS = [-SIZE, SIZE, -1, 1]

function proximityGain(state: BoardState, result: ResolveResult): number {
  let bonus = 0
  for (const cell of result.clearedCells) {
    const col = colOf(cell)
    for (const offset of NEIGHBOR_OFFSETS) {
      const next = cell + offset
      if (next < 0 || next >= CELLS_TOTAL) continue
      if (offset === -1 && col === 0) continue
      if (offset === 1 && col === SIZE - 1) continue
      if (state.jelly[next] > 0 || state.locks[next]) bonus += 1
    }
  }
  return bonus
}

const CELLS_TOTAL = SIZE * SIZE

function goalGain(spec: GemLevel, state: BoardState, score: number, collected: readonly number[], result: ResolveResult): number {
  let gain = WEIGHT_JELLY * result.jellyHits + WEIGHT_LOCK * result.unlocked + WEIGHT_ADJACENT * proximityGain(state, result)
  if (spec.quota !== undefined) gain += WEIGHT_SCORE * Math.min(result.gained, Math.max(0, spec.quota - score))
  if (spec.targets) {
    for (const target of spec.targets) {
      const have = collected[target.color] ?? 0
      const more = result.perColor[target.color] ?? 0
      gain += WEIGHT_TARGET * (Math.min(target.count, have + more) - Math.min(target.count, have))
    }
  }
  return gain
}

function futureGain(spec: GemLevel, state: BoardState, score: number, collected: readonly number[], random: () => number): number {
  const swaps = findValidSwaps(state.colors, state.locks)
  if (swaps.length === 0) return -DEAD_PENALTY
  let best = -Infinity
  for (const [a, b] of swaps) {
    const result = resolveSwap(state, a, b, random)
    const gain = goalGain(spec, state, score, collected, result)
    if (gain > best) best = gain
  }
  return best
}

interface Candidate {
  result: ResolveResult
  utility: number
}

function chooseMove(spec: GemLevel, state: BoardState, score: number, collected: readonly number[], swaps: Array<[number, number]>, random: () => number): ResolveResult {
  let best: Candidate | null = null
  const ranked: Array<{ result: ResolveResult; gain: number }> = []
  for (const [a, b] of swaps) {
    const result = resolveSwap(state, a, b, random)
    const nextScore = score + result.gained
    const nextCollected = collected.map((count, color) => count + (result.perColor[color] ?? 0))
    if (goalSummary(spec, result.state, nextScore, nextCollected).done) return result
    ranked.push({ result, gain: goalGain(spec, state, score, collected, result) })
  }
  const top = [...ranked].sort((left, right) => right.gain - left.gain).slice(0, 5)
  for (const candidate of top) {
    const nextScore = score + candidate.result.gained
    const nextCollected = collected.map((count, color) => count + (candidate.result.perColor[color] ?? 0))
    const future = futureGain(spec, candidate.result.state, nextScore, nextCollected, random)
    const utility = candidate.gain + WEIGHT_FUTURE * future
    if (!best || utility > best.utility) best = { result: candidate.result, utility }
  }
  return (best ?? ranked[0]).result
}

function settleBoard(state: BoardState, random: () => number): BoardState {
  let next = state
  for (let guard = 0; !hasValidSwap(next.colors, next.locks) && guard < RESHUFFLE_GUARD; guard += 1) next = shuffleBoard(next, random)
  return next
}

export function playBot(level: number, salt = 11, spec: GemLevel = getGemLevel(level)): BotOutcome {
  const random = mulberry32(seedFor(level, salt))
  let state = createGemBoard(level, spec)
  let collected = new Array(6).fill(0)
  let score = 0
  let movesUsed = 0
  while (movesUsed < spec.moves) {
    let swaps = findValidSwaps(state.colors, state.locks)
    if (swaps.length === 0) {
      state = settleBoard(state, random)
      swaps = findValidSwaps(state.colors, state.locks)
      if (swaps.length === 0) break
    }
    const result = chooseMove(spec, state, score, collected, swaps, random)
    score += result.gained
    collected = collected.map((count, color) => count + (result.perColor[color] ?? 0))
    state = settleBoard(result.state, random)
    movesUsed += 1
    if (goalSummary(spec, state, score, collected).done) return { won: true, movesUsed, score, collected, locksLeft: state.locks.filter(Boolean).length, jellyLeft: state.jelly.reduce((sum, value) => sum + value, 0) }
  }
  return { won: false, movesUsed, score, collected, locksLeft: state.locks.filter(Boolean).length, jellyLeft: state.jelly.reduce((sum, value) => sum + value, 0) }
}

export function playRandom(level: number, salt: number, spec: GemLevel = getGemLevel(level), playOut = false): BotOutcome {
  const random = mulberry32(seedFor(level, salt))
  let state = createGemBoard(level, spec)
  let collected = new Array(6).fill(0)
  let score = 0
  let movesUsed = 0
  while (movesUsed < spec.moves) {
    const swaps = findValidSwaps(state.colors, state.locks)
    if (swaps.length === 0) {
      state = settleBoard(state, random)
      if (findValidSwaps(state.colors, state.locks).length === 0) break
      continue
    }
    const [a, b] = swaps[Math.floor(random() * swaps.length) % swaps.length]
    const result = resolveSwap(state, a, b, random)
    score += result.gained
    collected = collected.map((count, color) => count + (result.perColor[color] ?? 0))
    state = settleBoard(result.state, random)
    movesUsed += 1
    if (!playOut && goalSummary(spec, state, score, collected).done) return { won: true, movesUsed, score, collected, locksLeft: state.locks.filter(Boolean).length, jellyLeft: state.jelly.reduce((sum, value) => sum + value, 0) }
  }
  return { won: goalSummary(spec, state, score, collected).done, movesUsed, score, collected, locksLeft: state.locks.filter(Boolean).length, jellyLeft: state.jelly.reduce((sum, value) => sum + value, 0) }
}
