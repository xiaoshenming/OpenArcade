import { useEffect, useMemo, useRef, useState } from 'react'
import { Gauge, LockKeyhole, Palette, RotateCcw, Snowflake, Sparkles } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { mulberry32, seedFor } from '../../platform/rng'
import { areAdjacent, createGemBoard, goalSummary, hasValidSwap, resolveSwap, shuffleBoard, type BoardState } from './logic'
import { getGemLevel, LEVEL_COUNT } from './levels'
import './gem-tide.css'

type Phase = 'play' | 'won' | 'lost'
interface FxState { pop: number[]; shake: number[]; spawn: number[] }
const EMPTY_FX: FxState = { pop: [], shake: [], spawn: [] }
const SCORE_CAP = 10000
const BONUS_PER_SPARE_MOVE = 25

const modeIcon = (mode: string) => {
  if (mode === 'quota') return <Gauge size={14} />
  if (mode === 'collect') return <Palette size={14} />
  if (mode === 'jelly') return <Snowflake size={14} />
  if (mode === 'locks') return <LockKeyhole size={14} />
  return <Sparkles size={14} />
}

export default function GemTideGame({ paused, muted, emit, level = 1, sessionKey }: GameModuleProps) {
  const levelNumber = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  return <GemTideSession key={`${sessionKey}-${levelNumber}`} levelNumber={levelNumber} paused={paused} muted={muted} emit={emit} />
}

function GemTideSession({ levelNumber, paused, muted, emit }: { levelNumber: number; paused: boolean; muted: boolean; emit: (event: GameEvent) => void }) {
  const spec = getGemLevel(levelNumber)
  const audio = useMemo(() => createGameAudio(), [])
  const rngRef = useRef(mulberry32(seedFor(levelNumber, 11)))
  const [state, setState] = useState<BoardState>(() => createGemBoard(levelNumber))
  const [collected, setCollected] = useState<number[]>(() => new Array(6).fill(0))
  const [score, setScore] = useState(0)
  const [moves, setMoves] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [phase, setPhase] = useState<Phase>('play')
  const [waves, setWaves] = useState(0)
  const [rearranged, setRearranged] = useState(0)
  const [fx, setFx] = useState<FxState>(EMPTY_FX)
  const summary = goalSummary(spec, state, score, collected)

  useEffect(() => audio.setMuted(muted), [audio, muted])

  useEffect(() => {
    if (paused || (fx.pop.length === 0 && fx.shake.length === 0 && fx.spawn.length === 0)) return
    const timer = window.setTimeout(() => setFx(EMPTY_FX), 420)
    return () => window.clearTimeout(timer)
  }, [fx, paused])

  const finish = (finalScore: number, outcome: Exclude<Phase, 'play'>) => {
    setPhase(outcome)
    audio.play(outcome === 'won' ? 'win' : 'lose')
    emit({ type: outcome === 'won' ? 'completed' : 'failed', score: finalScore })
  }

  const attemptSwap = (cell: number) => {
    if (paused || phase !== 'play') return
    if (selected === null || selected === cell) {
      if (selected === cell) setSelected(null)
      else if (!state.locks[cell]) {
        setSelected(cell)
        audio.play('select')
      }
      return
    }
    if (!areAdjacent(selected, cell)) {
      if (!state.locks[cell]) {
        setSelected(cell)
        audio.play('select')
      }
      return
    }
    const from = selected
    setSelected(null)
    const result = resolveSwap(state, from, cell, rngRef.current)
    const nextMoves = moves + 1
    if (!result.valid) {
      audio.play('mismatch')
      setMoves(nextMoves)
      setFx({ pop: [], shake: [from, cell], spawn: [] })
      emit({ type: 'score', score })
      if (nextMoves >= spec.moves) finish(score, 'lost')
      return
    }
    let finalState = result.state
    if (!hasValidSwap(finalState.colors, finalState.locks)) {
      finalState = shuffleBoard(finalState, rngRef.current)
      setRearranged((value) => value + 1)
    }
    const nextScore = Math.min(SCORE_CAP, score + result.gained)
    const nextCollected = collected.map((count, color) => count + result.perColor[color])
    const check = goalSummary(spec, finalState, nextScore, nextCollected)
    audio.play(result.waves > 1 ? 'match' : 'step')
    setWaves(result.waves)
    setState(finalState)
    setCollected(nextCollected)
    setMoves(nextMoves)
    setFx({ pop: result.clearedCells, shake: [], spawn: [from, cell, ...result.changed] })
    if (check.done) {
      const finalScore = Math.min(SCORE_CAP, nextScore + (spec.moves - nextMoves) * BONUS_PER_SPARE_MOVE)
      setScore(finalScore)
      emit({ type: 'score', score: finalScore })
      finish(finalScore, 'won')
      return
    }
    setScore(nextScore)
    emit({ type: 'score', score: nextScore })
    if (nextMoves >= spec.moves) finish(nextScore, 'lost')
  }

  return (
    <div className={`tide-game chapter-${spec.chapter} ${phase !== 'play' ? 'is-ended' : ''}`} aria-label="宝石连波游戏区">
      <div className="tide-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 第{spec.chapter}章</span>
        <strong>{moves}/{spec.moves} 步 · {score} 分</strong>
      </div>
      <div className="tide-rule">
        <span>{modeIcon(spec.mode)}{spec.title}</span>
        <small>{spec.detail}</small>
        <em>{summary.label}</em>
        {waves > 1 && <em className="tide-chain">连波 ×{waves}</em>}
        {rearranged > 0 && <em className="tide-reshuffle">重排 ×{rearranged}</em>}
      </div>
      <div className="tide-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(summary.progress * 100)}>
        <span style={{ width: `${Math.round(summary.progress * 100)}%` }} />
      </div>
      {spec.targets && (
        <div className="tide-chips">
          {spec.targets.map((target) => (
            <span key={target.color} className="tide-chip">
              <i className={`gem gem-${target.color}`} />{Math.max(0, target.count - (collected[target.color] ?? 0))}
            </span>
          ))}
        </div>
      )}
      <div className="tide-board">
        {state.colors.map((color, index) => {
          const jelly = state.jelly[index]
          const classes = ['tide-cell']
          if (selected === index) classes.push('is-selected')
          if (fx.pop.includes(index)) classes.push('is-pop')
          if (fx.shake.includes(index)) classes.push('is-shake')
          return (
            <button key={index} className={classes.join(' ')} onClick={() => attemptSwap(index)} disabled={phase !== 'play'} aria-label={`第${Math.floor(index / 7) + 1}行 第${(index % 7) + 1}列宝石`}>
              <span className={`gem gem-${color} ${fx.spawn.includes(index) ? 'is-spawn' : ''}`} />
              {jelly > 0 && <span className={`tide-jelly ${jelly === 1 ? 'is-thin' : ''}`} />}
              {state.locks[index] && <span className="tide-lock"><LockKeyhole size={12} /></span>}
            </button>
          )
        })}
        {phase !== 'play' && (
          <div className={`tide-banner ${phase === 'won' ? 'is-won' : 'is-lost'}`}>
            <strong>{phase === 'won' ? '潮汐平息' : '步数耗尽'}</strong>
            <small>{phase === 'won' ? `最终 ${score} 分` : `目标 ${summary.label}`}</small>
          </div>
        )}
      </div>
      <div className="tide-actions">
        <button className="tide-restart" onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={17} />重开本关</button>
      </div>
    </div>
  )
}
