const STORAGE_KEY = 'openarcade:player:v1'
const DEFAULT_LIVES = 5
const MAX_LIVES = 9

export interface PlayerState {
  lives: number
  bestScores: Record<string, number>
}

const fallback: PlayerState = { lives: DEFAULT_LIVES, bestScores: {} }

export function loadPlayer(): PlayerState {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '') as Partial<PlayerState>
    return {
      lives: Math.min(MAX_LIVES, Math.max(0, Number(value.lives ?? DEFAULT_LIVES))),
      bestScores: value.bestScores && typeof value.bestScores === 'object' ? value.bestScores : {},
    }
  } catch {
    return { ...fallback }
  }
}

export function savePlayer(state: PlayerState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export const playerRules = { defaultLives: DEFAULT_LIVES, maxLives: MAX_LIVES }
