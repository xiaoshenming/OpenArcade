import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { Eraser, RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { computeScore, isCasketSolved, violationMask } from './logic'
import { createCasketPuzzle, getCasketLevel, LEVEL_COUNT, type CasketLevel, type CasketPuzzle } from './levels'
import './calc-casket.css'

interface Session {
  entries: number[]
  selected: number | null
  errors: number
  elapsed: number
  failed: boolean
}

const freshSession = (cells: number): Session => ({ entries: new Array<number>(cells).fill(0), selected: null, errors: 0, elapsed: 0, failed: false })

const moveSelection = (current: number, key: string, size: number) => {
  const row = Math.floor(current / size)
  const col = current % size
  if (key === 'ArrowUp') return ((row - 1 + size) % size) * size + col
  if (key === 'ArrowDown') return ((row + 1) % size) * size + col
  if (key === 'ArrowLeft') return row * size + (col - 1 + size) % size
  return row * size + (col + 1) % size
}

export default function CalcCasketGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const rule = getCasketLevel(levelNumber)
  const puzzle = useMemo(() => createCasketPuzzle(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])

  return <CasketBoard key={levelNumber} paused={paused} audio={audio} emit={emit} rule={rule} puzzle={puzzle} />
}

interface BoardProps {
  paused: boolean
  audio: ReturnType<typeof createGameAudio>
  emit: (event: GameEvent) => void
  rule: CasketLevel
  puzzle: CasketPuzzle
}

function CasketBoard({ paused, audio, emit, rule, puzzle }: BoardProps) {
  const { size } = rule
  const cells = size * size
  const [session, setSession] = useState<Session>(() => freshSession(cells))
  const [announce, setAnnounce] = useState('')
  const score = computeScore(session.errors, session.elapsed, rule.par)
  const violations = useMemo(() => violationMask(session.entries, size, puzzle.cages), [puzzle.cages, session.entries, size])
  const complete = !session.failed && isCasketSolved(session.entries, size, puzzle.cages)
  const locked = paused || session.failed || complete

  const cageOf = useMemo(() => {
    const map = new Array<number>(cells).fill(-1)
    puzzle.cages.forEach((cage, index) => cage.cells.forEach((cell) => { map[cell] = index }))
    return map
  }, [cells, puzzle.cages])
  const chips = useMemo(() => {
    const map = new Map<number, string>()
    puzzle.cages.forEach((cage) => map.set(Math.min(...cage.cells), `${cage.target}${cage.op}`))
    return map
  }, [puzzle.cages])

  useEffect(() => {
    if (paused || session.failed || complete) return
    const timer = window.setInterval(() => setSession((current) => ({ ...current, elapsed: current.elapsed + 1 })), 1000)
    return () => window.clearInterval(timer)
  }, [complete, paused, session.failed])

  useEffect(() => {
    if (session.elapsed <= rule.par || session.failed || complete) return
    emit({ type: 'score', score })
  }, [complete, emit, rule.par, score, session.elapsed, session.failed])

  const inputDigit = useCallback((digit: number) => {
    if (locked) return
    const index = session.selected
    if (index === null || session.entries[index] === digit) return
    const entries = [...session.entries]
    entries[index] = digit
    const bad = digit > 0 && violationMask(entries, size, puzzle.cages)[index]
    const errors = bad ? session.errors + 1 : session.errors
    const solved = isCasketSolved(entries, size, puzzle.cages)
    const total = computeScore(errors, session.elapsed, rule.par)
    const at = `第${Math.floor(index / size) + 1}行第${(index % size) + 1}列填入 ${digit}`
    setAnnounce(solved ? `${at}，迷匣开启` : bad ? `${at}，与笼或行列冲突` : digit ? `${at}` : `${at}，已擦除`)
    audio.play(solved ? 'win' : bad ? 'mismatch' : digit ? 'step' : 'select')
    setSession({ ...session, entries, errors, failed: !solved && !!rule.errorLimit && errors >= rule.errorLimit })
    emit({ type: 'score', score: total })
    if (solved) {
      emit({ type: 'completed', score: total })
      return
    }
    if (rule.errorLimit && errors >= rule.errorLimit) {
      audio.play('lose')
      emit({ type: 'failed', score: total })
    }
  }, [audio, emit, locked, puzzle.cages, rule, session, size])

  const selectCell = (index: number) => {
    if (locked) return
    audio.play('select')
    setSession((current) => ({ ...current, selected: current.selected === index ? null : index }))
  }

  const onKey = (event: ReactKeyboardEvent) => {
    if (locked) return
    if (event.key.startsWith('Arrow') && session.selected !== null) {
      event.preventDefault()
      audio.play('select')
      setSession((current) => ({ ...current, selected: moveSelection(current.selected ?? 0, event.key, size) }))
      return
    }
    if (event.key >= '1' && event.key <= '9' && Number(event.key) <= size) inputDigit(Number(event.key))
    if (event.key === '0' || event.key === 'Backspace' || event.key === 'Delete') inputDigit(0)
  }

  const restart = () => {
    audio.play('select')
    setSession(freshSession(cells))
    setAnnounce('')
  }

  const zoneCage = session.selected !== null ? cageOf[session.selected] : -1

  return (
    <div className={`casket-game chapter-${rule.chapter}`} aria-label="算符迷匣游戏区" onKeyDown={onKey} tabIndex={-1}>
      <div className="casket-readout">
        <span>关卡 {String(rule.level).padStart(2, '0')} · 第{rule.chapter}章 {rule.title}</span>
        <strong>{size}×{size} · {session.elapsed}s / par {rule.par}s · {score} 分</strong>
      </div>
      <div className="casket-rule">
        <span>{rule.title}</span>
        <small>{rule.detail}</small>
        {rule.errorLimit && <em>失误 {session.errors}/{rule.errorLimit}</em>}
      </div>
      <div className="casket-board" style={{ '--cells': size } as CSSProperties} role="grid">
        {session.entries.map((value, index) => {
          const right = index % size === size - 1 || cageOf[index] !== cageOf[index + 1]
          const down = index + size >= cells || cageOf[index] !== cageOf[index + size]
          const classes = [
            'casket-cell',
            value ? 'is-filled' : '',
            violations[index] ? 'is-bad' : '',
            cageOf[index] === zoneCage ? 'is-zone' : '',
            session.selected === index ? 'is-selected' : '',
          ].filter(Boolean).join(' ')
          return (
            <button
              key={index}
              className={classes}
              data-br={right ? '1' : '0'}
              data-bb={down ? '1' : '0'}
              onClick={() => selectCell(index)}
              aria-label={`第${Math.floor(index / size) + 1}行第${(index % size) + 1}列${value ? `：${value}` : '，空'}${chips.has(index) ? `，笼目标 ${chips.get(index)}` : ''}${violations[index] ? '，冲突' : ''}`}
            >
              {chips.has(index) && <i className="casket-clue">{chips.get(index)}</i>}
              {value > 0 && <span>{value}</span>}
            </button>
          )
        })}
      </div>
      <div className="casket-pad">
        <div className="casket-digits" style={{ '--digits': size } as CSSProperties}>
          {Array.from({ length: size }, (_, step) => step + 1).map((digit) => (
            <button key={digit} className="casket-key" disabled={locked} onClick={() => inputDigit(digit)}>{digit}</button>
          ))}
        </div>
        <div className="casket-actions">
          <button className="casket-key" disabled={locked} onClick={() => inputDigit(0)}>
            <Eraser size={15} />擦除
          </button>
          <button className="casket-key" disabled={locked} onClick={restart}>
            <RotateCcw size={15} />重开
          </button>
        </div>
      </div>
      <p className="casket-live" aria-live="polite">{announce}</p>
      {session.failed && <div className="casket-banner is-failed">失误过多，迷匣封死</div>}
      {complete && <div className="casket-banner is-complete">迷匣开启！{score} 分</div>}
    </div>
  )
}
