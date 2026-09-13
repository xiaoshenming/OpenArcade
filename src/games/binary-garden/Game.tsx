import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { conflictCells, formatClock, lineComplete, lineValues, nextValue, scoreFor, UNKNOWN, type GardenPuzzle } from './logic'
import { createGardenPuzzle, getGardenLevel, GARDEN_LEVEL_COUNT, type GardenLevelSpec } from './levels'
import './binary-garden.css'

interface BedProps {
  paused: boolean
  audio: GameAudio
  emit: (event: GameEvent) => void
  spec: GardenLevelSpec
  puzzle: GardenPuzzle
}

const NUDGE_MS = 1800

function GardenBed({ paused, audio, emit, spec, puzzle }: BedProps) {
  const size = puzzle.size
  const [values, setValues] = useState<number[]>(() => [...puzzle.givens])
  const [mistakes, setMistakes] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [done, setDone] = useState<'' | 'win' | 'lose'>('')
  const [nudge, setNudge] = useState('')
  const mistakesRef = useRef(0)
  const doneRef = useRef<'' | 'win' | 'lose'>('')
  const elapsedRef = useRef(0)
  const doneLinesRef = useRef(0)
  const nudgeTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (nudgeTimer.current !== null) window.clearTimeout(nudgeTimer.current)
  }, [])

  useEffect(() => {
    if (paused || done) return
    const timer = window.setInterval(() => {
      elapsedRef.current += 1
      setElapsed(elapsedRef.current)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [paused, done])

  const conflicts = useMemo(() => conflictCells(values, size), [size, values])
  const conflictSet = useMemo(() => new Set(conflicts), [conflicts])
  const full = values.every((value) => value !== UNKNOWN)
  const valid = full && conflicts.length === 0

  const showNudge = useCallback((text: string) => {
    setNudge(text)
    if (nudgeTimer.current !== null) window.clearTimeout(nudgeTimer.current)
    nudgeTimer.current = window.setTimeout(() => setNudge(''), NUDGE_MS)
  }, [])

  const finish = useCallback((kind: 'win' | 'lose') => {
    if (doneRef.current) return
    doneRef.current = kind
    setDone(kind)
    audio.play(kind === 'win' ? 'win' : 'lose')
    emit({ type: kind === 'win' ? 'completed' : 'failed', score: scoreFor(mistakesRef.current, elapsedRef.current, spec.par) })
  }, [audio, emit, spec.par])

  useEffect(() => {
    if (valid) finish('win')
  }, [finish, valid])

  useEffect(() => {
    if (spec.maxMistakes !== undefined && mistakes > spec.maxMistakes) finish('lose')
  }, [finish, mistakes, spec.maxMistakes])

  useEffect(() => {
    if (!full || valid || doneRef.current || paused) return
    showNudge(spec.fog ? '迷雾深处，花园仍不接受这份排列' : '花园仍有冲突，红色格需要修剪')
  }, [full, paused, showNudge, spec.fog, valid])

  const lines = useMemo(() => {
    const build = (kind: 'row' | 'col') => Array.from({ length: size }, (_, at) => {
      const line = lineValues(values, size, kind, at)
      return {
        zeroLeft: size / 2 - line.filter((value) => value === 0).length,
        oneLeft: size / 2 - line.filter((value) => value === 1).length,
        complete: lineComplete(values, size, kind, at),
      }
    })
    return { rows: build('row'), cols: build('col') }
  }, [size, values])
  const doneLines = lines.rows.filter((head) => head.complete).length + lines.cols.filter((head) => head.complete).length
  useEffect(() => {
    if (doneLines > doneLinesRef.current && !paused && !doneRef.current) audio.play('match')
    doneLinesRef.current = doneLines
  }, [audio, doneLines, paused])

  const plant = (index: number) => {
    if (paused || doneRef.current || puzzle.givens[index] !== UNKNOWN) return
    const value = nextValue(values[index])
    const next = [...values]
    next[index] = value
    setValues(next)
    if (value === UNKNOWN) {
      audio.play('select')
      return
    }
    const hurt = conflictCells(next, size).includes(index)
    audio.play(hurt ? 'mismatch' : 'step')
    if (hurt) {
      mistakesRef.current += 1
      setMistakes(mistakesRef.current)
    }
    emit({ type: 'score', score: scoreFor(mistakesRef.current, elapsedRef.current, spec.par) })
  }

  const restart = useCallback(() => {
    mistakesRef.current = 0
    doneRef.current = ''
    elapsedRef.current = 0
    doneLinesRef.current = 0
    setValues([...puzzle.givens])
    setMistakes(0)
    setElapsed(0)
    setDone('')
    setNudge('')
    audio.play('select')
  }, [audio, puzzle])

  const planted = puzzle.holes - values.filter((value) => value === UNKNOWN).length
  const overtime = elapsed > spec.par
  const showConflict = !spec.fog
  const hintSet = useMemo(() => {
    const cells = new Set<number>()
    if (!puzzle.hint) return cells
    for (let step = 0; step < size; step += 1) {
      cells.add(puzzle.hint.kind === 'row' ? puzzle.hint.at * size + step : step * size + puzzle.hint.at)
    }
    return cells
  }, [puzzle, size])

  return (
    <div className={`garden-game mode-${spec.mode}${done === 'win' ? ' is-solved' : ''}${done === 'lose' ? ' is-failed' : ''}`} aria-label="二进制花园游戏区">
      <div className="garden-readout">
        <span>关卡 {String(spec.level).padStart(2, '0')} · 第{spec.chapter}章 {spec.title}</span>
        <strong>{size}×{size} · 已种 {planted}/{puzzle.holes} 格</strong>
      </div>
      <div className="garden-rule">
        <span>{spec.title}</span>
        <small>{spec.detail}</small>
        {spec.maxMistakes !== undefined && <em className={mistakes >= spec.maxMistakes ? 'is-tight' : ''}>失误 {mistakes}/{spec.maxMistakes}</em>}
        {spec.hintLine && <em className="is-hint">提示线</em>}
        {spec.fog && <em className="is-fog">迷雾</em>}
        <em className={overtime ? 'is-warn' : ''}>{formatClock(elapsed)} / {formatClock(spec.par)}</em>
      </div>
      <div className="garden-board" style={{ '--garden-size': size } as CSSProperties}>
        <div className="garden-corner" />
        <div className="garden-col-heads">
          {lines.cols.map((head, col) => (
            <div key={col} className={`garden-head${head.complete ? ' is-done' : ''}`} aria-label={`第 ${col + 1} 列 剩 0×${head.zeroLeft} 1×${head.oneLeft}`}>
              <i>0{head.zeroLeft}</i>
              <i>1{head.oneLeft}</i>
            </div>
          ))}
        </div>
        <div className="garden-row-heads">
          {lines.rows.map((head, row) => (
            <div key={row} className={`garden-head${head.complete ? ' is-done' : ''}`} aria-label={`第 ${row + 1} 行 剩 0×${head.zeroLeft} 1×${head.oneLeft}`}>
              <i>0{head.zeroLeft}</i>
              <i>1{head.oneLeft}</i>
            </div>
          ))}
        </div>
        <div className="garden-grid">
          {values.map((value, index) => {
            const given = puzzle.givens[index] !== UNKNOWN
            const hint = hintSet.has(index)
            return (
              <button
                key={index}
                type="button"
                className={`garden-cell${given ? hint ? ' is-given is-hint' : ' is-given' : value === UNKNOWN ? '' : value === 0 ? ' is-zero' : ' is-one'}${showConflict && conflictSet.has(index) ? ' is-conflict' : ''}`}
                data-br={index % size === size - 1 ? '0' : '1'}
                data-bb={Math.floor(index / size) === size - 1 ? '0' : '1'}
                onClick={() => plant(index)}
                disabled={!!done || paused || given}
                aria-label={`第 ${Math.floor(index / size) + 1} 行第 ${(index % size) + 1} 列：${value === UNKNOWN ? '空' : value === 0 ? '0' : '1'}${given ? (hint ? '（提示线）' : '（原生花木）') : ''}`}
              >
                {value === UNKNOWN ? null : <span>{value}</span>}
              </button>
            )
          })}
        </div>
      </div>
      <div className="garden-actions">
        <button type="button" className="garden-action" onClick={restart} disabled={!!done || paused}><RotateCcw size={15} />重开本关</button>
      </div>
      {nudge && <div className="garden-nudge">{nudge}</div>}
      {done === 'win' && <div className="garden-flash">花园盛开 · 得分 {scoreFor(mistakes, elapsed, spec.par)}</div>}
      {done === 'lose' && <div className="garden-flash is-bad">失误超限，花园枯萎</div>}
    </div>
  )
}

export default function BinaryGardenGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(GARDEN_LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const spec = getGardenLevel(levelNumber)
  const puzzle = useMemo(() => createGardenPuzzle(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])

  return <GardenBed key={levelNumber} paused={paused} audio={audio} emit={emit} spec={spec} puzzle={puzzle} />
}
