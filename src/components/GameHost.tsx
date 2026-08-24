import type { GameEvent, GameManifest } from '../sdk'
import { ComingSoon } from './game-host/HostState'
import { IframeGame } from './game-host/IframeGame'
import { ModuleGame } from './game-host/ModuleGame'

interface GameHostProps {
  game: GameManifest
  sessionKey: number
  paused: boolean
  muted: boolean
  onEvent: (event: GameEvent) => void
}

export function GameHost(props: GameHostProps) {
  if (props.game.status === 'soon') return <ComingSoon />
  if (props.game.loader === 'iframe') {
    return <IframeGame key={`${props.game.id}:${props.sessionKey}`} game={props.game} paused={props.paused} muted={props.muted} onEvent={props.onEvent} />
  }
  return <ModuleGame {...props} />
}
