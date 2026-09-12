import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, TouchEvent } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, RotateCcw } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { queueDir, step as advance, type Dir, type GameState, type Point } from './logic'
import { createSnakeState, getSnakeLevel } from './levels'
import './snake-garden.css'

const KEY_DIRS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', a: 'left', s: 'down', d: 'right' }
const PAD_DIRS = [
  { dir: 'up', icon: ChevronUp, label: '上' },
  { dir: 'left', icon: ChevronLeft, label: '左' },
  { dir: 'down', icon: ChevronDown, label: '下' },
  { dir: 'right', icon: ChevronRight, label: '右' },
] as const

const cellStyle = (cell: Point): CSSProperties => ({ translate: `calc(${cell.x} * 100%) calc(${cell.y} * 100%)` })

export default function SnakeGardenGame(props: GameModuleProps) {
  const requested = Number(props.level)
  const level = Math.min(60, Math.max(1, Math.floor(Number.isFinite(requested) ? requested : 1)))
  return <SnakeBoard key={level} {...props} level={level} />
}

function SnakeBoard({ paused, muted, emit, level: levelNumber }: Omit<GameModuleProps, 'level'> & { level: number }) {
  const spec = useMemo(() => getSnakeLevel(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [state, setState] = useState<GameState>(() => createSnakeState(levelNumber))
  const boardRef = useRef(state)
  const touchOrigin = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  useEffect(() => audio.setMuted(muted), [audio, muted])

  useEffect(() => {
    if (state.events.includes('eat') || state.events.includes('golden')) {
      audio.play('match')
      emit({ type: 'score', score: state.score })
    }
    if (state.events.includes('expire') || state.events.includes('golden-gone')) audio.play('mismatch')
    if (state.status === 'completed') audio.play('win')
    if (state.status === 'failed') audio.play('lose')
  }, [audio, emit, state])

  useEffect(() => {
    if (state.status === 'completed') emit({ type: 'completed', score: state.score })
    if (state.status === 'failed') emit({ type: 'failed', score: state.score })
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
      while (moved < 6 && boardRef.current.status === 'running' && carry >= boardRef.current.speedMs) {
        carry -= boardRef.current.speedMs
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
    emit({ type: 'request-restart' })
  }, [emit, paused])

  const ended = state.status !== 'running'
  const fruitRatio = state.rule.fruitLifespan > 0 ? state.fruitAge / state.rule.fruitLifespan : 0
  const goldenRatio = state.golden ? state.goldenAge / state.rule.goldenLifespan : 0
  const pace = (1000 / state.speedMs).toFixed(1)
  return (
    <div className={`snake-game mode-${spec.modeName} ${paused ? 'is-paused' : ''}`} aria-label="蛇径迷藏游戏区">
      <div className="snake-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 第{spec.chapter}章 {spec.title}</span>
        <strong>{state.score} 分 · {state.eaten}/{state.rule.quota} 果 · {pace} 格/秒</strong>
      </div>
      <div className="snake-rule">
        <span>{spec.detail}</span>
        {spec.walls.length > 0 && <em>墙阵</em>}
        {spec.fruitLifespan > 0 && <em>限时果</em>}
        {spec.wrap && <em>穿墙</em>}
        {spec.golden && <em>金果×3</em>}
      </div>
      <div className="snake-stage">
        <div className="snake-board" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} aria-label="果园棋盘">
          {state.walls.map((cell) => (
            <span key={`w-${cell.x}-${cell.y}`} className="snake-wall" style={cellStyle(cell)} />
          ))}
          <span key={`f-${state.fruit.x}-${state.fruit.y}`} className={`snake-fruit ${fruitRatio >= 0.6 ? 'is-expiring' : ''}`} style={cellStyle(state.fruit)} />
          {state.golden && (
            <span key={`g-${state.golden.x}-${state.golden.y}`} className={`snake-fruit is-golden ${goldenRatio >= 0.6 ? 'is-expiring' : ''}`} style={cellStyle(state.golden)} />
          )}
          {state.snake.map((cell, index) => (
            <span key={index} className={index === 0 ? 'snake-head' : 'snake-body'} style={cellStyle(cell)} />
          ))}
          {ended && (
            <div className={`snake-veil ${state.status === 'failed' ? 'is-lose' : 'is-win'}`}>
              <strong>{state.status === 'failed' ? '蛇径中断' : '满载而归'}</strong>
              <span>{state.score} 分 · {state.eaten} 果 · 重开再战</span>
            </div>
          )}
        </div>
      </div>
      <div className="snake-controls">
        <div className="snake-pad" aria-label="方向按钮">
          {PAD_DIRS.map(({ dir, icon: Icon, label }) => (
            <button key={dir} className={`snake-pad-button pad-${dir}`} onClick={() => turn(dir)} disabled={paused || ended} aria-label={`向${label}移动`}>
              <Icon size={20} />
            </button>
          ))}
        </div>
        <button className="snake-restart" onClick={restart} disabled={paused}>
          <RotateCcw size={17} />重开本关
        </button>
      </div>
    </div>
  )
}
