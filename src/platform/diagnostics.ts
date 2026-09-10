import type { GameEvent } from '../sdk'

export const DIAGNOSTIC_EVENT = 'openarcade:diagnostic'

function createDiagnosticEvent(gameId: string, event: GameEvent, reason: string) {
  return new CustomEvent(DIAGNOSTIC_EVENT, {
    detail: { gameId, eventType: event.type, reason, timestamp: Date.now() },
  })
}

export type DiagnosticDetail = ReturnType<typeof createDiagnosticEvent>['detail']

export function reportGameDiagnostic(gameId: string, event: GameEvent, reason: string) {
  window.dispatchEvent(createDiagnosticEvent(gameId, event, reason))
}

export function installDiagnosticSink() {
  const onDiagnostic = (event: Event) => {
    const { gameId, eventType, reason } = (event as CustomEvent<DiagnosticDetail>).detail
    console.warn(`[openarcade:${gameId}] ${reason}: ${eventType}`)
  }
  window.addEventListener(DIAGNOSTIC_EVENT, onDiagnostic)
  return () => window.removeEventListener(DIAGNOSTIC_EVENT, onDiagnostic)
}
