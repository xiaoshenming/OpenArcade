import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Anvil, ArrowDown, ArrowLeft, ArrowRight, ArrowUpToLine, RotateCcw, RotateCw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import {
  ACTIVE, SCORE_CAP, SHAPES, castReforge, createTowerState, hardDrop, movePiece, rotatePiece, softDrop,
  type Grid, type TowerState,
} from './logic'
import { LEVEL_COUNT, getTowerLevel, type TowerLevel } from './levels'
import './stack-tower.css'

type Action = (current: TowerState) => TowerState

interface RunProps {
  plan: TowerLevel
  paused: boolean
  emit: (event: GameEvent) => void
  audio: GameAudio
  onRestart: () => void
}

const buildView = (state: TowerState): Grid => {
  const cells: Grid = state.grid.map((row) => [...row])
  if (state.status === 'playing') {
    SHAPES[state.piece.kind][state.piece.rot].forEach((row, r) => row.forEach((cell, c) => {
      const y = state.piece.y + r
      if (cell && y >= 0) cells[y][state.piece.x + c] = ACTIVE
    }))
  }
  return cells
}

export default function StackTowerGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)))
  const plan = useMemo(() => getTowerLevel(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [epoch, setEpoch] = useState(0)
  useEffect(() => { audio.setMuted(muted) }, [audio, muted])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  return (
    <TowerRun
      key={`${levelNumber}-${epoch}`}
      plan={plan}
      paused={paused}
      emit={emit}
      audio={audio}
      onRestart={() => setEpoch((value) => value + 1)}
    />
  )
}

function TowerRun({ plan, paused, emit, audio, onRestart }: RunProps) {
  const pausedRef = useRef(paused)
  useEffect(() => { pausedRef.current = paused }, [paused])
  const [state, setState] = useState(() => createTowerState(plan))
  const doneRef = useRef(false)
  const scoreRef = useRef(0)
  const act = useCallback((action: Action) => {
    if (!pausedRef.current) setState(action)
  }, [])

  useEffect(() => {
    if (paused || state.status !== 'playing') return
    const timer = window.setInterval(() => setState((current) => softDrop(current)), plan.dropMs)
    return () => window.clearInterval(timer)
  }, [paused, plan.dropMs, state.status])

  useEffect(() => {
    for (const event of state.events) {
      if (event === 'rotate' || event === 'reforge' || event === 'melt') audio.play('select')
      else if (event === 'lock') audio.play('step')
      else if (event === 'clear') audio.play('match')
      else if (event === 'win') audio.play('win')
      else if (event === 'lose') audio.play('lose')
    }
    if (state.score !== scoreRef.current) {
      scoreRef.current = state.score
      emit({ type: 'score', score: Math.min(SCORE_CAP, state.score) })
    }
    if (doneRef.current || state.status === 'playing') return
    doneRef.current = true
    const score = Math.min(SCORE_CAP, state.score)
    if (state.status === 'won') emit({ type: 'completed', score })
    else emit({ type: 'failed', score })
  }, [audio, emit, state])

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      const handled = event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === ' '
      if (!handled) return
      // While paused the host owns these keys: leave them unprevented and untouched.
      if (pausedRef.current) return
      event.preventDefault()
      if (event.key === 'ArrowLeft') {
        act((current) => movePiece(current, -1))
      } else if (event.key === 'ArrowRight') {
        act((current) => movePiece(current, 1))
      } else if (event.key === 'ArrowDown') {
        act(softDrop)
      } else if (event.key === 'ArrowUp') {
        if (!event.repeat) act(rotatePiece)
      } else {
        act(hardDrop)
      }
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [act])

  const view = useMemo(() => buildView(state), [state])
  const playing = state.status === 'playing'
  const remaining = state.sequence.length - state.nextIndex - 1
  const exhausted = state.nextIndex >= state.sequence.length
  const nextKind = state.sequence[state.nextIndex + 1]
  const padButton = (label: string, icon: ReactNode, action: Action) => (
    <button type="button" aria-label={label} disabled={!playing} onPointerDown={() => act(action)}>{icon}</button>
  )

  return (
    <div className={`tw-game chapter-${plan.chapter} is-${state.status}`} aria-label="方块堆塔游戏区">
      <div className="tw-readout">
        <span>关卡 {String(plan.level).padStart(2, '0')} · {plan.title}</span>
        <strong>{state.score} 分</strong>
      </div>
      <div className="tw-rule">
        <span>{plan.detail}</span>
        <em className="is-goal">目标 {state.cleared}/{state.goal}</em>
        <em>余块 {remaining}</em>
        {plan.iceRow >= 0 && <em className="is-ice">冰层</em>}
        {plan.reforges > 0 && <em className={state.reforges > 0 ? 'is-on' : 'is-off'}>重铸 {state.reforges}</em>}
      </div>
      <div className="tw-stage">
        <div className="tw-board">
          {view.flatMap((row, r) => row.map((cell, c) => <div key={`${r}-${c}`} className={`tw-cell is-${cell}`} />))}
        </div>
        <div className="tw-side">
          <div className="tw-next">
            <span>下一块</span>
            <div className="tw-mini">{nextKind ? SHAPES[nextKind][0].flatMap((row, r) => row.map((cell, c) => <i key={`${r}-${c}`} className={cell ? 'on' : ''} />)) : null}</div>
          </div>
          <div className="tw-hint">← → 移动<br />↓ 加速 · ↑ 旋转<br />空格 速降</div>
          {plan.reforges > 0 && (
            <button type="button" className="tw-forge" disabled={!playing || state.reforges <= 0} onPointerDown={() => act(castReforge)}>
              <Anvil size={16} />重铸
            </button>
          )}
        </div>
        {!playing && (
          <div className="tw-stamp">
            <span>{state.status === 'won' ? '堆塔达成' : exhausted ? '方块耗尽' : '塔顶溢出'}</span>
            <strong>{Math.min(SCORE_CAP, state.score)} 分</strong>
            <button type="button" onClick={onRestart}><RotateCcw size={15} />再来一次</button>
          </div>
        )}
      </div>
      <div className="tw-pad">
        {padButton('左移', <ArrowLeft size={18} />, (current) => movePiece(current, -1))}
        {padButton('旋转', <RotateCw size={18} />, rotatePiece)}
        {padButton('右移', <ArrowRight size={18} />, (current) => movePiece(current, 1))}
        {padButton('下落一格', <ArrowDown size={18} />, softDrop)}
        {padButton('速降锁定', <ArrowUpToLine size={18} />, hardDrop)}
        <button type="button" className="tw-restart" onClick={onRestart}><RotateCcw size={16} />重开本关</button>
      </div>
    </div>
  )
}
