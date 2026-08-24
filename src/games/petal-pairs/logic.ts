export const PAIR_SYMBOLS = ['✿', '♥', '★', '☀', '♫', '☕', '☾', '♦', '♣', '♠', '❋', '●', '▲', '◆'] as const

export interface PairLevel {
  rows: number
  columns: number
  previewMs: number
  mismatchMs: number
  seed: number
}

export function getPairLevel(level: number): PairLevel {
  const safe = Math.min(40, Math.max(1, Math.floor(level)))
  const [rows, columns] = safe <= 5 ? [2, 2] : safe <= 15 ? [2, 3] : safe <= 25 ? [3, 4] : safe <= 35 ? [4, 4] : [4, 5]
  return {
    rows,
    columns,
    previewMs: Math.max(700, 1900 - safe * 24),
    mismatchMs: Math.max(380, 760 - safe * 7),
    seed: (safe * 2654435761) >>> 0,
  }
}

function random(seed: number) {
  let value = seed
  return () => {
    value += 0x6d2b79f5
    let next = value
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

export function createPairDeck(level: number) {
  const spec = getPairLevel(level)
  const pairCount = spec.rows * spec.columns / 2
  const offset = (level * 3) % PAIR_SYMBOLS.length
  const selected = Array.from({ length: pairCount }, (_, index) => PAIR_SYMBOLS[(offset + index) % PAIR_SYMBOLS.length])
  const deck = [...selected, ...selected]
  const next = random(spec.seed)
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const target = Math.floor(next() * (index + 1))
    ;[deck[index], deck[target]] = [deck[target], deck[index]]
  }
  return deck
}
