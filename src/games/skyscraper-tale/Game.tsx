import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Eraser, RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { conflictIndexes, formatClock, isSolved, scoreFor, type ClueSide, type SkyPuzzle } from './logic'
import { createSkyPuzzle, getSkyLevel, SKY_LEVEL_COUNT, type SkyLevelSpec } from './levels'
import './skyscraper-tale.css'

interface TowerProps {
  paused: boolean
  audio: GameAudio
  emit: (event: GameEvent) => void
  spec: SkyLevelSpec
  puzzle: SkyPuzzle
}

const ARROWS: Record<string, 'up' | 'down' | 'left' | 'right'> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }
const NUDGE_MS = 1800

function SkyTower({ paused, audio, emit, spec, puzzle }: TowerProps) {
  const size = puzzle.size
  const [entries, setEntries] = useState<number[]>(() => new Array<number>(size * size).fill(0))
  const [selected, setSelected] = useState<number | null>(null)
  const [errors, setErrors] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [done, setDone] = useState<'' | 'win' | 'lose'>('')
  const [nudge, setNudge] = useState('')
  const [announce, setAnnounce] = useState('')
  const errorsRef = useRef(0)
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

  const conflicts = useMemo(() => conflictIndexes(entries, size), [entries, size])
  const conflictSet = useMemo(() => new Set(conflicts), [conflicts])
  const full = entries.every((value) => value > 0)
  const solved = useMemo(() => isSolved(entries, size, puzzle.clues), [entries, puzzle, size])
  const locked = paused || !!done || solved

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
    emit({ type: kind === 'win' ? 'completed' : 'failed', score: scoreFor(errorsRef.current, elapsedRef.current, spec.par, spec.strict) })
  }, [audio, emit, spec.par, spec.strict])

  useEffect(() => {
    if (solved) finish('win')
  }, [finish, solved])

  useEffect(() => {
    if (spec.maxMistakes !== undefined && errors > spec.maxMistakes) finish('lose')
  }, [errors, finish, spec.maxMistakes])

  useEffect(() => {
    if (spec.timeLimit !== undefined && elapsed >= spec.timeLimit) finish('lose')
  }, [elapsed, finish, spec.timeLimit])

  useEffect(() => {
    if (!full || solved || doneRef.current || paused) return
    showNudge('天际线与边缘视线不符，重新审视高楼')
  }, [full, paused, showNudge, solved])

  const doneLines = useMemo(() => {
    let count = 0
    for (let row = 0; row < size; row += 1) {
      const line = Array.from({ length: size }, (_, col) => entries[row * size + col])
      if (line.every((value) => value > 0) && new Set(line).size === size) count += 1
    }
    for (let col = 0; col < size; col += 1) {
      const line = Array.from({ length: size }, (_, row) => entries[row * size + col])
      if (line.every((value) => value > 0) && new Set(line).size === size) count += 1
    }
    return count
  }, [entries, size])
  useEffect(() => {
    if (doneLines > doneLinesRef.current && !paused && !doneRef.current) audio.play('match')
    doneLinesRef.current = doneLines
  }, [audio, doneLines, paused])

  const inputDigit = useCallback((digit: number) => {
    if (locked) return
    const index = selected
    if (index === null || entries[index] === digit) return
    const next = [...entries]
    next[index] = digit
    setEntries(next)
    if (digit === 0) {
      audio.play('select')
      setAnnounce(`第${Math.floor(index / size) + 1}排第${(index % size) + 1}栋已清空`)
      return
    }
    const hurt = conflictIndexes(next, size).includes(index)
    audio.play(hurt ? 'mismatch' : 'step')
    if (hurt) {
      errorsRef.current += 1
      setErrors(errorsRef.current)
    }
    emit({ type: 'score', score: scoreFor(errorsRef.current, elapsedRef.current, spec.par, spec.strict) })
    setAnnounce(`第${Math.floor(index / size) + 1}排第${(index % size) + 1}栋定为高度 ${digit}${hurt ? '，与同行同列重复' : ''}`)
  }, [audio, emit, entries, locked, selected, size, spec.par, spec.strict])

  useEffect(() => {
    if (locked) return
    const onKey = (event: KeyboardEvent) => {
      const direction = ARROWS[event.key]
      if (direction) {
        event.preventDefault()
        audio.play('select')
        setSelected((current) => {
          const base = current ?? 0
          const row = Math.floor(base / size)
          const col = base % size
          if (direction === 'up') return ((row - 1 + size) % size) * size + col
          if (direction === 'down') return ((row + 1) % size) * size + col
          if (direction === 'left') return row * size + (col - 1 + size) % size
          return row * size + (col + 1) % size
        })
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key >= '1' && event.key <= '9') {
        const digit = Number(event.key)
        if (digit <= size) inputDigit(digit)
        return
      }
      if (event.key === '0' || event.key === 'Backspace' || event.key === 'Delete') inputDigit(0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [audio, inputDigit, locked, size])

  const restart = useCallback(() => {
    errorsRef.current = 0
    doneRef.current = ''
    elapsedRef.current = 0
    doneLinesRef.current = 0
    setEntries(new Array<number>(size * size).fill(0))
    setSelected(null)
    setErrors(0)
    setElapsed(0)
    setDone('')
    setNudge('')
    audio.play('select')
  }, [audio, size])

  const selRow = selected !== null ? Math.floor(selected / size) : -1
  const selCol = selected !== null ? selected % size : -1
  const clueClass = (side: ClueSide, at: number) => {
    const lit = side === 'left' || side === 'right' ? at === selRow : at === selCol
    return `sky-clue${lit ? ' is-lit' : ''}`
  }

  return (
    <div className={`sky-game mode-${spec.mode}${done === 'win' ? ' is-solved' : ''}${done === 'lose' ? ' is-failed' : ''}`} aria-label="摩天楼阵游戏区">
      <div className="sky-readout">
        <span>关卡 {String(spec.level).padStart(2, '0')} · 第{spec.chapter}章 {spec.title}</span>
        <strong>{size}×{size} · {entries.filter((value) => value > 0).length}/{size * size} 栋</strong>
      </div>
      <div className="sky-rule">
        <span>{spec.title}</span>
        <small>{spec.detail}</small>
        {spec.maxMistakes !== undefined && <em className={errors >= spec.maxMistakes ? 'is-tight' : ''}>失误 {errors}/{spec.maxMistakes}</em>}
        {spec.sideClear && <em className="is-fog">单岸雾锁</em>}
        <em className={spec.timeLimit !== undefined && elapsed > spec.par ? 'is-warn' : ''}>{spec.timeLimit !== undefined ? `限时 ${formatClock(Math.max(0, spec.timeLimit - elapsed))}` : `${formatClock(elapsed)} / ${formatClock(spec.par)}`}</em>
      </div>
      <div className="sky-board" style={{ '--sky-size': size } as CSSProperties}>
        <div className="sky-corner" />
        {puzzle.clues.top.map((clue, col) => (
          <div key={`top-${col}`} className={clueClass('top', col)} aria-label={`顶部第 ${col + 1} 列视线 ${clue || '—'}`}>{clue || ''}</div>
        ))}
        <div className="sky-corner" />
        {Array.from({ length: size }, (_, row) => (
          <Fragment key={row}>
            <div className={clueClass('left', row)} aria-label={`左侧第 ${row + 1} 排视线 ${puzzle.clues.left[row] || '—'}`}>{puzzle.clues.left[row] || ''}</div>
            {Array.from({ length: size }, (_, col) => {
              const index = row * size + col
              const value = entries[index]
              const classes = [
                'sky-cell',
                value > 0 ? 'is-entry' : '',
                conflictSet.has(index) ? 'is-wrong' : '',
                selected !== null && index !== selected && (row === selRow || col === selCol) ? 'is-zone' : '',
                selected === index ? 'is-selected' : '',
              ].filter(Boolean).join(' ')
              return (
                <button
                  key={col}
                  type="button"
                  className={classes}
                  onClick={() => {
                    if (locked) return
                    audio.play('select')
                    setSelected((current) => (current === index ? null : index))
                  }}
                  disabled={locked}
                  aria-label={`第 ${row + 1} 排第 ${col + 1} 栋：${value > 0 ? `高度 ${value}` : '空地'}`}
                >
                  {value > 0 ? <span>{value}</span> : null}
                </button>
              )
            })}
            <div className={clueClass('right', row)} aria-label={`右侧第 ${row + 1} 排视线 ${puzzle.clues.right[row] || '—'}`}>{puzzle.clues.right[row] || ''}</div>
          </Fragment>
        ))}
        <div className="sky-corner" />
        {puzzle.clues.bottom.map((clue, col) => (
          <div key={`bottom-${col}`} className={clueClass('bottom', col)} aria-label={`底部第 ${col + 1} 列视线 ${clue || '—'}`}>{clue || ''}</div>
        ))}
        <div className="sky-corner" />
      </div>
      <div className="sky-pad">
        <div className="sky-digits" style={{ '--sky-digits': size } as CSSProperties}>
          {Array.from({ length: size }, (_, step) => step + 1).map((digit) => (
            <button key={digit} type="button" className="sky-key" disabled={locked} onClick={() => inputDigit(digit)}>{digit}</button>
          ))}
        </div>
        <div className="sky-actions">
          <button type="button" className="sky-key" disabled={locked} onClick={() => inputDigit(0)}><Eraser size={15} />擦除</button>
          <button type="button" className="sky-key" disabled={!!done || paused} onClick={restart}><RotateCcw size={15} />重开</button>
        </div>
      </div>
      <p className="sky-live" aria-live="polite">{announce}</p>
      {nudge && <div className="sky-nudge">{nudge}</div>}
      {done === 'win' && <div className="sky-flash">云顶封顶 · 得分 {scoreFor(errors, elapsed, spec.par, spec.strict)}</div>}
      {done === 'lose' && <div className="sky-flash is-bad">{errors > (spec.maxMistakes ?? 0) ? '失误超限，楼阵塌方' : '超时停工，天际线未成'}</div>}
    </div>
  )
}

export default function SkyscraperTaleGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(SKY_LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const spec = getSkyLevel(levelNumber)
  const puzzle = useMemo(() => createSkyPuzzle(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])

  return <SkyTower key={levelNumber} paused={paused} audio={audio} emit={emit} spec={spec} puzzle={puzzle} />
}
