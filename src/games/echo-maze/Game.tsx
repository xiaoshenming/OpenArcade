import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, TouchEvent } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RotateCcw } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { exitVisible, hintOf, litWallSegments, moveEcho, pulseEcho, tickEcho, type Dir, type EchoState, type Point } from './logic'
import { createEchoLevelState, ECHO_LEVEL_COUNT, getEchoLevel } from './levels'
import './echo-maze.css'

const KEY_DIRS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', a: 'left', s: 'down', d: 'right' }
const PAD_DIRS = [
  { dir: 'up', icon: ChevronUp, label: '上' },
  { dir: 'left', icon: ChevronLeft, label: '左' },
  { dir: 'down', icon: ChevronDown, label: '下' },
  { dir: 'right', icon: ChevronRight, label: '右' },
] as const

const cellStyle = (cell: Point): CSSProperties => ({ translate: `calc(${cell.x} * 100%) calc(${cell.y} * 100%)` })

export default function EchoMazeGame(props: GameModuleProps) {
  const requested = Number(props.level)
  const level = Math.min(ECHO_LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(requested) ? requested : 1)))
  return <EchoBoard key={level} {...props} level={level} />
}

function EchoBoard({ paused, muted, emit, level: levelNumber }: Omit<GameModuleProps, 'level'> & { level: number }) {
  const spec = useMemo(() => getEchoLevel(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [state, setState] = useState<EchoState>(() => createEchoLevelState(levelNumber))
  const boardRef = useRef(state)
  const touchOrigin = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  useEffect(() => audio.setMuted(muted), [audio, muted])

  useEffect(() => {
    if (state.events.includes('pulse')) audio.play('select')
    if (state.events.includes('move')) audio.play('step')
    if (state.events.includes('bump')) audio.play('mismatch')
    if (state.status === 'completed') audio.play('win')
  }, [audio, state])

  useEffect(() => {
    if (state.status !== 'running' || state.events.length === 0) return
    emit({ type: 'score', score: state.score })
  }, [emit, state])

  useEffect(() => {
    if (state.status === 'completed') emit({ type: 'completed', score: state.score })
  }, [emit, state.score, state.status])

  useEffect(() => {
    if (paused) return
    let raf = 0
    let last = performance.now()
    let acc = 0
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame)
      acc += Math.min(120, now - last)
      last = now
      if (acc < 90 || boardRef.current.status !== 'running') return
      boardRef.current = tickEcho(boardRef.current, acc)
      acc = 0
      setState(boardRef.current)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [paused])

  const step = useCallback((dir: Dir) => {
    if (paused || boardRef.current.status !== 'running') return
    const next = moveEcho(boardRef.current, dir)
    if (next === boardRef.current) return
    boardRef.current = next
    setState(next)
  }, [paused])

  const ping = useCallback(() => {
    if (paused || boardRef.current.status !== 'running') return
    const next = pulseEcho(boardRef.current)
    if (next === boardRef.current) return
    boardRef.current = next
    setState(next)
  }, [paused])

  useEffect(() => {
    if (paused) return
    const onKey = (event: KeyboardEvent) => {
      const dir = KEY_DIRS[event.key]
      if (dir) {
        event.preventDefault()
        step(dir)
        return
      }
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault()
        ping()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paused, ping, step])

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0]
    touchOrigin.current = { x: touch.clientX, y: touch.clientY }
  }

  const onTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const origin = touchOrigin.current
    if (!origin) return
    touchOrigin.current = null
    const touch = event.changedTouches[0]
    const dx = touch.clientX - origin.x
    const dy = touch.clientY - origin.y
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) {
      ping()
      return
    }
    step(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'))
  }

  const restart = useCallback(() => {
    if (paused) return
    emit({ type: 'request-restart' })
  }, [emit, paused])

  const ended = state.status !== 'running'
  const segments = litWallSegments(state)
  const hint = hintOf(state)
  const chipTags = [
    spec.movingExit ? '游移出口' : '',
    spec.hintMs > 0 ? '出口提示' : '',
    spec.cols * spec.rows >= 195 ? '大图' : '',
  ].filter(Boolean)
  return (
    <div className={`echo-game mode-${spec.modeName} ${paused ? 'is-paused' : ''}`} aria-label="回音迷宫游戏区">
      <div className="echo-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 第{spec.chapter}章 {spec.title}</span>
        <strong>{state.score} 分 · 脉冲 {state.pulsesLeft}/{state.pulsesMax} · 步 {state.steps}/{state.par}</strong>
      </div>
      <div className="echo-rule">
        <span>{spec.detail}</span>
        {chipTags.map((tag) => <em key={tag}>{tag}</em>)}
      </div>
      <div className="echo-stage">
        <div
          className="echo-board"
          style={{ '--cols': spec.cols, '--rows': spec.rows } as CSSProperties}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          aria-label="黑暗迷宫"
        >
          {segments.map((seg) => (
            <span key={seg.key} className={`echo-wall wall-${seg.dir}`} style={cellStyle({ x: seg.x, y: seg.y })} />
          ))}
          {state.pulsesUsed > 0 && (
            <span key={`ripple-${state.pulsesUsed}`} className="echo-ripple" style={cellStyle(state.player)} />
          )}
          <span className={`echo-exit ${exitVisible(state) ? 'is-visible' : ''}`} style={cellStyle(state.exit)} />
          {hint !== null && (
            <span className="echo-hint" style={{ ...cellStyle(state.player), transform: `rotate(${hint}deg)` }}>
              <ChevronUp size={22} />
            </span>
          )}
          <span className="echo-player" style={cellStyle(state.player)} />
          {ended && (
            <div className="echo-veil is-win">
              <strong>回声抵达</strong>
              <span>{state.score} 分 · {state.steps} 步 / 最短 {state.par} 步 · 脉冲 {state.pulsesUsed}</span>
            </div>
          )}
        </div>
      </div>
      <div className="echo-controls">
        <div className="echo-pad" aria-label="方向按钮">
          {PAD_DIRS.map(({ dir, icon: Icon, label }) => (
            <button key={dir} className={`echo-pad-button pad-${dir}`} onClick={() => step(dir)} disabled={paused || ended} aria-label={`向${label}移动`}>
              <Icon size={20} />
            </button>
          ))}
        </div>
        <div className="echo-side">
          <button className="echo-ping" onClick={ping} disabled={paused || ended || state.pulsesLeft <= 0} aria-label="发出声呐脉冲">
            脉冲 ×{state.pulsesLeft}
          </button>
          <button className="echo-restart" onClick={restart} disabled={paused}>
            <RotateCcw size={17} />重开本关
          </button>
        </div>
      </div>
    </div>
  )
}
