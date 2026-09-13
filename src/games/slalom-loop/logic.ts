export const WHITE = 1
export const BLACK = 2
export const SCORE_CAP = 5000
export const SCORE_FLOOR = 100
export const SCORE_BASE = 1000
export const PENALTY_PER_MISTAKE = 60
export const PENALTY_OVERTIME_STEP = 10
export const FAIL_PENALTY = 250

export function neighborsOf(cell: number, cols: number, rows: number): number[] {
  const row = Math.floor(cell / cols)
  const col = cell % cols
  return [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]
    .filter(([r, c]) => r >= 0 && r < rows && c >= 0 && c < cols).map(([r, c]) => r * cols + c)
}

export function edgeTotal(cols: number, rows: number): number { return (cols - 1) * rows + cols * (rows - 1) }

export function hEdgeAt(row: number, col: number, cols: number): number { return row * (cols - 1) + col }

export function vEdgeAt(row: number, col: number, cols: number, rows: number): number { return (cols - 1) * rows + row * cols + col }

export function edgesOfCell(cell: number, cols: number, rows: number): number[] {
  const row = Math.floor(cell / cols)
  const col = cell % cols
  return [
    ...(col + 1 < cols ? [hEdgeAt(row, col, cols)] : []), ...(col > 0 ? [hEdgeAt(row, col - 1, cols)] : []),
    ...(row + 1 < rows ? [vEdgeAt(row, col, cols, rows)] : []), ...(row > 0 ? [vEdgeAt(row - 1, col, cols, rows)] : []),
  ]
}

export function endsOfEdge(edge: number, cols: number, rows: number): [number, number] {
  const hCount = (cols - 1) * rows
  if (edge >= hCount) {
    const rest = edge - hCount
    const row = Math.floor(rest / cols)
    const col = rest % cols
    return [row * cols + col, (row + 1) * cols + col]
  }
  const row = Math.floor(edge / (cols - 1))
  const col = edge % (cols - 1)
  return [row * cols + col, row * cols + col + 1]
}

export function loopEdges(order: readonly number[], cols: number, rows: number): number[] {
  const edges = new Set<number>()
  for (let index = 0; index < order.length; index += 1) {
    const edge = edgesOfCell(order[index], cols, rows).find((candidate) => endsOfEdge(candidate, cols, rows).includes(order[(index + 1) % order.length]))
    if (edge === undefined) return []
    edges.add(edge)
  }
  return [...edges]
}

export function turnAt(order: readonly number[], index: number): boolean {
  const prev = order[(index + order.length - 1) % order.length]
  const next = order[(index + 1) % order.length]
  return order[index] - prev !== next - order[index]
}

export function loopOrder(edges: readonly number[], cols: number, rows: number): number[] | null {
  if (!edges.length) return null
  const on = new Set(edges)
  let prev = -1
  let cell = endsOfEdge(edges[0], cols, rows)[0]
  const order = [cell]
  for (let step = 0; step < edges.length; step += 1) {
    const edge = edgesOfCell(cell, cols, rows).find((candidate) => on.has(candidate) && !endsOfEdge(candidate, cols, rows).includes(prev))
    if (edge === undefined) return null
    const [a, b] = endsOfEdge(edge, cols, rows)
    const forward = a === cell ? b : a
    if (forward === order[0] && step === edges.length - 1) return order
    if (forward === order[0] || order.includes(forward)) return null
    prev = cell
    cell = forward
    order.push(cell)
  }
  return null
}

export function validateLoop(order: readonly number[], clues: readonly number[], cols: number, rows: number): boolean {
  if (order.length < 4 || new Set(order).size !== order.length) return false
  for (let index = 0; index < order.length; index += 1) {
    const around = neighborsOf(order[index], cols, rows)
    if (!around.includes(order[(index + order.length - 1) % order.length]) || !around.includes(order[(index + 1) % order.length])) return false
  }
  for (let cell = 0; cell < clues.length; cell += 1) {
    if (!clues[cell]) continue
    const index = order.indexOf(cell)
    if (index < 0) return false
    const prev = order[(index + order.length - 1) % order.length]
    const next = order[(index + 1) % order.length]
    const straight = Math.abs(prev - next) === 2 || Math.abs(prev - next) === 2 * cols
    const turned = turnAt(order, (index + order.length - 1) % order.length) || turnAt(order, (index + 1) % order.length)
    if (clues[cell] === WHITE && (!straight || !turned)) return false
    if (clues[cell] === BLACK && (straight || turned)) return false
  }
  return true
}

// 环路解计数器：强制传播 + 分支搜索，返回解数；预算耗尽返回 -1（无法判定）。
export function countSolutions(cols: number, rows: number, clues: readonly number[], limit = 2, budget = 400000): number {
  const cellTotal = cols * rows
  const total = edgeTotal(cols, rows)
  const hCount = (cols - 1) * rows
  // 静态邻接表只算一次，搜索热路径不再分配数组；推理语义与朴素实现一致
  const cellEdges = Array.from({ length: cellTotal }, (_, cell) => edgesOfCell(cell, cols, rows))
  const edgeEnds = Array.from({ length: total }, (_, edge) => endsOfEdge(edge, cols, rows))
  const values = new Int8Array(total).fill(-1)
  const degrees = new Int8Array(cellTotal)
  const trail: number[] = []
  let count = 0
  let visited = 0; let aborted = false
  const decide = (edge: number, value: number): boolean => {
    if (values[edge] !== -1) return values[edge] === value
    values[edge] = value
    trail.push(edge)
    if (value === 0) return true
    degrees[edgeEnds[edge][0]] += 1
    degrees[edgeEnds[edge][1]] += 1
    return degrees[edgeEnds[edge][0]] <= 2 && degrees[edgeEnds[edge][1]] <= 2
  }
  const undoTo = (mark: number) => {
    while (trail.length > mark) {
      const edge = trail.pop() as number
      if (values[edge] === 1) {
        const [a, b] = edgeEnds[edge]
        degrees[a] -= 1
        degrees[b] -= 1
      }
      values[edge] = -1
    }
  }
  const verticalEdges = (cell: number) => {
    const row = Math.floor(cell / cols)
    const col = cell % cols
    return [row > 0 ? vEdgeAt(row - 1, col, cols, rows) : -1, row + 1 < rows ? vEdgeAt(row, col, cols, rows) : -1]
  }
  const canTurn = (side: number): boolean => verticalEdges(side).some((edge) => edge >= 0 && values[edge] !== 0)
  const forceTurn = (side: number): boolean => {
    const [up, down] = verticalEdges(side)
    if (values[up] === 1 || values[down] === 1) return true
    if (up < 0 || values[up] === 0) return down >= 0 && decide(down, 1)
    if (down < 0 || values[down] === 0) return decide(up, 1)
    return true
  }
  const straightFar = (cell: number, edge: number): number => {
    const [a, b] = edgeEnds[edge]
    const other = a === cell ? b : a
    const vertical = other % cols === cell % cols
    const row = Math.floor(other / cols)
    const col = other % cols
    const near = vertical ? (row > 0 ? vEdgeAt(row - 1, col, cols, rows) : -1) : col > 0 ? hEdgeAt(row, col - 1, cols) : -1
    const far = vertical ? (row + 1 < rows ? vEdgeAt(row, col, cols, rows) : -1) : col + 1 < cols ? hEdgeAt(row, col, cols) : -1
    return near === edge ? far : near
  }

  // 对 cell 的全部未定边执行 action，返回实际决策数；action 失败返回 -1
  const actOnOpen = (cell: number, action: (edge: number) => boolean): number => {
    let acted = 0
    for (const edge of cellEdges[cell]) {
      if (values[edge] === -1) { if (!action(edge)) return -1; acted += 1 }
    }
    return acted
  }
  const propagate = (): boolean => {
    let dirty = true
    while (dirty) {
      dirty = false
      // 线端延伸封闭：任一端点度数已满 2 的未定边绝不入环
      for (let edge = 0; edge < total; edge += 1) {
        if (values[edge] !== -1) continue
        const [a, b] = edgeEnds[edge]
        if ((degrees[a] === 2 || degrees[b] === 2) && !decide(edge, 0)) return false
        if (values[edge] === 0) dirty = true
      }
      for (let cell = 0; cell < cellTotal; cell += 1) {
        let onCount = 0; let openCount = 0
        let onFirst = -1; let onSecond = -1
        let horizontal = 0; let vertical = 0
        for (const edge of cellEdges[cell]) {
          const value = values[edge]
          if (value === 1) {
            if (onFirst < 0) { onFirst = edge } else { onSecond = edge }
            onCount += 1
            if (edge < hCount) { horizontal += 1 } else { vertical += 1 }
          } else if (value === -1) { openCount += 1 }
        }
        if (onCount > 2) return false
        const clue = clues[cell]
        if (clue === WHITE && ((horizontal === 1 && vertical === 1) || (degrees[cell] === 2 && horizontal !== 2 && vertical !== 2))) return false
        if (clue === BLACK && ((horizontal === 2 || vertical === 2) || (degrees[cell] === 2 && !(horizontal === 1 && vertical === 1)))) return false
        // 圈示格必须被环穿过（度恰为 2）：可用边不足两条即矛盾，只剩两条时全部强制入环
        if (clue && onCount + openCount < 2) return false
        if (clue && onCount + openCount === 2 && onCount < 2) {
          const forced = actOnOpen(cell, (edge) => decide(edge, 1))
          if (forced < 0) return false
          if (forced) dirty = true
          continue
        }
        if (onCount === 2 || (onCount === 1 && openCount === 1)) {
          const acted = actOnOpen(cell, (edge) => decide(edge, onCount === 2 ? 0 : 1))
          if (acted < 0) return false
          if (acted) dirty = true
        }
        if (degrees[cell] !== 2 || !clue) continue
        const before = trail.length
        if (clue === BLACK) {
          for (const edge of [onFirst, onSecond]) {
            if (edge < 0) continue
            const far = straightFar(cell, edge)
            if (far < 0 || !decide(far, 1)) return false
          }
        } else {
          const sides = onFirst < hCount ? [cell - 1, cell + 1] : [cell - cols, cell + cols]
          if (!canTurn(sides[0]) && !canTurn(sides[1])) return false
          if (!canTurn(sides[0]) && !forceTurn(sides[1])) return false
          if (!canTurn(sides[1]) && !forceTurn(sides[0])) return false
        }
        if (trail.length > before) dirty = true
      }
    }
    return true
  }
  const analyze = () => {
    let cycles = 0; let open = 0
    const seen = new Uint8Array(cellTotal)
    for (let start = 0; start < cellTotal; start += 1) {
      if (degrees[start] === 0 || seen[start]) continue
      let cells = 1
      let edges = 0
      const queue = [start]
      seen[start] = 1
      while (queue.length) {
        const cell = queue.pop() as number
        if (degrees[cell] === 1) open += 1
        for (const edge of cellEdges[cell]) {
          if (values[edge] !== 1) continue
          edges += 1
          const [a, b] = edgeEnds[edge]
          const other = a === cell ? b : a
          if (!seen[other]) { seen[other] = 1; cells += 1; queue.push(other) }
        }
      }
      if (edges === cells * 2) cycles += 1
    }
    return { cycles, open }
  }
  const search = (): void => {
    if (aborted) return
    if (visited >= budget) { aborted = true; return }
    visited += 1
    const mark = trail.length
    if (!propagate()) { undoTo(mark); return }
    const { cycles, open } = analyze()
    if (cycles > 1 || (cycles === 1 && open > 0)) { undoTo(mark); return }
    if (cycles === 1) {
      let ok = true
      for (let edge = 0; edge < total && ok; edge += 1) if (values[edge] === -1) ok = decide(edge, 0)
      const on: number[] = []
      for (let edge = 0; edge < total && ok; edge += 1) if (values[edge] === 1) on.push(edge)
      const order = ok ? loopOrder(on, cols, rows) : null
      if (ok && (!order || !validateLoop(order, clues, cols, rows))) ok = false
      if (ok) count += 1
      undoTo(mark)
      return
    }
    let pick = -1; let best = -1
    for (let edge = 0; edge < total; edge += 1) {
      if (values[edge] !== -1) continue
      const [a, b] = edgeEnds[edge]
      const score = (degrees[a] === 1 || degrees[b] === 1 ? 2 : 0) + (clues[a] || clues[b] ? 1 : 0)
      if (score > best) { best = score; pick = edge; if (score === 3) break }
    }
    if (pick < 0) {
      if (degrees.some((degree) => degree > 0) || clues.some((entry) => entry > 0)) { undoTo(mark); return }
      count += 1
      undoTo(mark)
      return
    }
    for (const value of [1, 0]) {
      const branchMark = trail.length
      if (decide(pick, value)) search()
      undoTo(branchMark)
      if (count >= limit || aborted) break
    }
    undoTo(mark)
  }

  search()
  return aborted ? -1 : count
}

export function scoreFor(elapsed: number, mistakes: number, par: number): number {
  const overtime = Math.max(0, Math.floor((elapsed - par) / PENALTY_OVERTIME_STEP)) * PENALTY_OVERTIME_STEP
  return Math.min(SCORE_CAP, Math.max(SCORE_FLOOR, SCORE_BASE - mistakes * PENALTY_PER_MISTAKE - overtime))
}

export function failedScore(elapsed: number, mistakes: number, par: number) { return Math.max(0, scoreFor(elapsed, mistakes, par) - FAIL_PENALTY) }
