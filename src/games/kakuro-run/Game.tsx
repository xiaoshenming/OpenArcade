import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Eraser, RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { computeScore, isPuzzleSolved, moveSelection, type MoveDirection, type RunPuzzle } from './logic'
import { createRunPuzzle, getRunLevel, RUN_LEVEL_COUNT, type RunLevel } from './levels'
import './kakuro-run.css'

interface Session {
  entries: number[]
  selected: number | null
  mistakes: number
  elapsed: number
  failed: boolean
}

const freshSession = (cells: number): Session => ({ entries: new Array<number>(cells).fill(0), selected: null, mistakes: 0, elapsed: 0, failed: false })

const ARROWS: Record<string, MoveDirection> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }

export default function KakuroRunGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(RUN_LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const rule = getRunLevel(levelNumber)
  const puzzle = useMemo(() => createRunPuzzle(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])

  return <RunBoard key={levelNumber} paused={paused} audio={audio} emit={emit} rule={rule} puzzle={puzzle} />
}

interface BoardProps {
  paused: boolean
  audio: GameAudio
  emit: (event: GameEvent) => void
  rule: RunLevel
  puzzle: RunPuzzle
}

function RunBoard({ paused, audio, emit, rule, puzzle }: BoardProps) {
  const { ctx, solution, givens } = puzzle
  const [session, setSession] = useState<Session>(() => freshSession(ctx.total))
  const [announce, setAnnounce] = useState('')
  const score = computeScore(session.mistakes, session.elapsed, rule.par)
  const complete = !session.failed && isPuzzleSolved(givens, session.entries, solution)
  const locked = paused || session.failed || complete
  const badges = useMemo(() => {
    const heads = new Map<number, { dir: 'h' | 'v'; clue: number }>()
    ctx.runs.forEach((run) => heads.set(run.cells[0], { dir: run.dir, clue: run.clue }))
    return heads
  }, [ctx])

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
    const at = `第${Math.floor(index / rule.cols) + 1}行第${(index % rule.cols) + 1}列填入 ${digit}`
    setAnnounce(solved ? `${at}，和径贯通` : correct ? `${at}，正确` : `${at}，与段约束冲突`)
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
        setSession((current) => ({ ...current, selected: moveSelection(current.selected, direction, rule.rows, rule.cols, ctx.whiteCells) }))
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key >= '1' && event.key <= '9') inputDigit(Number(event.key))
      else if (event.key === '0' || event.key === 'Backspace' || event.key === 'Delete') inputDigit(0)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [audio, ctx.whiteCells, inputDigit, locked, rule.cols, rule.rows])

  const restart = () => {
    audio.play('select')
    setSession(freshSession(ctx.total))
  }

  const lineCells = useMemo(() => {
    if (session.selected === null) return new Set<number>()
    const cells = new Set<number>()
    ctx.runsOfCell[session.selected].forEach((id) => ctx.runs[id].cells.forEach((cell) => cells.add(cell)))
    return cells
  }, [ctx, session.selected])
  const filled = ctx.whiteCells.filter((cell) => givens[cell] > 0 || session.entries[cell] > 0).length

  return (
    <div className={`run-game chapter-${rule.chapter}`} aria-label="数字和径游戏区">
      <div className="run-readout">
        <span>关卡 {String(rule.level).padStart(2, '0')} · 第{rule.chapter}章 {rule.title}</span>
        <strong>{filled}/{ctx.whiteCount} 格 · {session.elapsed}s / par {rule.par}s · {score} 分</strong>
      </div>
      <div className="run-rule">
        <span>{rule.title}</span>
        <small>{rule.detail}</small>
        {rule.errorLimit && <em className={session.mistakes >= rule.errorLimit ? 'is-tight' : ''}>失误 {session.mistakes}/{rule.errorLimit}</em>}
      </div>
      <div className="run-board" style={{ '--cols': rule.cols } as CSSProperties}>
        {ctx.black.map((flag, index) => {
          if (flag) return <div key={index} className="run-block" aria-hidden="true" />
          const value = givens[index] || session.entries[index]
          const wrong = !givens[index] && value > 0 && value !== solution[index]
          const head = badges.get(index)
          const classes = [
            'run-cell',
            givens[index] ? 'is-given' : value ? 'is-entry' : '',
            wrong ? 'is-wrong' : '',
            lineCells.has(index) ? 'is-line' : '',
            session.selected === index ? 'is-selected' : '',
          ].filter(Boolean).join(' ')
          return (
            <button
              key={index}
              className={classes}
              onClick={() => {
                if (locked) return
                audio.play('select')
                setSession((current) => ({ ...current, selected: current.selected === index ? null : index }))
              }}
              aria-label={`第${Math.floor(index / rule.cols) + 1}行第${(index % rule.cols) + 1}列${value ? `：${value}` : '，空'}${head ? `，${head.dir === 'h' ? '横' : '纵'}段clue ${head.clue || '未知'}` : ''}`}
            >
              {head && <i className={`run-clue ${head.dir === 'h' ? 'is-h' : 'is-v'}${head.clue ? '' : ' is-dark'}`}>{head.clue || '?'}</i>}
              {value ? <span>{value}</span> : null}
            </button>
          )
        })}
      </div>
      <div className="run-pad">
        <div className="run-digits">
          {Array.from({ length: 9 }, (_, step) => step + 1).map((digit) => (
            <button key={digit} className="run-key" disabled={locked} onClick={() => inputDigit(digit)}>{digit}</button>
          ))}
        </div>
        <div className="run-actions">
          <button className="run-key" disabled={locked} onClick={() => inputDigit(0)}>
            <Eraser size={15} />擦除
          </button>
          <button className="run-key" disabled={locked} onClick={restart}>
            <RotateCcw size={15} />重开
          </button>
        </div>
      </div>
      <p className="run-live" aria-live="polite">{announce}</p>
      {session.failed && <div className="run-banner is-failed">失误超限，迷失荒径</div>}
      {complete && <div className="run-banner is-complete">和径贯通！{score} 分</div>}
    </div>
  )
}
