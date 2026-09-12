export function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function seedFor(level: number, salt = 0) {
  return ((Math.max(1, Math.floor(level)) * 2654435761) ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0
}

export function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length) % items.length]
}

export function shuffle<T>(random: () => number, items: T[]): T[] {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1))
    ;[items[index], items[swap]] = [items[swap], items[index]]
  }
  return items
}
