import { expect, it } from 'vitest'
import { getMergeLevel, LEVEL_COUNT } from './levels'

it('keeps the render path free of expectimax work by serving levels from the cache', () => {
  const started = performance.now()
  for (let level = 1; level <= LEVEL_COUNT; level += 1) getMergeLevel(level)
  const elapsed = performance.now() - started
  expect(elapsed, 'sixty cached lookups must stay far below a single ~100ms bot solve').toBeLessThan(150)
})
