import type { GameEvent } from '../sdk'

export const DIAGNOSTIC_EVENT = 'openarcade:diagnostic'

export function reportGameDiagnostic(gameId: string, event: GameEvent, reason: string) {
  window.dispatchEvent(new CustomEvent(DIAGNOSTIC_EVENT, {
    detail: { gameId, eventType: event.type, reason, timestamp: Date.now() },
  }))
}
