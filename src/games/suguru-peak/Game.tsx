import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Eraser, RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { computeScore, isPuzzleSolved, moveSelection, type MoveDirection, type PeakPuzzle } from './logic'
import { createPeakPuzzle, getPeakLevel, LEVEL_COUNT, type PeakLevel } from './levels'
import './suguru-peak.css'

interface Session {
  entries: number[]
  selected: number | null
  mistakes: number
  elapsed: number
  failed: boolean
}

const freshSession = (cells: number): Session => ({ entries: new Array<number>(cells).fill(0), selected: null, mistakes: 0, elapsed: 0, failed: false })

const ARROWS: Record<string, MoveDirection> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

export default function SuguruPeakGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const rule = getPeakLevel(levelNumber)
  const puzzle = useMemo(() => createPeakPuzzle(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])

  return <PeakBoard key={levelNumber} paused={paused} audio={audio} emit={emit} rule={rule} puzzle={puzzle} />
}

interface BoardProps {
  paused: boolean
  audio: GameAudio
  emit: (event: GameEvent) => void
  rule: PeakLevel
  puzzle: PeakPuzzle
}

function PeakBoard({ paused, audio, emit, rule, puzzle }: BoardProps) {
  const { ctx, solution, givens } = puzzle
  const [session, setSession] = useState<Session>(() => freshSession(ctx.total))
  const [announce, setAnnounce] = useState('')
  const score = computeScore(session.mistakes, session.elapsed, rule.par)
  const complete = !session.failed && isPuzzleSolved(givens, session.entries, solution)
  const locked = paused || session.failed || complete

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
    if (index === null || givens[index] || session.entries[index] === digit) return
    const nextEntries = [...session.entries]
    nextEntries[index] = digit
    if (digit === 0) {
      audio.play('select')
      setSession({ ...session, entries: nextEntries })
      return
    }
    const correct = digit === solution[index]
    const mistakes = correct ? session.mistakes : session.mistakes + 1
    const solved = isPuzzleSolved(givens, nextEntries, solution)
    const total = computeScore(mistakes, session.elapsed, rule.par)
    const at = `第${Math.floor(index / rule.cols) + 1}行第${(index % rule.cols) + 1}格填入 ${digit}`
    setAnnounce(solved ? `${at}，峰块贯通` : correct ? `${at}，正确` : `${at}，与邻块冲突`)
    audio.play(solved ? 'win' : correct ? 'step' : 'mismatch')
    setSession({ ...session, entries: nextEntries, mistakes, failed: !solved && !!rule.errorLimit && mistakes >= rule.errorLimit })
    emit({ type: 'score', score: total })
    if (solved) {
      emit({ type: 'completed', score: total })
      return
    }
    if (rule.errorLimit && mistakes >= rule.errorLimit) {
      audio.play('lose')
      emit({ type: 'failed', score: total })
    }
  }, [audio, emit, givens, locked, rule, session, solution])

  useEffect(() => {
    if (locked) return
    const onKey = (event: KeyboardEvent) => {
      const direction = ARROWS[event.key]
      if (direction) {
        event.preventDefault()
        audio.play('select')
        setSession((current) => ({ ...current, selected: moveSelection(current.selected, direction, rule.rows, rule.cols) }))
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key >= '1' && event.key <= '9') {
        const digit = Number(event.key)
        if (digit <= ctx.maxDigit) inputDigit(digit)
        return
      }
      if (event.key === '0' || event.key === 'Backspace' || event.key === 'Delete') inputDigit(0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [audio, ctx.maxDigit, inputDigit, locked, rule.cols, rule.rows])

  const restart = () => {
    audio.play('select')
    setSession(freshSession(ctx.total))
  }

  const selected = session.selected
  const selValue = selected !== null ? givens[selected] || session.entries[selected] : 0
  const filled = session.entries.filter((value, index) => value > 0 || givens[index] > 0).length

  return (
    <div className={`peak-game chapter-${rule.chapter}`} aria-label="峰块相连游戏区">
      <div className="peak-readout">
        <span>关卡 {String(rule.level).padStart(2, '0')} · 第{rule.chapter}章 {rule.title}</span>
        <strong>{filled}/{ctx.total} 格 · {session.elapsed}s / par {rule.par}s · {score} 分</strong>
      </div>
      <div className="peak-rule">
        <span>{rule.title}</span>
        <small>{rule.detail}</small>
        {rule.errorLimit && <em className={session.mistakes >= rule.errorLimit ? 'is-tight' : ''}>失误 {session.mistakes}/{rule.errorLimit}</em>}
      </div>
      <div className="peak-board" style={{ '--cols': rule.cols } as CSSProperties}>
        {givens.map((given, index) => {
          const row = Math.floor(index / rule.cols)
          const col = index % rule.cols
          const value = given || session.entries[index]
          const wrong = !given && value > 0 && value !== solution[index]
          const near = selected !== null && ctx.neighbors[selected].includes(index)
          const inRegion = selected !== null && ctx.regionOf[selected] === ctx.regionOf[index]
          const same = rule.chapter === 1 && selValue > 0 && value === selValue && index !== selected
          const classes = [
            'peak-cell',
            `tint-${ctx.regionOf[index] % 4}`,
            given ? 'is-given' : value ? 'is-entry' : '',
            wrong ? 'is-wrong' : '',
            near ? 'is-near' : '',
            inRegion ? 'is-region' : '',
            same ? 'is-same' : '',
            selected === index ? 'is-selected' : '',
          ].filter(Boolean).join(' ')
          return (
            <button
              key={index}
              className={classes}
              data-br={col + 1 < rule.cols && ctx.regionOf[index] !== ctx.regionOf[index + 1] ? '1' : '0'}
              data-bb={row + 1 < rule.rows && ctx.regionOf[index] !== ctx.regionOf[index + rule.cols] ? '1' : '0'}
              onClick={() => {
                if (locked) return
                audio.play('select')
                setSession((current) => ({ ...current, selected: current.selected === index ? null : index }))
              }}
              aria-label={`第${row + 1}行第${col + 1}格，区域${ctx.regionOf[index] + 1}${value ? `：${value}` : '，空'}`}
            >
              {value ? <span>{value}</span> : null}
            </button>
          )
        })}
      </div>
      <div className="peak-pad">
        <div className="peak-digits" style={{ '--digits': ctx.maxDigit } as CSSProperties}>
          {Array.from({ length: ctx.maxDigit }, (_, step) => step + 1).map((digit) => (
            <button key={digit} className="peak-key" disabled={locked} onClick={() => inputDigit(digit)}>{digit}</button>
          ))}
        </div>
        <div className="peak-actions">
          <button className="peak-key" disabled={locked} onClick={() => inputDigit(0)}>
            <Eraser size={15} />擦除
          </button>
          <button className="peak-key" disabled={locked} onClick={restart}>
            <RotateCcw size={15} />重开
          </button>
        </div>
      </div>
      <p className="peak-live" aria-live="polite">{announce}</p>
      {session.failed && <div className="peak-banner is-failed">失误超限，登山失败</div>}
      {complete && <div className="peak-banner is-complete">峰块贯通！{score} 分</div>}
    </div>
  )
}
