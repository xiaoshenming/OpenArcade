import { mulberry32, shuffle } from '../../platform/rng'
import { normalize, orientCells, orientationSet, shapeCandidates, TANGRAM_COLORS, type Cells, type TangramFamily, type TangramPiece, type TangramPuzzle } from './logic'

function pickSizes(area: number, count: number, lo: number, hi: number, rng: () => number, rounds: number): number[] {
  const base = Math.floor(area / count)
  const sizes = Array.from({ length: count }, (_, index) => base + (index < area - base * count ? 1 : 0))
  for (let round = 0; round < rounds; round += 1) {
    const from = Math.floor(rng() * count)
    const to = Math.floor(rng() * count)
    if (from === to || sizes[from] <= lo || sizes[to] >= hi || rng() < 0.45) continue
    sizes[from] -= 1
    sizes[to] += 1
  }
  return sizes.sort((a, b) => b - a)
}

interface CatalogEntry {
  family: TangramFamily
  base: Cells
  variants: Cells[]
}

interface TilingResult {
  anchors: number[]
  bases: Cells[]
  families: TangramFamily[]
  solOrientations: number[]
}

const NODE_BUDGET = 6000
const PLAIN_ATTEMPTS = 24
const ZIGZAG_ATTEMPTS = 40

function freeSpot(rows: number, cols: number, cells: Cells, anchor: number, occupied: boolean[]): boolean {
  const r0 = Math.floor(anchor / cols)
  const c0 = anchor - r0 * cols
  for (const [dr, dc] of cells) {
    const row = r0 + dr
    const col = c0 + dc
    if (row < 0 || row >= rows || col < 0 || col >= cols || occupied[row * cols + col]) return false
  }
  return true
}

function stampSpot(cols: number, cells: Cells, anchor: number, occupied: boolean[], value: boolean) {
  const r0 = Math.floor(anchor / cols)
  const c0 = anchor - r0 * cols
  for (const [dr, dc] of cells) occupied[(r0 + dr) * cols + (c0 + dc)] = value
}

function minFamilyUse(entries: CatalogEntry[], useCount: Record<TangramFamily, number>) {
  let minUse = Number.MAX_SAFE_INTEGER
  for (const entry of entries) minUse = Math.min(minUse, useCount[entry.family])
  return minUse
}

function searchTiling(rows: number, cols: number, sizes: number[], catalog: Map<number, CatalogEntry[]>, seeded?: boolean[]): TilingResult | null {
  const order = sizes.map((_, index) => index).sort((a, b) => sizes[b] - sizes[a])
  const occupied = seeded ? [...seeded] : new Array<boolean>(rows * cols).fill(false)
  const anchors = new Array<number>(sizes.length).fill(-1)
  const bases = new Array<Cells>(sizes.length)
  const families = new Array<TangramFamily>(sizes.length)
  const solOrientations = new Array<number>(sizes.length).fill(0)
  const used = new Array<boolean>(sizes.length).fill(false)
  const useCount: Record<TangramFamily, number> = { I: 0, L: 0, T: 0, S: 0, Z: 0, O: 0 }
  let visits = 0
  const walk = (depth: number): boolean => {
    if (depth === sizes.length) return true
    if (visits >= NODE_BUDGET) return false
    visits += 1
    const first = occupied.indexOf(false)
    if (first < 0) return false
    for (const id of order) {
      if (used[id]) continue
      const entries = catalog.get(sizes[id]) ?? []
      const minUse = minFamilyUse(entries, useCount)
      for (let pass = 0; pass < 2; pass += 1) {
        for (const entry of entries) {
          if (pass === 0 ? useCount[entry.family] > minUse : useCount[entry.family] <= minUse) continue
          for (let o = 0; o < entry.variants.length; o += 1) {
            for (const [dr, dc] of entry.variants[o]) {
              const anchor = first - dr * cols - dc
              if (!freeSpot(rows, cols, entry.variants[o], anchor, occupied)) continue
              stampSpot(cols, entry.variants[o], anchor, occupied, true)
              used[id] = true
              anchors[id] = anchor
              bases[id] = entry.base
              families[id] = entry.family
              solOrientations[id] = o
              useCount[entry.family] += 1
              if (walk(depth + 1)) return true
              useCount[entry.family] -= 1
              stampSpot(cols, entry.variants[o], anchor, occupied, false)
              used[id] = false
            }
          }
        }
      }
    }
    return false
  }
  if (!walk(0)) return null
  return { anchors, bases, families, solOrientations }
}

export interface BuildOptions {
  rows: number
  cols: number
  count: number
  families: readonly TangramFamily[]
  sizeMin: number
  sizeMax: number
  allowRotate: boolean
  zigzag?: boolean
  seed: number
}

function buildCatalog(options: BuildOptions, sizes: readonly number[], rng: () => number): Map<number, CatalogEntry[]> {
  const catalog = new Map<number, CatalogEntry[]>()
  for (const size of new Set(sizes)) {
    const entries = options.families
      .flatMap((family) => shapeCandidates(family, size, options.rows, options.cols))
      .map((pick) => ({ family: pick.family, base: pick.base, variants: options.allowRotate ? orientationSet(pick.base) : [pick.base] }))
    if (entries.length) catalog.set(size, shuffle(rng, entries))
  }
  return catalog
}

interface PresetPiece {
  family: TangramFamily
  size: number
  base: Cells
  orientation: number
  anchor: number
}

function placeZigzag(options: BuildOptions, rng: () => number): PresetPiece | null {
  const family: TangramFamily = rng() < 0.5 ? 'S' : 'Z'
  const candidates = shapeCandidates(family, 4, options.rows, options.cols)
  if (!candidates.length) return null
  const base = candidates[Math.floor(rng() * candidates.length)].base
  const corners = [0, options.cols - 1, (options.rows - 1) * options.cols, options.rows * options.cols - 1]
  const orientation = Math.floor(rng() * 4)
  const cells = orientCells(base, orientation)
  const empty = new Array<boolean>(options.rows * options.cols).fill(false)
  const open = corners.filter((anchor) => freeSpot(options.rows, options.cols, cells, anchor, empty))
  if (!open.length) return null
  return { family, size: 4, base, orientation, anchor: open[Math.floor(rng() * open.length)] }
}

export function buildTangramPuzzle(options: BuildOptions): TangramPuzzle | null {
  const rng = mulberry32(options.seed)
  const area = options.rows * options.cols
  const palette = shuffle(rng, TANGRAM_COLORS.map((_, index) => index))
  if (options.zigzag) {
    for (let attempt = 0; attempt < ZIGZAG_ATTEMPTS; attempt += 1) {
      const preset = placeZigzag(options, rng)
      if (!preset) return null
      const sizes = pickSizes(area - preset.size, options.count - 1, options.sizeMin, options.sizeMax, rng, Math.min(options.count * 3, (attempt + 1) * 2))
      const catalog = buildCatalog(options, sizes, rng)
      if (catalog.size < new Set(sizes).size) continue
      const seeded = new Array<boolean>(area).fill(false)
      stampSpot(options.cols, orientCells(preset.base, preset.orientation), preset.anchor, seeded, true)
      const placed = searchTiling(options.rows, options.cols, sizes, catalog, seeded)
      if (!placed) continue
      return {
        pieces: [
          { family: preset.family, size: preset.size, base: preset.base, orientation: preset.orientation, color: palette[0] },
          ...placed.bases.map((base, index) => ({
            family: placed.families[index],
            size: base.length,
            base,
            orientation: options.allowRotate ? Math.floor(rng() * 4) : 0,
            color: palette[(index + 1) % palette.length],
          })),
        ],
        anchors: [preset.anchor, ...placed.anchors],
        solOrientations: [preset.orientation, ...placed.solOrientations],
      }
    }
    return null
  }
  for (let attempt = 0; attempt < PLAIN_ATTEMPTS; attempt += 1) {
    const sizes = pickSizes(area, options.count, options.sizeMin, options.sizeMax, rng, Math.min(options.count * 3, (attempt + 1) * options.count))
    const catalog = buildCatalog(options, sizes, rng)
    if (catalog.size < new Set(sizes).size) continue
    const placed = searchTiling(options.rows, options.cols, sizes, catalog)
    if (!placed) continue
    return {
      pieces: placed.bases.map((base, index) => ({
        family: placed.families[index],
        size: base.length,
        base,
        orientation: options.allowRotate ? Math.floor(rng() * 4) : 0,
        color: palette[index % palette.length],
      })),
      anchors: placed.anchors,
      solOrientations: placed.solOrientations,
    }
  }
  return null
}

export function buildStripPuzzle(rows: number, cols: number, count: number): TangramPuzzle {
  const pieces: TangramPiece[] = []
  const anchors: number[] = []
  const solOrientations: number[] = []
  const emit = (row0: number, col0: number, height: number, width: number, color: number) => {
    const cells: Cells = []
    for (let dr = 0; dr < height; dr += 1) for (let dc = 0; dc < width; dc += 1) cells.push([dr, dc])
    pieces.push({ family: height === 1 ? 'I' : 'O', size: height * width, base: normalize(cells), orientation: 0, color: color % TANGRAM_COLORS.length })
    anchors.push(row0 * cols + col0)
    solOrientations.push(0)
  }
  const split = (row0: number, col0: number, height: number, width: number, parts: number, color: number) => {
    if (parts <= 1 || height * width < 4) {
      emit(row0, col0, height, width, color)
      return
    }
    const first = Math.floor(parts / 2)
    if (height >= width) {
      const cut = Math.max(1, Math.min(height - 1, Math.round((height * first) / parts)))
      split(row0, col0, cut, width, first, color)
      split(row0 + cut, col0, height - cut, width, parts - first, color + 1)
    } else {
      const cut = Math.max(1, Math.min(width - 1, Math.round((width * first) / parts)))
      split(row0, col0, height, cut, first, color)
      split(row0, col0 + cut, height, width - cut, parts - first, color + 1)
    }
  }
  split(0, 0, rows, cols, Math.min(count, Math.floor((rows * cols) / 2)), 0)
  return { pieces, anchors, solOrientations }
}
