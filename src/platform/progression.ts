export const MAX_LEVEL_COUNT = 500

export interface ProgressGame {
  id: string
  levelCount?: number
}

export function getLevelCount(game: ProgressGame) {
  const count = game.levelCount ?? 1
  return Number.isInteger(count) ? Math.min(MAX_LEVEL_COUNT, Math.max(1, count)) : 1
}

export function getUnlockedLevel(levels: Record<string, number>, game: ProgressGame) {
  const value = levels[game.id]
  const safe = Number.isInteger(value) ? value : 1
  return Math.min(getLevelCount(game), Math.max(1, safe))
}

export function normalizeUnlockedLevels(levels: Record<string, number>, games: readonly ProgressGame[]) {
  return Object.fromEntries(games.map((game) => [game.id, getUnlockedLevel(levels, game)]))
}

export function unlockNextLevel(levels: Record<string, number>, game: ProgressGame, activeLevel: number) {
  const next = Math.min(getLevelCount(game), Math.max(1, activeLevel + 1))
  return { ...levels, [game.id]: Math.max(getUnlockedLevel(levels, game), next) }
}
