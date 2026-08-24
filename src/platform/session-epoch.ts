export interface SessionEpoch {
  capture: () => number
  advance: () => number
  isCurrent: (value: number) => boolean
}

export function createSessionEpoch(): SessionEpoch {
  let current = 0
  return {
    capture: () => current,
    advance: () => ++current,
    isCurrent: (value) => value === current,
  }
}
