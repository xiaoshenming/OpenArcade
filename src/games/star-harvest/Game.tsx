import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, TouchEvent } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RotateCcw, Star } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { SCORE_CAP, queueDir, step as advance, type Dir, type GameState, type Point } from './logic'
import { LEVEL_COUNT, createHarvestState, getHarvestLevel } from './levels'
import './star-harvest.css'

const KEY_DIRS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', a: 'left', s: 'down', d: 'right' }
const PAD_DIRS = [
  { dir: 'up', icon: ChevronUp, label: '上' },
  { dir: 'left', icon: ChevronLeft, label: '左' },
  { dir: 'down', icon: ChevronDown, label: '下' },
  { dir: 'right', icon: ChevronRight, label: '右' },
] as const

const cellStyle = (cell: Point): CSSProperties => ({ translate: `calc(${cell.x} * 100%) calc(${cell.y} * 100%)` })

export default function StarHarvestGame(props: GameModuleProps) {
  const requested = Number(props.level)
  const level = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(requested) ? requested : 1)))
  return <HarvestBoard key={level} {...props} level={level} />
}

function HarvestBoard({ paused, muted, emit, level: levelNumber }: Omit<GameModuleProps, 'level'> & { level: number }) {
  const spec = useMemo(() => getHarvestLevel(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [state, setState] = useState<GameState>(() => createHarvestState(levelNumber))
  const boardRef = useRef(state)
  const touchOrigin = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  useEffect(() => audio.setMuted(muted), [audio, muted])

  useEffect(() => {
    if (state.events.includes('pellet') || state.events.includes('star') || state.events.includes('guard-down')) {
      audio.play('match')
      emit({ type: 'score', score: Math.min(SCORE_CAP, state.score) })
    }
    if (state.events.includes('caught') || state.events.includes('regen')) audio.play('mismatch')
    if (state.status === 'completed') audio.play('win')
    if (state.status === 'failed') audio.play('lose')
  }, [audio, emit, state])

  useEffect(() => {
    if (state.status === 'completed') emit({ type: 'completed', score: Math.min(SCORE_CAP, state.score) })
    if (state.status === 'failed') emit({ type: 'failed', score: Math.min(SCORE_CAP, state.score) })
  }, [emit, state.score, state.status])

  useEffect(() => {
    if (paused) return
    let raf = 0
    let last = performance.now()
    let carry = 0
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      carry += Math.min(120, now - last)
      last = now
      let moved = 0
      while (moved < 5 && boardRef.current.status === 'running' && carry >= boardRef.current.rule.stepMs) {
        carry -= boardRef.current.rule.stepMs
        boardRef.current = advance(boardRef.current)
        moved += 1
      }
      if (moved > 0) setState(boardRef.current)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paused])

  const turn = useCallback((dir: Dir) => {
    if (paused || boardRef.current.status !== 'running') return
    audio.play('select')
    boardRef.current = queueDir(boardRef.current, dir)
    setState(boardRef.current)
  }, [audio, paused])

  useEffect(() => {
    if (paused) return
    const onKey = (event: KeyboardEvent) => {
      const dir = KEY_DIRS[event.key]
      if (!dir) return
      event.preventDefault()
      turn(dir)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paused, turn])

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
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'))
  }

  const restart = useCallback(() => {
    if (paused) return
    boardRef.current = createHarvestState(levelNumber)
    setState(boardRef.current)
  }, [levelNumber, paused])

  const ended = state.status !== 'running'
  const powerRatio = state.rule.powerSteps > 0 ? state.power / state.rule.powerSteps : 0
  const pace = (1000 / state.rule.stepMs).toFixed(1)
  return (
    <div className={`sh-game mode-${spec.modeName} ${paused ? 'is-paused' : ''}`} aria-label="星屑收割游戏区">
      <div className="sh-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 第{spec.chapter}章 {spec.title}</span>
        <strong>{state.score} 分 · {state.eaten}/{state.rule.quota} 屑 · {'♥'.repeat(Math.max(0, state.lives))}</strong>
      </div>
      <div className="sh-rule">
        <span>{spec.detail}</span>
        {spec.wrap && <em>隧道</em>}
        {spec.regenEvery > 0 && <em>再生</em>}
        {spec.chaseEvery <= 1 && <em>疾追</em>}
        {spec.powerBonus > 0 && <em className="sh-power-chip">连锁+3秒</em>}
        <em className="sh-power-chip">护星×3</em>
      </div>
      <div className="sh-stage">
        <div className="sh-board" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} aria-label="星屑迷宫">
          {state.walls.map((cell) => (
            <span key={`w-${cell.x}-${cell.y}`} className="sh-wall" style={cellStyle(cell)} />
          ))}
          {state.pellets.map((cell) => (
            <span key={`p-${cell.x}-${cell.y}`} className="sh-pellet" style={cellStyle(cell)} />
          ))}
          {state.stars.map((cell) => (
            <span key={`s-${cell.x}-${cell.y}`} className="sh-star" style={cellStyle(cell)} />
          ))}
          {state.guards.map((guard, index) => (
            <span key={`g-${index}`} className={`sh-guard is-${guard.mode}`} style={cellStyle(guard.pos)} />
          ))}
          <span className="sh-player" style={cellStyle(state.player)} />
          <div className="sh-power" aria-hidden="true"><i style={{ width: `${Math.round(powerRatio * 100)}%` }} /></div>
          {ended && (
            <div className={`sh-veil ${state.status === 'failed' ? 'is-lose' : 'is-win'}`}>
              <strong>{state.status === 'failed' ? '收割中断' : '星屑满仓'}</strong>
              <span>{state.score} 分 · {state.eaten} 屑 · 重开再战</span>
            </div>
          )}
        </div>
      </div>
      <div className="sh-controls">
        <div className="sh-pad" aria-label="方向按钮">
          {PAD_DIRS.map(({ dir, icon: Icon, label }) => (
            <button key={dir} type="button" className={`sh-pad-button pad-${dir}`} onClick={() => turn(dir)} disabled={paused || ended} aria-label={`向${label}移动`}>
              <Icon size={20} />
            </button>
          ))}
        </div>
        <div className="sh-side">
          <span className="sh-pace">{pace} 格/秒 · 护星 {Math.max(0, state.power)} 步</span>
          <button type="button" className="sh-restart" onClick={restart} disabled={paused}>
            <RotateCcw size={17} />重开本关
          </button>
        </div>
      </div>
      <span className="sh-star-mark" aria-hidden="true"><Star size={13} /></span>
    </div>
  )
}
