const STORAGE_KEY = 'openarcade:player:v1'
const DEFAULT_LIVES = 5
const MAX_LIVES = 9
const MAX_LOCAL_SCORE = 1_000_000_000

export const LIFE_REGEN_MS = 20 * 60 * 1000

export interface PlayerState {
  lives: number
  livesUpdatedAt: number
  bestScores: Record<string, number>
  unlockedLevels: Record<string, number>
}

const fallback: Omit<PlayerState, 'livesUpdatedAt'> = { lives: DEFAULT_LIVES, bestScores: {}, unlockedLevels: {} }

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
      livesUpdatedAt: Number.isFinite(value.livesUpdatedAt) ? (value.livesUpdatedAt as number) : Date.now(),
      bestScores: safeRecord(value.bestScores, MAX_LOCAL_SCORE),
      unlockedLevels: safeRecord(value.unlockedLevels, 500),
    }
  } catch {
    return { ...fallback, livesUpdatedAt: Date.now() }
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

export function applyLifeRegen(state: PlayerState, now = Date.now()): PlayerState {
  const regenerated = Math.floor(Math.max(0, now - state.livesUpdatedAt) / LIFE_REGEN_MS)
  if (regenerated < 1) return state
  return {
    ...state,
    lives: Math.min(MAX_LIVES, state.lives + regenerated),
    livesUpdatedAt: state.livesUpdatedAt + regenerated * LIFE_REGEN_MS,
  }
}

export const playerRules = { defaultLives: DEFAULT_LIVES, maxLives: MAX_LIVES }
