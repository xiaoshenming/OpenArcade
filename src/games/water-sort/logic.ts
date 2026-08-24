export type Tube = number[]
export type Board = Tube[]
export const CAPACITY = 4

export interface MoveResult {
  board: Board
  moved: number
}

export function pour(board: Board, from: number, to: number): MoveResult {
  if (from === to || !board[from]?.length || !board[to] || board[to].length >= CAPACITY) {
    return { board, moved: 0 }
  }
  const source = board[from]
  const target = board[to]
  const color = source[source.length - 1]
  const targetColor = target[target.length - 1]
  if (targetColor !== undefined && targetColor !== color) return { board, moved: 0 }

  let sameColorCount = 0
  for (let index = source.length - 1; index >= 0 && source[index] === color; index -= 1) sameColorCount += 1
  const moved = Math.min(sameColorCount, CAPACITY - target.length)
  if (!moved) return { board, moved: 0 }

  const next = board.map((tube) => [...tube])
  next[to].push(...next[from].splice(next[from].length - moved, moved))
  return { board: next, moved }
}

export function isSolved(board: Board) {
  return board.every((tube) => tube.length === 0 || (tube.length === CAPACITY && tube.every((color) => color === tube[0])))
}
