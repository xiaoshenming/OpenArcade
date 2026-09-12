import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, Move, RotateCcw } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { assessProgress, scoreFor, slideTile, tileIndexForArrow, tilesEqual } from './logic'
import { DRIFT_LEVEL_COUNT, createDriftLevel, type DriftLevel } from './levels'
import { getDriftRule, type DriftRule } from './rules'
import './number-drift.css'

interface RoundProps {
  puzzle: DriftLevel
  rule: DriftRule
  paused: boolean
  muted: boolean
  emit: GameModuleProps['emit']
}

function NumberDriftRound({ puzzle, rule, paused, muted, emit }: RoundProps) {
  const audio = useMemo(() => createGameAudio(), [])
  const [tiles, setTiles] = useState<number[]>(() => [...puzzle.board])
  const [moves, setMoves] = useState(0)
  const [fogViews, setFogViews] = useState(0)
  const [failed, setFailed] = useState(false)
  const [revealed, setRevealed] = useState(true)
  const [previewDone, setPreviewDone] = useState(false)
  const [peekEpoch, setPeekEpoch] = useState(0)
  const completed = useMemo(() => tilesEqual(tiles, puzzle.target), [tiles, puzzle.target])
  const goalShown = !rule.fog || completed || revealed
  const goalVisible = goalShown && !paused

  useEffect(() => audio.setMuted(muted), [audio, muted])

  useEffect(() => {
    if (!rule.fog || previewDone || !revealed || paused) return
    const timer = window.setTimeout(() => {
      setPreviewDone(true)
      setRevealed(false)
    }, rule.previewMs)
    return () => window.clearTimeout(timer)
  }, [paused, previewDone, revealed, rule.fog, rule.previewMs])

  useEffect(() => {
    if (!rule.fog || peekEpoch === 0 || paused || completed) return
    const timer = window.setTimeout(() => setRevealed(false), rule.peekMs)
    return () => window.clearTimeout(timer)
  }, [completed, paused, peekEpoch, rule.fog, rule.peekMs])

  const slide = useCallback((index: number) => {
    if (paused || failed || completed) return
    const next = slideTile(tiles, puzzle.columns, index)
    if (!next) {
      audio.play('mismatch')
      return
    }
    const nextMoves = moves + 1
    const cost = scoreFor(nextMoves, puzzle.par, fogViews)
    setTiles(next)
    setMoves(nextMoves)
    audio.play('step')
    emit({ type: 'score', score: cost })
    if (assessProgress(next, puzzle.target, nextMoves, rule.moveLimit).failed) {
      setFailed(true)
      audio.play('lose')
      emit({ type: 'failed', score: cost })
    }
  }, [audio, completed, emit, failed, fogViews, moves, paused, puzzle.columns, puzzle.par, puzzle.target, rule.moveLimit, tiles])

  useEffect(() => {
    if (paused) return
    const onKeyDown = (event: KeyboardEvent) => {
      const index = tileIndexForArrow(tiles, puzzle.columns, event.key)
      if (index < 0) return
      event.preventDefault()
      slide(index)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [paused, puzzle.columns, slide, tiles])

  useEffect(() => {
    if (completed && moves > 0) {
      audio.play('win')
      emit({ type: 'completed', score: scoreFor(moves, puzzle.par, fogViews) })
    }
  }, [audio, completed, emit, fogViews, moves, puzzle.par])

  const peek = () => {
    if (paused || failed || completed || goalShown || !rule.fog) return
    const nextViews = fogViews + 1
    setFogViews(nextViews)
    setRevealed(true)
    setPeekEpoch((value) => value + 1)
    audio.play('select')
    emit({ type: 'score', score: scoreFor(moves, puzzle.par, nextViews) })
  }

  return (
    <div className={`drift-game mode-${rule.mode}`} aria-label="数字华容游戏区">
      <div className="drift-readout">
        <span>参考 {puzzle.par} 步 · 目标 {rule.fog ? '迷雾排布' : '顺序复位'}</span>
        <strong>{moves}{rule.moveLimit !== undefined ? ` / ${rule.moveLimit}` : ''} 步</strong>
      </div>
      <div className="drift-rule">
        <span>{rule.fog ? <EyeOff size={14} /> : <Move size={14} />}{rule.title}</span>
        <small>{rule.detail}</small>
        {rule.moveLimit !== undefined && <em>预算 {rule.moveLimit}</em>}
      </div>
      <div className="drift-stage">
        <div
          className={`drift-goal ${goalVisible ? '' : 'is-fogged'}`}
          style={{ gridTemplateColumns: `repeat(${puzzle.columns}, 24px)` } as CSSProperties}
          aria-hidden={!goalVisible}
        >
          {puzzle.target.map((value, index) => <span key={index}>{value === 0 ? '·' : value}</span>)}
        </div>
        <div className="drift-board" style={{ '--cell': `${100 / puzzle.columns}%` } as CSSProperties}>
          {tiles.map((value, index) => value === 0 ? null : (
            <button
              key={value}
              className="drift-tile"
              style={{ '--tx': index % puzzle.columns, '--ty': Math.floor(index / puzzle.columns) } as CSSProperties}
              onClick={() => slide(index)}
              disabled={failed || completed}
              aria-label={`数字块 ${value}`}
            >
              {value}
            </button>
          ))}
        </div>
        {(completed || failed) && (
          <div className={`drift-outcome ${failed ? 'is-failed' : ''}`}>{failed ? '预算耗尽，挑战失败' : '复位成功！'}</div>
        )}
        <div className="drift-actions">
          {rule.fog && (
            <button className="drift-action" onClick={peek} disabled={goalShown || paused || failed || completed}>
              {goalShown ? <Eye size={16} /> : <EyeOff size={16} />}重看目标 −{rule.peekPenalty}{fogViews > 0 ? ` ×${fogViews}` : ''}
            </button>
          )}
          <button className="drift-action" onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={16} />重开本关</button>
        </div>
      </div>
    </div>
  )
}

export default function NumberDriftGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(DRIFT_LEVEL_COUNT, Math.max(1, level))
  const puzzle = useMemo(() => createDriftLevel(levelNumber), [levelNumber])
  const rule = useMemo(() => getDriftRule(puzzle), [puzzle])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  return <NumberDriftRound key={levelNumber} puzzle={puzzle} rule={rule} paused={paused} muted={muted} emit={emit} />
}
