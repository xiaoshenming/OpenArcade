export interface Clue {
  readonly cell: number
  readonly need: number
}

export interface SeaPuzzle {
  readonly rows: number
  readonly cols: number
  readonly clues: readonly Clue[]
  readonly given: readonly boolean[]
  readonly solution: readonly boolean[]
  readonly par: number
  readonly timeLimit: number
}

export const UNKNOWN = -1
export const SEA_MARK = 0
export const LAND_MARK = 1

export function orthNeighbors(cell: number, rows: number, cols: number): number[] {
  const row = Math.floor(cell / cols)
  const col = cell % cols
  const list: number[] = []
  if (row > 0) list.push(cell - cols)
  if (row + 1 < rows) list.push(cell + cols)
  if (col > 0) list.push(cell - 1)
  if (col + 1 < cols) list.push(cell + 1)
  return list
}

export function has2x2Sea(sea: readonly boolean[], rows: number, cols: number): boolean {
  for (let row = 0; row + 1 < rows; row += 1) {
    for (let col = 0; col + 1 < cols; col += 1) {
      const cell = row * cols + col
      if (sea[cell] && sea[cell + 1] && sea[cell + cols] && sea[cell + cols + 1]) return true
    }
  }
  return false
}

export function isSeaLinked(sea: readonly boolean[], rows: number, cols: number): boolean {
  const start = sea.indexOf(true)
  if (start < 0) return true
  const seen = new Set<number>([start])
  const queue = [start]
  for (let head = 0; head < queue.length; head += 1) {
    for (const next of orthNeighbors(queue[head], rows, cols)) {
      if (sea[next] && !seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  return seen.size === sea.reduce((sum, flag) => sum + (flag ? 1 : 0), 0)
}
export interface SeaAudit {
  readonly sizes: readonly number[]
  readonly islandsOk: boolean
  readonly seaLinked: boolean
  readonly no2x2: boolean
  readonly solved: boolean
}
export function auditSea(puzzle: Pick<SeaPuzzle, 'rows' | 'cols' | 'clues'>, state: readonly number[]): SeaAudit {
  const { rows, cols } = puzzle
  const total = rows * cols
  const comp = new Array<number>(total).fill(-1)
  const sizes: number[] = []
  const compClues: number[][] = []
  for (let start = 0; start < total; start += 1) {
    if (state[start] === 1 || comp[start] >= 0) continue
    const id = sizes.length
    const members = [start]
    comp[start] = id
    for (let head = 0; head < members.length; head += 1) {
      for (const next of orthNeighbors(members[head], rows, cols)) {
        if (state[next] === 1 || comp[next] >= 0) continue
        comp[next] = id
        members.push(next)
      }
    }
    sizes.push(members.length)
    compClues.push(members.flatMap((cell) => {
      const index = puzzle.clues.findIndex((entry) => entry.cell === cell)
      return index >= 0 ? [index] : []
    }))
  }
  const clueSizes = puzzle.clues.map((clue) => (comp[clue.cell] >= 0 ? sizes[comp[clue.cell]] : 0))
  const islandsOk = compClues.every((list, id) => list.length === 1 && sizes[id] === puzzle.clues[list[0]].need)
  const sea = state.map((mark) => mark === 1)
  const seaLinked = isSeaLinked(sea, rows, cols)
  const no2x2 = !has2x2Sea(sea, rows, cols)
  return { sizes: clueSizes, islandsOk, seaLinked, no2x2, solved: islandsOk && seaLinked && no2x2 }
}
function propagate(marks: number[], rows: number, cols: number, clues: readonly Clue[]): boolean {
  const total = rows * cols
  let changed = true
  while (changed) {
    changed = false
    const comp = new Array<number>(total).fill(-1)
    const members: number[][] = []
    const compClue: number[] = []
    for (let start = 0; start < total; start += 1) {
      if (marks[start] !== LAND_MARK || comp[start] >= 0) continue
      const id = members.length
      const list = [start]
      comp[start] = id
      for (let head = 0; head < list.length; head += 1) {
        for (const next of orthNeighbors(list[head], rows, cols)) {
          if (marks[next] !== LAND_MARK || comp[next] >= 0) continue
          comp[next] = id
          list.push(next)
        }
      }
      members.push(list)
      compClue.push(-1)
    }
    for (let index = 0; index < clues.length; index += 1) {
      const id = comp[clues[index].cell]
      if (compClue[id] >= 0) return true
      compClue[id] = index
    }
    const paint = (cell: number, mark: number) => {
      if (marks[cell] === mark || marks[cell] === UNKNOWN) {
        if (marks[cell] === UNKNOWN) {
          marks[cell] = mark
          changed = true
        }
        return
      }
      throw new Error('conflict')
    }
    for (let index = 0; index < clues.length; index += 1) {
      const clue = clues[index]
      const island = members[comp[clue.cell]]
      try {
        if (island.length > clue.need) return true
        const frontier = new Set<number>()
        for (const cell of island) {
          for (const next of orthNeighbors(cell, rows, cols)) if (marks[next] === UNKNOWN) frontier.add(next)
        }
        if (island.length < clue.need && frontier.size === 1) paint([...frontier][0], LAND_MARK)
        const reach = [clue.cell]
        const seen = new Set<number>(reach)
        for (let head = 0; head < reach.length; head += 1) {
          for (const next of orthNeighbors(reach[head], rows, cols)) {
            if (seen.has(next) || marks[next] === SEA_MARK) continue
            if (marks[next] === LAND_MARK && compClue[comp[next]] >= 0 && comp[next] !== comp[clue.cell]) continue
            seen.add(next)
            reach.push(next)
          }
        }
        if (reach.length < clue.need) return true
        if (reach.length === clue.need) for (const cell of reach) paint(cell, LAND_MARK)
        if (island.length === clue.need) {
          for (const cell of island) {
            for (const next of orthNeighbors(cell, rows, cols)) if (marks[next] === UNKNOWN) paint(next, SEA_MARK)
          }
        }
      } catch {
        return true
      }
    }
    for (let cell = 0; cell < total; cell += 1) {
      const row = Math.floor(cell / cols)
      const col = cell % cols
      if (row + 1 >= rows || col + 1 >= cols) continue
      const block = [cell, cell + 1, cell + cols, cell + cols + 1]
      const seas = block.filter((spot) => marks[spot] === SEA_MARK).length
      const open = block.find((spot) => marks[spot] === UNKNOWN)
      if (seas === 4) return true
      if (seas === 3 && open !== undefined) paint(open, LAND_MARK)
    }
    const seaOf = marks.map((mark) => mark === SEA_MARK)
    if (!isSeaLinked(seaOf, rows, cols) && marks.some((mark) => mark === UNKNOWN)) {
      const seen = new Set<number>()
      for (let start = 0; start < total; start += 1) {
        if (!seaOf[start] || seen.has(start)) continue
        const group = [start]
        seen.add(start)
        let open = false
        const ports = new Set<number>()
        for (let head = 0; head < group.length; head += 1) {
          for (const next of orthNeighbors(group[head], rows, cols)) {
            if (seaOf[next] && !seen.has(next)) {
              seen.add(next)
              group.push(next)
            }
            if (marks[next] === UNKNOWN) {
              open = true
              ports.add(next)
            }
          }
        }
        if (!open) return true
        if (ports.size === 1) paint([...ports][0], SEA_MARK)
      }
    }
    const fluid = new Array<number>(total).fill(-1)
    let fluidWithSea = -1
    let fluidComps = 0
    for (let start = 0; start < total; start += 1) {
      if (marks[start] === LAND_MARK || fluid[start] >= 0) continue
      const id = fluidComps
      fluidComps += 1
      const group = [start]
      fluid[start] = id
      for (let head = 0; head < group.length; head += 1) {
        for (const next of orthNeighbors(group[head], rows, cols)) {
          if (marks[next] !== LAND_MARK && fluid[next] < 0) {
            fluid[next] = id
            group.push(next)
          }
        }
      }
      if (group.some((cell) => marks[cell] === SEA_MARK)) {
        if (fluidWithSea >= 0 && fluidWithSea !== id) return true
        fluidWithSea = id
      }
    }
    const knownLand = marks.reduce((sum, mark) => sum + (mark === LAND_MARK ? 1 : 0), 0)
    const unknownCount = marks.reduce((sum, mark) => sum + (mark === UNKNOWN ? 1 : 0), 0)
    const needTotal = clues.reduce((sum, clue) => sum + clue.need, 0)
    if (knownLand > needTotal || knownLand + unknownCount < needTotal) return true
    if (knownLand + unknownCount === needTotal) {
      for (let cell = 0; cell < total; cell += 1) {
        if (marks[cell] !== UNKNOWN) continue
        try {
          paint(cell, LAND_MARK)
        } catch {
          return true
        }
      }
    }
  }
  return false
}
function walk(marks: number[], rows: number, cols: number, clues: readonly Clue[], counter: { count: number; samples: number[][] }, limit: number, budget: { nodes: number }): boolean {
  if (counter.count >= limit || budget.nodes <= 0) return true
  budget.nodes -= 1
  let pick = -1
  let best = -1
  const total = rows * cols
  for (let cell = 0; cell < total; cell += 1) {
    if (marks[cell] !== UNKNOWN) continue
    let landPeers = 0
    let knownPeers = 0
    for (const next of orthNeighbors(cell, rows, cols)) {
      if (marks[next] === LAND_MARK) landPeers += 1
      if (marks[next] !== UNKNOWN) knownPeers += 1
    }
    const score = landPeers * 16 + knownPeers
    if (score > best) {
      best = score
      pick = cell
      if (landPeers >= 3) break
    }
  }
  if (pick < 0) {
    const state = marks.map((mark) => (mark === SEA_MARK ? 1 : 0))
    const good = auditSea({ rows, cols, clues }, state).solved
    if (good) counter.count += 1
    if (good && counter.samples.length < limit) counter.samples.push(state)
    return counter.count >= limit
  }
  for (const mark of [LAND_MARK, SEA_MARK]) {
    const snapshot = marks.slice()
    marks[pick] = mark
    if (!propagate(marks, rows, cols, clues) && walk(marks, rows, cols, clues, counter, limit, budget)) return true
    snapshot.forEach((value, cell) => { marks[cell] = value })
    if (counter.count >= limit || budget.nodes <= 0) return true
  }
  return false
}
export interface SolveReport {
  readonly count: number
  readonly settled: boolean
  readonly samples: readonly number[][]
}
export function solveReport(puzzle: Pick<SeaPuzzle, 'rows' | 'cols' | 'clues' | 'given'>, state: readonly number[], limit: number, nodes = 1200): SolveReport {
  const total = puzzle.rows * puzzle.cols
  const marks = new Array<number>(total).fill(UNKNOWN)
  puzzle.clues.forEach((clue) => {
    marks[clue.cell] = LAND_MARK
  })
  for (let cell = 0; cell < total; cell += 1) {
    if (state[cell] !== 1 && !puzzle.given[cell]) continue
    if (marks[cell] === LAND_MARK) return { count: 0, settled: true, samples: [] }
    marks[cell] = SEA_MARK
  }
  if (propagate(marks, puzzle.rows, puzzle.cols, puzzle.clues)) return { count: 0, settled: true, samples: [] }
  const counter = { count: 0, samples: [] as number[][] }
  const budget = { nodes }
  walk(marks, puzzle.rows, puzzle.cols, puzzle.clues, counter, limit, budget)
  return { count: counter.count, settled: budget.nodes > 0 || counter.count >= limit, samples: counter.samples }
}

export function seaScore(ops: number, par: number, mistakes: number): number {
  return Math.max(100, 1000 - Math.max(0, ops - par) * 10 - mistakes * 60)
}
