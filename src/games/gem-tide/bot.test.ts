import { describe, expect, it } from 'vitest'
import { playBot, playRandom } from './bot'
import { getGemLevel } from './levels'

const RANDOM_TRIALS = 64
const RANDOM_SEED_SALT = 100

describe('gem tide bot verification', () => {
  it('wins all sixty levels with the goal-oriented heuristic bot', () => {
    for (let level = 1; level <= 60; level += 1) {
      const outcome = playBot(level)
      expect(outcome.won, `level ${level} must stay reachable for the heuristic bot`).toBe(true)
      expect(outcome.movesUsed).toBeLessThanOrEqual(getGemLevel(level).moves)
    }
  })

  it('keeps every finale level under real pressure with at most ten percent spare moves', () => {
    for (let level = 45; level <= 60; level += 1) {
      const spec = getGemLevel(level)
      const outcome = playBot(level)
      expect(outcome.won, `finale level ${level} must stay winnable`).toBe(true)
      const margin = (spec.moves - outcome.movesUsed) / spec.moves
      expect(margin, `finale level ${level} spare-move margin`).toBeLessThanOrEqual(0.1)
    }
  })

  it('calibrates chapter one quotas so the random policy wins seventy to eighty-five percent', () => {
    let wins = 0
    for (let level = 1; level <= 11; level += 1) {
      let levelWins = 0
      for (let trial = 0; trial < RANDOM_TRIALS; trial += 1) {
        if (playRandom(level, RANDOM_SEED_SALT + trial).won) levelWins += 1
      }
      const rate = levelWins / RANDOM_TRIALS
      expect(rate, `chapter one level ${level} random win rate`).toBeGreaterThanOrEqual(0.5)
      expect(rate).toBeLessThanOrEqual(0.95)
      wins += levelWins
    }
    const aggregate = wins / (11 * RANDOM_TRIALS)
    expect(aggregate).toBeGreaterThanOrEqual(0.7)
    expect(aggregate).toBeLessThanOrEqual(0.85)
  })
})
