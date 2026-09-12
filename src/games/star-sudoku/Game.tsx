import { useEffect, useMemo, useState } from 'react'
import { Eraser, Pencil, RotateCcw } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { boxOf, clearPeerNotes, computeScore, isPuzzleSolved, toggleNote } from './logic'
import { createSudokuPuzzle, getSudokuLevel, LEVEL_COUNT } from './levels'
import './star-sudoku.css'

interface Session {
  level: number
  entries: number[]
  notes: number[]
  selected: number | null
  errors: number
  elapsed: number
  failed: boolean
}

const blank = (cells: number) => new Array<number>(cells).fill(0)
const blankNotes = (notes: number[], index: number) => {
  const next = [...notes]
  next[index] = 0
  return next
}
const freshSession = (level: number, cells: number): Session => ({ level, entries: blank(cells), notes: blank(cells), selected: null, errors: 0, elapsed: 0, failed: false })

export default function StarSudokuGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const rule = getSudokuLevel(levelNumber)
  const { size, boxRows, boxCols } = rule.spec
  const cells = size * size
  const puzzle = useMemo(() => createSudokuPuzzle(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [session, setSession] = useState<Session>(() => freshSession(levelNumber, cells))
  const [noteMode, setNoteMode] = useState(false)
  const view = session.level === levelNumber ? session : freshSession(levelNumber, cells)
  const score = computeScore(view.errors, view.elapsed, rule.par, rule.strictTime)
  const complete = !view.failed && isPuzzleSolved(puzzle.givens, view.entries, puzzle.solution)

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])
  useEffect(() => {
    if (paused || view.failed || complete) return
    const timer = window.setInterval(() => {
      setSession((current) => (current.level === levelNumber ? { ...current, elapsed: current.elapsed + 1 } : current))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [complete, levelNumber, paused, view.failed])
  useEffect(() => {
    if (view.elapsed <= rule.par || view.failed || complete) return
    emit({ type: 'score', score })
  }, [complete, emit, rule.par, score, view.elapsed, view.failed])

  const selectCell = (index: number) => {
    if (paused || view.failed || complete) return
    audio.play('select')
    setSession((current) => (current.level === levelNumber ? { ...current, selected: current.selected === index ? null : index } : current))
  }

  const inputDigit = (digit: number) => {
    if (paused || view.failed || complete) return
    const index = view.selected
    if (index === null || puzzle.givens[index] || view.entries[index] === digit) return
    if (digit > 0 && noteMode && rule.notes && !view.entries[index]) {
      audio.play('select')
      setSession((current) => (current.level === levelNumber ? { ...current, notes: toggleNote(current.notes, index, digit) } : current))
      return
    }
    const nextEntries = [...view.entries]
    nextEntries[index] = digit
    if (digit === 0) {
      audio.play('step')
      setSession((current) => (current.level === levelNumber ? { ...current, entries: nextEntries, notes: blankNotes(current.notes, index) } : current))
      return
    }
    const correct = digit === puzzle.solution[index]
    const nextErrors = correct ? view.errors : view.errors + 1
    const nextNotes = correct ? clearPeerNotes(view.notes, index, digit, rule.spec) : view.notes
    const solved = isPuzzleSolved(puzzle.givens, nextEntries, puzzle.solution)
    audio.play(solved ? 'win' : correct ? 'step' : 'mismatch')
    setSession((current) => (current.level === levelNumber ? { ...current, entries: nextEntries, notes: nextNotes, errors: nextErrors } : current))
    emit({ type: 'score', score: computeScore(nextErrors, view.elapsed, rule.par, rule.strictTime) })
    if (solved) {
      emit({ type: 'completed', score: computeScore(nextErrors, view.elapsed, rule.par, rule.strictTime) })
      return
    }
    if (rule.errorLimit && nextErrors >= rule.errorLimit) {
      audio.play('lose')
      setSession((current) => (current.level === levelNumber ? { ...current, failed: true } : current))
      emit({ type: 'failed', score: computeScore(nextErrors, view.elapsed, rule.par, rule.strictTime) })
    }
  }

  const restart = () => {
    audio.play('select')
    setSession(freshSession(levelNumber, cells))
  }

  const selRow = view.selected !== null ? Math.floor(view.selected / size) : -1
  const selCol = view.selected !== null ? view.selected % size : -1
  const selBox = view.selected !== null ? boxOf(view.selected, rule.spec) : -1
  const selValue = view.selected !== null ? puzzle.givens[view.selected] || view.entries[view.selected] : 0
  const locked = paused || view.failed || complete

  return (
    <div className={`sudoku-game chapter-${rule.chapter}`} aria-label="星阵数独游戏区">
      <div className="sudoku-readout">
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 第{rule.chapter}章 {rule.title}</span>
        <strong>{size}×{size} · {view.elapsed}s / par {rule.par}s · {score} 分</strong>
      </div>
      <div className="sudoku-rule">
        <span>{rule.title}</span>
        <small>{rule.detail}</small>
        {rule.errorLimit && <em>失误 {view.errors}/{rule.errorLimit}</em>}
      </div>
      <div className="sudoku-board" style={{ '--cells': size } as React.CSSProperties}>
        {puzzle.givens.map((given, index) => {
          const row = Math.floor(index / size)
          const col = index % size
          const value = given || view.entries[index]
          const wrong = !given && value > 0 && value !== puzzle.solution[index]
          const inZone = view.selected !== null && (row === selRow || col === selCol || boxOf(index, rule.spec) === selBox)
          const same = rule.highlightAll && selValue > 0 && value === selValue && index !== view.selected
          const classes = [
            'sudoku-cell',
            given ? 'is-given' : value ? 'is-entry' : '',
            wrong ? 'is-wrong' : '',
            inZone ? 'is-zone' : '',
            same ? 'is-same' : '',
            view.selected === index ? 'is-selected' : '',
          ].filter(Boolean).join(' ')
          return (
            <button
              key={index}
              className={classes}
              data-br={(col + 1) % boxCols === 0 && col + 1 < size ? '1' : '0'}
              data-bb={(row + 1) % boxRows === 0 && row + 1 < size ? '1' : '0'}
              onClick={() => selectCell(index)}
              aria-label={`第${row + 1}行第${col + 1}列${value ? `：${value}` : '，空'}`}
            >
              {value ? <span>{value}</span> : view.notes[index] > 0 ? (
                <span className={`sudoku-notes cols-${size < 6 ? 2 : 3}`}>
                  {Array.from({ length: size }, (_, step) => step + 1).map((digit) => (
                    <i key={digit} className={view.notes[index] & (1 << (digit - 1)) ? 'on' : ''}>{digit}</i>
                  ))}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
      <div className="sudoku-pad">
        <div className="sudoku-digits" style={{ '--digits': size } as React.CSSProperties}>
          {Array.from({ length: size }, (_, step) => step + 1).map((digit) => (
            <button key={digit} className="sudoku-key" disabled={locked} onClick={() => inputDigit(digit)}>{digit}</button>
          ))}
        </div>
        <div className="sudoku-actions">
          {rule.notes && (
            <button className={`sudoku-key ${noteMode ? 'is-active' : ''}`} disabled={locked} onClick={() => setNoteMode((mode) => !mode)}>
              <Pencil size={15} />笔记
            </button>
          )}
          <button className="sudoku-key" disabled={locked} onClick={() => inputDigit(0)}>
            <Eraser size={15} />擦除
          </button>
          <button className="sudoku-key" onClick={restart}>
            <RotateCcw size={15} />重开
          </button>
        </div>
      </div>
      {view.failed && <div className="sudoku-banner is-failed">失误过多，星阵崩塌</div>}
      {complete && <div className="sudoku-banner is-complete">星阵完成！{score} 分</div>}
    </div>
  )
}
