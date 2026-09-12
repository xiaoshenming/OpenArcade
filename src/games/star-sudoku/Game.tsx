import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Eraser, Pencil, RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { boxOf, clearPeerNotes, computeScore, decrementFrozen, FROZEN_SECONDS, isPuzzleSolved, moveSelection, toggleNote, type MoveDirection } from './logic'
import { createSudokuPuzzle, getSudokuLevel, LEVEL_COUNT, type SudokuLevel, type SudokuPuzzle } from './levels'
import './star-sudoku.css'

interface Session {
  entries: number[]
  notes: number[]
  selected: number | null
  errors: number
  elapsed: number
  frozen: Record<number, number>
  failed: boolean
}

const blank = (cells: number) => new Array<number>(cells).fill(0)
const blankNotes = (notes: number[], index: number) => {
  const next = [...notes]
  next[index] = 0
  return next
}
const freshSession = (cells: number): Session => ({ entries: blank(cells), notes: blank(cells), selected: null, errors: 0, elapsed: 0, frozen: {}, failed: false })

const ARROWS: Record<string, MoveDirection> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

export default function StarSudokuGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const rule = getSudokuLevel(levelNumber)
  const puzzle = useMemo(() => createSudokuPuzzle(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])

  return <SudokuBoard key={levelNumber} paused={paused} audio={audio} emit={emit} rule={rule} puzzle={puzzle} />
}

interface BoardProps {
  paused: boolean
  audio: GameAudio
  emit: (event: GameEvent) => void
  rule: SudokuLevel
  puzzle: SudokuPuzzle
}

function SudokuBoard({ paused, audio, emit, rule, puzzle }: BoardProps) {
  const { size, boxRows, boxCols } = rule.spec
  const cells = size * size
  const [session, setSession] = useState<Session>(() => freshSession(cells))
  const [noteMode, setNoteMode] = useState(false)
  const [announce, setAnnounce] = useState('')
  const score = computeScore(session.errors, session.elapsed, rule.par, rule.strictTime)
  const complete = !session.failed && isPuzzleSolved(puzzle.givens, session.entries, puzzle.solution)
  const locked = paused || session.failed || complete

  useEffect(() => {
    if (paused || session.failed || complete) return
    const timer = window.setInterval(() => {
      setSession((current) => ({ ...current, elapsed: current.elapsed + 1, frozen: decrementFrozen(current.frozen) }))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [complete, paused, session.failed])

  useEffect(() => {
    if (session.elapsed <= rule.par || session.failed || complete) return
    emit({ type: 'score', score })
  }, [complete, emit, rule.par, score, session.elapsed, session.failed])

  const selectCell = (index: number) => {
    if (locked) return
    audio.play('select')
    setSession((current) => ({ ...current, selected: current.selected === index ? null : index }))
  }

  const inputDigit = useCallback((digit: number) => {
    if (locked) return
    const index = session.selected
    if (index === null || puzzle.givens[index] || session.entries[index] === digit || session.frozen[index]) return
    if (digit > 0 && noteMode && rule.notes && !session.entries[index]) {
      audio.play('select')
      setSession({ ...session, notes: toggleNote(session.notes, index, digit) })
      return
    }
    const nextEntries = [...session.entries]
    nextEntries[index] = digit
    if (digit === 0) {
      audio.play('step')
      setSession({ ...session, entries: nextEntries, notes: blankNotes(session.notes, index) })
      return
    }
    const correct = digit === puzzle.solution[index]
    const nextErrors = correct ? session.errors : session.errors + 1
    const nextNotes = correct ? clearPeerNotes(session.notes, index, digit, rule.spec) : session.notes
    const nextFrozen = correct || !rule.freeze ? session.frozen : { ...session.frozen, [index]: FROZEN_SECONDS }
    const solved = isPuzzleSolved(puzzle.givens, nextEntries, puzzle.solution)
    const total = computeScore(nextErrors, session.elapsed, rule.par, rule.strictTime)
    const at = `第${Math.floor(index / rule.spec.size) + 1}行第${(index % rule.spec.size) + 1}列填入 ${digit}`
    setAnnounce(solved ? `${at}，星阵完成` : correct ? `${at}，正确` : rule.freeze ? `${at}，错误，冻结 ${FROZEN_SECONDS} 秒` : `${at}，错误`)
    audio.play(solved ? 'win' : correct ? 'step' : 'mismatch')
    setSession({ ...session, entries: nextEntries, notes: nextNotes, errors: nextErrors, frozen: nextFrozen, failed: !solved && !!rule.errorLimit && nextErrors >= rule.errorLimit })
    emit({ type: 'score', score: total })
    if (solved) {
      emit({ type: 'completed', score: total })
      return
    }
    if (rule.errorLimit && nextErrors >= rule.errorLimit) {
      audio.play('lose')
      emit({ type: 'failed', score: total })
    }
  }, [audio, emit, locked, noteMode, puzzle, rule, session])

  useEffect(() => {
    if (locked) return
    const onKey = (event: KeyboardEvent) => {
      const direction = ARROWS[event.key]
      if (direction) {
        event.preventDefault()
        audio.play('select')
        setSession((current) => ({ ...current, selected: moveSelection(current.selected, direction, size) }))
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key >= '1' && event.key <= '9') {
        const digit = Number(event.key)
        if (digit <= size) inputDigit(digit)
        return
      }
      if (event.key === '0' || event.key === 'Backspace' || event.key === 'Delete') {
        inputDigit(0)
        return
      }
      if ((event.key === 'n' || event.key === 'N') && rule.notes) {
        setNoteMode((mode) => !mode)
        audio.play('select')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [audio, inputDigit, locked, rule.notes, size])

  const restart = () => {
    audio.play('select')
    setSession(freshSession(cells))
    setNoteMode(false)
  }

  const selRow = session.selected !== null ? Math.floor(session.selected / size) : -1
  const selCol = session.selected !== null ? session.selected % size : -1
  const selBox = session.selected !== null ? boxOf(session.selected, rule.spec) : -1
  const selValue = session.selected !== null ? puzzle.givens[session.selected] || session.entries[session.selected] : 0

  return (
    <div className={`sudoku-game chapter-${rule.chapter}`} aria-label="星阵数独游戏区">
      <div className="sudoku-readout">
        <span>关卡 {String(rule.level).padStart(2, '0')} · 第{rule.chapter}章 {rule.title}</span>
        <strong>{size}×{size} · {session.elapsed}s / par {rule.par}s · {score} 分</strong>
      </div>
      <div className="sudoku-rule">
        <span>{rule.title}</span>
        <small>{rule.detail}</small>
        {rule.errorLimit && <em>失误 {session.errors}/{rule.errorLimit}</em>}
      </div>
      <div className="sudoku-board" style={{ '--cells': size } as CSSProperties}>
        {puzzle.givens.map((given, index) => {
          const row = Math.floor(index / size)
          const col = index % size
          const value = given || session.entries[index]
          const wrong = !given && value > 0 && value !== puzzle.solution[index]
          const frozenLeft = session.frozen[index] ?? 0
          const inZone = session.selected !== null && (row === selRow || col === selCol || boxOf(index, rule.spec) === selBox)
          const same = rule.highlightAll && selValue > 0 && value === selValue && index !== session.selected
          const classes = [
            'sudoku-cell',
            given ? 'is-given' : value ? 'is-entry' : '',
            wrong ? 'is-wrong' : '',
            frozenLeft > 0 ? 'is-frozen' : '',
            inZone ? 'is-zone' : '',
            same ? 'is-same' : '',
            session.selected === index ? 'is-selected' : '',
          ].filter(Boolean).join(' ')
          return (
            <button
              key={index}
              className={classes}
              data-br={(col + 1) % boxCols === 0 && col + 1 < size ? '1' : '0'}
              data-bb={(row + 1) % boxRows === 0 && row + 1 < size ? '1' : '0'}
              onClick={() => selectCell(index)}
              aria-label={`第${row + 1}行第${col + 1}列${value ? `：${value}` : '，空'}${frozenLeft > 0 ? `，冻结剩 ${frozenLeft} 秒` : ''}`}
            >
              {value ? <span>{value}</span> : session.notes[index] > 0 ? (
                <span className={`sudoku-notes cols-${size < 6 ? 2 : 3}`}>
                  {Array.from({ length: size }, (_, step) => step + 1).map((digit) => (
                    <i key={digit} className={session.notes[index] & (1 << (digit - 1)) ? 'on' : ''}>{digit}</i>
                  ))}
                </span>
              ) : null}
              {frozenLeft > 0 && <i className="sudoku-freeze" aria-hidden="true">❄{frozenLeft}</i>}
            </button>
          )
        })}
      </div>
      <div className="sudoku-pad">
        <div className="sudoku-digits" style={{ '--digits': size } as CSSProperties}>
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
          <button className="sudoku-key" disabled={locked} onClick={restart}>
            <RotateCcw size={15} />重开
          </button>
        </div>
      </div>
      <p className="sudoku-live" aria-live="polite">{announce}</p>
      {session.failed && <div className="sudoku-banner is-failed">失误过多，星阵崩塌</div>}
      {complete && <div className="sudoku-banner is-complete">星阵完成！{score} 分</div>}
    </div>
  )
}
