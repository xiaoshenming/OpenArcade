import { lazy, Suspense, useEffect, useRef } from 'react'
import type { GameEvent, GameManifest, HostCommand } from '../platform/types'
import { hostMessage, parseGameMessage } from '../platform/protocol'

const moduleRegistry = {
  'water-sort': lazy(() => import('../games/water-sort/WaterSortGame')),
}

interface GameHostProps {
  game: GameManifest
  sessionKey: number
  paused: boolean
  muted: boolean
  onEvent: (event: GameEvent) => void
}

function IframeGame({ game, sessionKey, paused, muted, onEvent }: GameHostProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const send = (command: HostCommand) => frameRef.current?.contentWindow?.postMessage(hostMessage(command), window.location.origin)

  useEffect(() => {
    const receive = (message: MessageEvent) => {
      if (message.origin !== window.location.origin || message.source !== frameRef.current?.contentWindow) return
      const event = parseGameMessage(message.data)
      if (event) onEvent(event)
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [onEvent])

  useEffect(() => send({ type: paused ? 'pause' : 'resume' }), [paused])
  useEffect(() => send({ type: 'mute', muted }), [muted])
  useEffect(() => send({ type: 'restart' }), [sessionKey])

  if (game.loader !== 'iframe') return null
  return (
    <iframe
      ref={frameRef}
      className="game-frame"
      src={game.src}
      title={game.title}
      sandbox="allow-scripts allow-same-origin"
      allow="autoplay"
    />
  )
}

export function GameHost(props: GameHostProps) {
  if (props.game.status === 'soon') return <div className="coming-soon"><strong>正在打磨</strong><span>下一枚游戏卡带很快上架</span></div>
  if (props.game.loader === 'iframe') return <IframeGame {...props} />
  const Module = moduleRegistry[props.game.moduleId as keyof typeof moduleRegistry]
  if (!Module) return <div className="game-error">找不到游戏模块：{props.game.moduleId}</div>
  return <Suspense fallback={<div className="game-loading">正在装入卡带…</div>}><Module key={props.sessionKey} sessionKey={props.sessionKey} paused={props.paused} muted={props.muted} emit={props.onEvent} /></Suspense>
}
