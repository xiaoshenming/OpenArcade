import { describe, expect, it } from 'vitest'
import { applyOp, cancels, colOp, diffCount, gridsEqual, opChanges, opInverse, paintOp, rotOp, rowOp } from './logic'

describe('dream loom tools', () => {
  it('paints by toggling a single cell and ignores out-of-range targets', () => {
    const base = [[0, 0], [0, 0]]
    expect(applyOp(base, paintOp(0, 1))).toEqual([[0, 1], [0, 0]])
    expect(applyOp(applyOp(base, paintOp(0, 1)), paintOp(0, 1))).toEqual(base)
    expect(applyOp(base, paintOp(-1, 0))).toEqual(base)
    expect(applyOp(base, paintOp(2, 0))).toEqual(base)
    expect(base).toEqual([[0, 0], [0, 0]])
  })

  it('shifts rows and columns cyclically and no-ops on uniform lines', () => {
    const base = [[1, 0, 0, 0], [0, 0, 0, 1], [0, 1, 0, 0], [0, 0, 0, 0]]
    expect(applyOp(base, rowOp(0, 1))[0]).toEqual([0, 1, 0, 0])
    expect(applyOp(base, rowOp(0, 1))[0].at(-1)).toBe(0)
    expect(applyOp(applyOp(base, rowOp(0, 1)), rowOp(0, -1))).toEqual(base)
    expect(applyOp(base, colOp(3, 1)).map((row) => row[3])).toEqual([0, 0, 1, 0])
    expect(applyOp(applyOp(base, colOp(3, 1)), colOp(3, -1))).toEqual(base)
    const uniform = [[1, 1], [1, 1]]
    expect(applyOp(uniform, rowOp(0, 1))).toEqual(uniform)
    expect(opChanges(uniform, rowOp(0, 1))).toBe(false)
    expect(opChanges(base, rowOp(0, 1))).toBe(true)
  })

  it('rotates 2x2 blocks in both directions and rejects bad anchors', () => {
    const base = [[1, 0], [0, 0]]
    expect(applyOp(base, rotOp(0, 0, 1))).toEqual([[0, 1], [0, 0]])
    expect(applyOp(base, rotOp(0, 0, -1))).toEqual([[0, 0], [1, 0]])
    expect(applyOp(applyOp(base, rotOp(0, 0, 1)), rotOp(0, 0, -1))).toEqual(base)
    expect(applyOp(applyOp(base, rotOp(0, 0, 1)), rotOp(0, 0, 1))).toEqual([[0, 0], [0, 1]])
    expect(applyOp(base, rotOp(1, 1, 1))).toEqual(base)
  })

  it('flags exactly the cancelling tool pairs', () => {
    expect(opInverse(rowOp(2, 1))).toEqual(rowOp(2, -1))
    expect(opInverse(paintOp(1, 1))).toEqual(paintOp(1, 1))
    expect(cancels(rowOp(2, 1), rowOp(2, -1))).toBe(true)
    expect(cancels(rowOp(2, 1), rowOp(3, -1))).toBe(false)
    expect(cancels(rowOp(2, 1), rowOp(2, 1))).toBe(false)
    expect(cancels(paintOp(1, 1), paintOp(1, 1))).toBe(true)
    expect(cancels(colOp(0, 1), colOp(0, -1))).toBe(true)
    expect(cancels(rotOp(0, 0, 1), rotOp(0, 0, -1))).toBe(true)
    expect(cancels(rotOp(0, 0, 1), rotOp(0, 0, 1))).toBe(true)
    expect(cancels(rotOp(0, 0, 1), rotOp(1, 1, 1))).toBe(false)
    expect(cancels(rowOp(0, 1), colOp(0, -1))).toBe(false)
  })

  it('compares grids and counts differences safely', () => {
    expect(gridsEqual([[1, 0], [0, 1]], [[1, 0], [0, 1]])).toBe(true)
    expect(gridsEqual([[1, 0]], [[1, 0], [0, 0]])).toBe(false)
    expect(diffCount([[1, 0], [0, 0]], [[0, 0], [0, 1]])).toBe(2)
    expect(diffCount([[1]], [[1]])).toBe(0)
    expect(diffCount([[1, 1]], [[0]])).toBe(2)
  })
})
