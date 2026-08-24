const STORAGE_KEY = 'openarcade:player:v1'
const DEFAULT_LIVES = 5
const MAX_LIVES = 9
const MAX_LOCAL_SCORE = 1_000_000_000

export interface PlayerState {
  lives: number
  bestScores: Record<string, number>
  unlockedLevels: Record<string, number>
}

const fallback: PlayerState = { lives: DEFAULT_LIVES, bestScores: {}, unlockedLevels: {} }

function safeRecord(value: unknown, max: number) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([, score]) => (
    typeof score === 'number' && Number.isInteger(score) && score >= 0 && score <= max
  )))
}

export function loadPlayer(): PlayerState {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<PlayerState>
    const lives = typeof value.lives === 'number' && Number.isFinite(value.lives) ? value.lives : DEFAULT_LIVES
    return {
      lives: Math.min(MAX_LIVES, Math.max(0, Math.floor(lives))),
      bestScores: safeRecord(value.bestScores, MAX_LOCAL_SCORE),
      unlockedLevels: safeRecord(value.unlockedLevels, 500),
    }
  } catch {
    return { ...fallback }
  }
}

export function savePlayer(state: PlayerState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export const playerRules = { defaultLives: DEFAULT_LIVES, maxLives: MAX_LIVES }
