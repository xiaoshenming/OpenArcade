import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { LockKeyhole, RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { prefersReducedMotion, tween } from '../../platform/motion'
import { crossOf, failedScore, isBudgetSpent, isDark, litCount, scoreFor, toggleAt, type Grid } from './logic'
import { createLanternPuzzle, LANTERN_LEVEL_COUNT, type LanternPuzzle } from './levels'
import './lantern-grid.css'

function LanternSession({ puzzle, paused, muted, emit }: { puzzle: LanternPuzzle; paused: boolean; muted: boolean; emit: (event: GameEvent) => void }) {
  const spec = puzzle.spec
  const [lights, setLights] = useState<Grid>(puzzle.lights)
  const [moves, setMoves] = useState(0)
  const [failed, setFailed] = useState(false)
  const [solved, setSolved] = useState(false)
  const audio = useMemo(() => createGameAudio(), [])
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => { audio.setMuted(muted) }, [audio, muted])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  const settled = failed || solved

  const press = (index: number) => {
    if (paused || settled) return
    if (puzzle.locks.includes(index)) {
      audio.play('mismatch')
      return
    }
    const next = toggleAt(lights, index, spec.cols)
    const nextMoves = moves + 1
    setLights(next)
    setMoves(nextMoves)
    audio.play('select')
    if (!prefersReducedMotion()) {
      for (const cell of crossOf(index, spec.cols, spec.rows)) {
        const element = cellRefs.current[cell]
        if (element) void tween(element, [{ transform: 'scale(1)' }, { transform: 'scale(.88)' }, { transform: 'scale(1)' }], { duration: 240, easing: 'spring' })
      }
    }
    emit({ type: 'score', score: scoreFor(nextMoves, puzzle.par) })
    if (isDark(next)) {
      setSolved(true)
      audio.play('win')
      emit({ type: 'completed', score: scoreFor(nextMoves, puzzle.par) })
      return
    }
    if (isBudgetSpent(nextMoves, spec.budget)) {
      setFailed(true)
      audio.play('lose')
      emit({ type: 'failed', score: failedScore(nextMoves, puzzle.par) })
    }
  }

  return (
    <div className={`lantern-game mode-${spec.mode}`} aria-label="灯阵迷城游戏区">
      <div className="lantern-readout">
        <span>关卡 {String(spec.level).padStart(2, '0')} · 第{spec.chapter}章</span>
        <strong>{moves}{spec.budget ? ` / ${spec.budget}` : ''} 步 · 参考 {puzzle.par}</strong>
      </div>
      <div className="lantern-rule">
        <span>{spec.locks ? <LockKeyhole size={14} /> : null}{spec.title}</span>
        <small>{spec.detail}</small>
        {spec.budget !== undefined && <em>预算 {spec.budget}</em>}
        {spec.locks > 0 && <em>锁定 {spec.locks}</em>}
        <em>亮 {litCount(lights)}</em>
      </div>
      <div className="lantern-grid" style={{ '--lantern-cols': spec.cols } as CSSProperties}>
        {lights.map((lit, index) => {
          const locked = puzzle.locks.includes(index)
          const row = Math.floor(index / spec.cols) + 1
          const col = (index % spec.cols) + 1
          return (
            <button
              key={index}
              ref={(el) => { cellRefs.current[index] = el }}
              className={`lantern-cell ${lit ? 'is-lit' : ''} ${locked ? 'is-locked' : ''}`}
              style={{ '--lantern-index': index } as CSSProperties}
              onClick={() => press(index)}
              aria-pressed={lit}
              aria-disabled={locked}
              aria-label={`第${row}行第${col}列，${locked ? '锁定格' : lit ? '灯亮' : '灯灭'}`}
            >
              <span className="lantern-lamp" />
              {locked && <LockKeyhole size={13} />}
            </button>
          )
        })}
      </div>
      <div className="lantern-actions">
        <button className="lantern-restart" onClick={() => emit({ type: 'request-restart' })}>
          <RotateCcw size={17} />重开本关
        </button>
      </div>
      {(solved || failed) && (
        <div className="lantern-stamp" role="status">
          <span>{solved ? 'LANTERNS OUT' : 'BUDGET EXHAUSTED'}</span>
          <strong>{solved ? `灯阵熄灭 · ${scoreFor(moves, puzzle.par)}` : `步数耗尽 · ${failedScore(moves, puzzle.par)}`}</strong>
        </div>
      )}
    </div>
  )
}

export default function LanternGridGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(LANTERN_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const puzzle = useMemo(() => createLanternPuzzle(levelNumber), [levelNumber])
  return <LanternSession key={levelNumber} puzzle={puzzle} paused={paused} muted={muted} emit={emit} />
}
