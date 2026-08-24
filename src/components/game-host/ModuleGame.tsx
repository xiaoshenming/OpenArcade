import { lazy, Suspense, type LazyExoticComponent, type ComponentType } from 'react'
import { games, getGameModule } from '../../platform/registry'
import type { GameEvent, GameManifest, GameModuleProps } from '../../sdk'
import { GameErrorBoundary } from './GameErrorBoundary'
import { ErrorState, LoadingState } from './HostState'

const modules = new Map<string, LazyExoticComponent<ComponentType<GameModuleProps>>>()

for (const game of games) {
  const loader = game.loader === 'module' ? getGameModule(game.id) : undefined
  if (loader) modules.set(game.id, lazy(loader))
}

interface Props {
  game: GameManifest
  sessionKey: number
  paused: boolean
  muted: boolean
  onEvent: (event: GameEvent) => void
}

export function ModuleGame({ game, sessionKey, paused, muted, onEvent }: Props) {
  const Module = modules.get(game.id)
  if (!Module) return <ErrorState message={`找不到模块：${game.id}`} onRetry={() => window.location.reload()} />

  const resetKey = `${game.id}:${sessionKey}`
  return (
    <GameErrorBoundary resetKey={resetKey} onError={() => onEvent({ type: 'failed', score: 0 })}>
      <Suspense fallback={<LoadingState />}>
        {/* Registry components are created once at module initialization. */}
        {/* eslint-disable-next-line react-hooks/static-components */}
        <Module key={resetKey} sessionKey={sessionKey} paused={paused} muted={muted} emit={onEvent} />
      </Suspense>
    </GameErrorBoundary>
  )
}
