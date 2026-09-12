import { describe, expect, it } from 'vitest'
import { applyFold, creaseEdge, foldPaper, FOLD_LABELS, freshPaper, isTimedOut, trackFolds, twinPosition, unfoldHoles, unfoldMirrorPunch } from './logic'

describe('fold-craft fold engine', () => {
  it('maps a single left fold onto mirrored column pairs', () => {
    expect(foldPaper(4, 4, ['left'])).toEqual({
      rows: 4,
      cols: 2,
      stacks: [[1, 2], [0, 3], [5, 6], [4, 7], [9, 10], [8, 11], [13, 14], [12, 15]],
    })
    expect(applyFold(freshPaper(2, 2), 'up')).toEqual({ rows: 1, cols: 2, stacks: [[0, 2], [1, 3]] })
  })

  it('doubles every stack per fold and keeps a full disjoint cover', () => {
    for (const folds of [['up', 'left'], ['left', 'up', 'right'], ['down', 'down', 'up'], ['left', 'left', 'up', 'down']] as const) {
      const folded = foldPaper(8, 8, folds)
      expect(folded, `folds ${folds.join(',')}`).not.toBeNull()
      if (!folded) continue
      expect(folded.stacks.every((stack) => stack.length === 2 ** folds.length)).toBe(true)
      const flat = folded.stacks.flat()
      expect(flat).toHaveLength(64)
      expect(new Set(flat).size).toBe(64)
    }
  })

  it('refuses folds along odd spans', () => {
    expect(foldPaper(3, 3, ['left'])).toBeNull()
    expect(foldPaper(1, 1, ['down'])).toBeNull()
    expect(foldPaper(2, 1, ['left'])).toBeNull()
    expect(applyFold({ rows: 2, cols: 1, stacks: [[0], [1]] }, 'left')).toBeNull()
  })

  it('unfolds punched holes into the exact layered original cells', () => {
    const folded = foldPaper(4, 4, ['up'])
    expect(folded).not.toBeNull()
    if (!folded) return
    expect(unfoldHoles(folded, [0])).toEqual([4, 8])
    expect(unfoldHoles(folded, [0, 5])).toEqual([1, 4, 8, 13])
    expect(unfoldHoles(folded, [99])).toEqual([])
    const track = trackFolds(4, 4, ['left', 'up'])
    expect(track.frames).toEqual([{ rows: 4, cols: 4 }, { rows: 4, cols: 2 }])
    expect(track.state).toMatchObject({ rows: 2, cols: 2 })
    expect(creaseEdge(track.state, 'left')).toEqual([0, 2])
    expect(creaseEdge({ rows: 3, cols: 2, stacks: [] }, 'right')).toEqual([1, 3, 5])
    expect(FOLD_LABELS.down).toBe('下半向上折')
  })

  it('mirrors every punch into a distinct center-symmetric twin hole', () => {
    expect(twinPosition(0, 2, 2)).toBe(3)
    expect(twinPosition(3, 2, 2)).toBe(0)
    expect(twinPosition(5, 4, 2)).toBe(2)
    const folded = foldPaper(8, 8, ['left', 'up', 'left'])
    expect(folded).not.toBeNull()
    if (!folded) return
    for (let position = 0; position < folded.rows * folded.cols; position += 1) {
      expect(twinPosition(position, folded.rows, folded.cols)).not.toBe(position)
      expect(twinPosition(twinPosition(position, folded.rows, folded.cols), folded.rows, folded.cols)).toBe(position)
    }
    const hole = 1
    const answer = unfoldMirrorPunch(folded, [hole])
    expect(answer).toEqual(unfoldHoles(folded, [hole, twinPosition(hole, folded.rows, folded.cols)]))
    expect(answer).toHaveLength(16)
    expect(unfoldHoles(folded, [hole])).toHaveLength(8)
    expect(unfoldMirrorPunch(folded, [])).toEqual([])
  })

  it('fails timed rounds exactly when the clock reaches the limit', () => {
    expect(isTimedOut(true, 0, 10)).toBe(false)
    expect(isTimedOut(true, 9, 10)).toBe(false)
    expect(isTimedOut(true, 10, 10)).toBe(true)
    expect(isTimedOut(true, 11, 10)).toBe(true)
    expect(isTimedOut(false, 999, 10)).toBe(false)
  })
})
