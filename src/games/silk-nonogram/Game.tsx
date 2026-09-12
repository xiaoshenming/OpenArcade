import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Eraser, Lightbulb, PenLine, RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { mulberry32, seedFor } from '../../platform/rng'
import { CROSSED, EMPTY, ERROR, FILLED, formatClock, lineDone, puzzleComplete, scoreFor, weaveLockedRows, type CellMark, type SilkPuzzle } from './logic'
import { createSilkPuzzle, getSilkLevel, lockedRowsFor, SILK_LEVEL_COUNT, type SilkLevelSpec } from './levels'
import './silk-nonogram.css'

interface WeaveProps {
  paused: boolean
  audio: GameAudio
  emit: (event: GameEvent) => void
  levelNumber: number
  spec: SilkLevelSpec
  puzzle: SilkPuzzle
  lockedRows: number[]
}

const NUDGE_MS = 1800

function SilkWeave({ paused, audio, emit, levelNumber, spec, puzzle, lockedRows }: WeaveProps) {
  const lockedSet = useMemo(() => new Set(lockedRows), [lockedRows])
  const [marks, setMarks] = useState<CellMark[]>(() => weaveLockedRows(puzzle.pattern, puzzle.size, lockedRows))
  const [mode, setMode] = useState<'fill' | 'cross'>('fill')
  const [mistakes, setMistakes] = useState(0)
  const [hintsLeft, setHintsLeft] = useState(spec.hints)
  const [elapsed, setElapsed] = useState(0)
  const [done, setDone] = useState<'' | 'win' | 'lose'>('')
  const [nudge, setNudge] = useState('')
  const mistakesRef = useRef(0)
  const doneRef = useRef<'' | 'win' | 'lose'>('')
  const elapsedRef = useRef(0)
  const completedRef = useRef(0)
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

  const finish = useCallback((kind: 'win' | 'lose') => {
    if (doneRef.current) return
    doneRef.current = kind
    setDone(kind)
    audio.play(kind === 'win' ? 'win' : 'lose')
    emit({ type: kind === 'win' ? 'completed' : 'failed', score: scoreFor(mistakesRef.current, elapsedRef.current, spec.par) })
  }, [audio, emit, spec.par])

  const complete = useMemo(() => puzzleComplete(puzzle.pattern, marks), [marks, puzzle])
  useEffect(() => {
    if (complete) finish('win')
  }, [complete, finish])

  useEffect(() => {
    if (spec.maxMistakes !== undefined && mistakes > spec.maxMistakes) finish('lose')
  }, [finish, mistakes, spec.maxMistakes])

  useEffect(() => {
    if (spec.timeLimit !== undefined && elapsed >= spec.timeLimit) finish('lose')
  }, [elapsed, finish, spec.timeLimit])

  const lineState = useMemo(() => {
    const size = puzzle.size
    const rows = Array.from({ length: size }, (_, row) => lineDone(puzzle.pattern.slice(row * size, row * size + size), marks.slice(row * size, row * size + size)))
    const cols = Array.from({ length: size }, (_, col) => lineDone(
      Array.from({ length: size }, (_, row) => puzzle.pattern[row * size + col]),
      Array.from({ length: size }, (_, row) => marks[row * size + col]),
    ))
    return { rows, cols }
  }, [marks, puzzle])
  const completedCount = lineState.rows.filter(Boolean).length + lineState.cols.filter(Boolean).length
  useEffect(() => {
    if (completedCount > completedRef.current && !paused && !doneRef.current) audio.play('match')
    completedRef.current = completedCount
  }, [audio, completedCount, paused])

  const showNudge = (text: string) => {
    setNudge(text)
    if (nudgeTimer.current !== null) window.clearTimeout(nudgeTimer.current)
    nudgeTimer.current = window.setTimeout(() => setNudge(''), NUDGE_MS)
  }

  const mark = (index: number) => {
    if (paused || doneRef.current || lockedSet.has(index)) return
    const current = marks[index]
    const next = [...marks]
    if (mode === 'fill') {
      if (current === FILLED) { next[index] = EMPTY; setMarks(next); audio.play('select'); return }
      if (current === CROSSED) return
      if (current === ERROR) {
        audio.play('select')
        showNudge('失误格不重复计错，切到打叉模式即可清除')
        return
      }
      if (puzzle.pattern[index] === FILLED) {
        next[index] = FILLED
        setMarks(next)
        audio.play('step')
        emit({ type: 'score', score: scoreFor(mistakesRef.current, elapsedRef.current, spec.par) })
        return
      }
      next[index] = ERROR
      setMarks(next)
      audio.play('mismatch')
      mistakesRef.current += 1
      setMistakes(mistakesRef.current)
      return
    }
    if (current === FILLED) return
    next[index] = current === CROSSED || current === ERROR ? EMPTY : CROSSED
    setMarks(next)
    audio.play('select')
  }

  const hint = () => {
    if (paused || doneRef.current || hintsLeft <= 0) return
    const rng = mulberry32(seedFor(levelNumber, 77 + (spec.hints - hintsLeft)))
    const unknown: number[] = []
    const wrong: number[] = []
    marks.forEach((value, index) => {
      if (value === EMPTY) unknown.push(index)
      else if (value === ERROR) wrong.push(index)
    })
    const pool = unknown.length ? unknown : wrong
    if (!pool.length) return
    const index = pool[Math.floor(rng() * pool.length) % pool.length]
    const next = [...marks]
    next[index] = puzzle.pattern[index] === FILLED ? FILLED : CROSSED
    setMarks(next)
    setHintsLeft((value) => value - 1)
    audio.play('select')
  }

  const toggleMode = () => {
    if (paused || doneRef.current) return
    setMode((value) => (value === 'fill' ? 'cross' : 'fill'))
    audio.play('select')
  }

  const restart = () => {
    mistakesRef.current = 0
    doneRef.current = ''
    elapsedRef.current = 0
    completedRef.current = 0
    setMarks(weaveLockedRows(puzzle.pattern, puzzle.size, lockedRows))
    setMistakes(0)
    setElapsed(0)
    setHintsLeft(spec.hints)
    setDone('')
    setNudge('')
    audio.play('select')
  }

  const cellClass = (value: CellMark) => (value === FILLED ? ' is-filled' : value === CROSSED ? ' is-crossed' : value === ERROR ? ' is-error' : '')
  const progress = marks.filter((value) => value === FILLED).length
  const target = puzzle.pattern.filter((cell) => cell === FILLED).length
  const overtime = elapsed > spec.par

  return (
    <div className={`silk-game mode-${spec.mode}${done === 'win' ? ' is-solved' : ''}${done === 'lose' ? ' is-failed' : ''}`} aria-label="织锦谜图游戏区">
      <div className="silk-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 第{spec.chapter}章 {spec.title}</span>
        <strong>{progress} / {target} 格</strong>
      </div>
      <div className="silk-rule">
        <span>{spec.detail}</span>
        {spec.maxMistakes !== undefined && <em className={mistakes >= spec.maxMistakes ? 'is-tight' : ''}>失误 {mistakes}/{spec.maxMistakes}</em>}
        <em className={spec.timeLimit && overtime ? 'is-tight' : overtime ? 'is-warn' : ''}>{spec.timeLimit ? `限时 ${formatClock(Math.max(0, spec.timeLimit - elapsed))}` : `${formatClock(elapsed)} / ${formatClock(spec.par)}`}</em>
      </div>
      <div className="silk-board" style={{ '--silk-size': spec.size } as CSSProperties}>
        <div className="silk-corner" />
        <div className="silk-col-clues">
          {puzzle.colClues.map((clue, col) => (
            <div key={col} className={`silk-clue${lineState.cols[col] ? ' is-done' : ''}`} aria-label={`第 ${col + 1} 列提示 ${clue.join(' ') || 0}`}>
              {(clue.length ? clue : [0]).map((run, at) => <b key={at}>{run}</b>)}
            </div>
          ))}
        </div>
        <div className="silk-row-clues">
          {puzzle.rowClues.map((clue, row) => (
            <div key={row} className={`silk-clue${lineState.rows[row] ? ' is-done' : ''}`} aria-label={`第 ${row + 1} 行提示 ${clue.join(' ') || 0}${lockedSet.has(row) ? '（金梭锁定）' : ''}`}>
              {(clue.length ? clue : [0]).map((run, at) => <b key={at}>{run}</b>)}
            </div>
          ))}
        </div>
        <div className="silk-grid">
          {marks.map((value, index) => {
            const locked = lockedSet.has(Math.floor(index / spec.size))
            return (
              <button
                key={index}
                type="button"
                className={`silk-cell${cellClass(value)}${locked ? ' is-locked' : ''}`}
                onClick={() => mark(index)}
                disabled={!!done || paused || locked}
                aria-label={`第 ${Math.floor(index / spec.size) + 1} 行第 ${index % spec.size + 1} 列：${locked ? '金梭锁定' : value === FILLED ? '已填' : value === CROSSED ? '已打叉' : value === ERROR ? '失误格' : '未定'}`}
              />
            )
          })}
        </div>
      </div>
      {spec.size >= 10 && <p className="silk-scroll-hint">棋盘较宽，可左右滑动查看；格子保持 34px 便于点按</p>}
      <div className="silk-actions">
        <button type="button" className="silk-action" onClick={toggleMode}>{mode === 'fill' ? <PenLine size={15} /> : <Eraser size={15} />}{mode === 'fill' ? '填格' : '打叉'}</button>
        {spec.hints > 0 && <button type="button" className="silk-action silk-hint" onClick={hint} disabled={!hintsLeft || !!done || paused}><Lightbulb size={15} />金梭 ×{hintsLeft}</button>}
        <button type="button" className="silk-action" onClick={restart} disabled={!!done || paused}><RotateCcw size={15} />重开本关</button>
      </div>
      {nudge && <div className="silk-nudge">{nudge}</div>}
      {done === 'win' && <div className="silk-flash">锦缎织成 · 得分 {scoreFor(mistakes, elapsed, spec.par)}</div>}
      {done === 'lose' && <div className="silk-flash is-bad">{mistakes > (spec.maxMistakes ?? 0) ? '失误超限，经线崩断' : '超时拆线，锦缎未成'}</div>}
    </div>
  )
}

export default function SilkNonogramGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(SILK_LEVEL_COUNT, Math.max(1, Math.floor(level)))
  const spec = getSilkLevel(levelNumber)
  const puzzle = useMemo(() => createSilkPuzzle(levelNumber), [levelNumber])
  const lockedRows = useMemo(() => lockedRowsFor(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])

  return <SilkWeave key={levelNumber} paused={paused} audio={audio} emit={emit} levelNumber={levelNumber} spec={spec} puzzle={puzzle} lockedRows={lockedRows} />
}
