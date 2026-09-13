import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Heart, RotateCcw, Search, Waves } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { auditSea, seaScore, solveReport, type SeaPuzzle } from './logic'
import { NURIKABE_LEVEL_COUNT, generateSeaPuzzle, getSeaLevel, type SeaLevel } from './levels'
import './nurikabe-sea.css'

interface Session {
  readonly state: number[]
  readonly ops: number
  readonly mistakes: number
  readonly elapsed: number
  readonly failed: boolean
  readonly notice: string
}

const freshSession = (puzzle: SeaPuzzle): Session => ({
  state: puzzle.given.map((flag) => (flag ? 1 : 0)),
  ops: 0,
  mistakes: 0,
  elapsed: 0,
  failed: false,
  notice: '',
})

export default function NurikabeSeaGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(NURIKABE_LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const spec = useMemo(() => getSeaLevel(levelNumber), [levelNumber])
  const puzzle = useMemo(() => generateSeaPuzzle(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])
  return <SeaBoard key={levelNumber} paused={paused} audio={audio} emit={emit} spec={spec} puzzle={puzzle} />
}

interface BoardProps {
  paused: boolean
  audio: GameAudio
  emit: (event: GameEvent) => void
  spec: SeaLevel
  puzzle: SeaPuzzle
}

function SeaBoard({ paused, audio, emit, spec, puzzle }: BoardProps) {
  const [session, setSession] = useState<Session>(() => freshSession(puzzle))
  const [won, setWon] = useState(false)
  const reported = useRef(false)
  const audit = useMemo(() => auditSea(puzzle, session.state), [puzzle, session.state])
  const locked = paused || won || session.failed
  const timed = spec.timeBase > 0
  const lives = 3 - session.mistakes
  const score = seaScore(session.ops, puzzle.par, session.mistakes)

  useEffect(() => {
    if (locked) return
    const timer = window.setInterval(() => {
      setSession((current) => {
        if (current.failed) return current
        const elapsed = current.elapsed + 1
        return { ...current, elapsed, failed: timed && elapsed >= puzzle.timeLimit }
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [locked, puzzle.timeLimit, timed])

  useEffect(() => {
    if (!session.failed || reported.current) return
    reported.current = true
    audio.play('lose')
    emit({ type: 'failed', score })
  }, [audio, emit, score, session.failed])

  const toggleCell = (cell: number) => {
    if (locked || puzzle.given[cell]) return
    const state = [...session.state]
    state[cell] = state[cell] === 1 ? 0 : 1
    const ops = session.ops + 1
    const solved = auditSea(puzzle, state).solved
    audio.play(solved ? 'win' : 'step')
    setSession({ ...session, state, ops, notice: '' })
    emit({ type: 'score', score: seaScore(ops, puzzle.par, session.mistakes) })
    if (solved) {
      setWon(true)
      emit({ type: 'completed', score: seaScore(ops, puzzle.par, session.mistakes) })
    }
  }

  const checkSea = () => {
    if (locked) return
    const report = solveReport(puzzle, session.state, 1, 8000)
    if (report.count >= 1) {
      audio.play('match')
      setSession({ ...session, notice: '海图自洽，尚未到岸' })
      return
    }
    if (!report.settled) {
      audio.play('select')
      setSession({ ...session, notice: '推演过深，暂无定论' })
      return
    }
    const mistakes = session.mistakes + 1
    audio.play('mismatch')
    setSession({ ...session, mistakes, failed: mistakes >= 3, notice: '死局已定，惊动亡灵' })
    emit({ type: 'score', score: seaScore(session.ops, puzzle.par, mistakes) })
  }

  const clueAt = useMemo(() => {
    const map = new Array<number>(puzzle.rows * puzzle.cols).fill(-1)
    puzzle.clues.forEach((clue, index) => {
      map[clue.cell] = index
    })
    return map
  }, [puzzle])

  const flooded = useMemo(() => {
    const sea = session.state.map((mark) => mark === 1)
    const bad = new Set<number>()
    for (let row = 0; row + 1 < puzzle.rows; row += 1) {
      for (let col = 0; col + 1 < puzzle.cols; col += 1) {
        const cell = row * puzzle.cols + col
        const block = [cell, cell + 1, cell + puzzle.cols, cell + puzzle.cols + 1]
        if (block.every((spot) => sea[spot])) block.forEach((spot) => bad.add(spot))
      }
    }
    return bad
  }, [puzzle, session.state])

  return (
    <div className={`nb-game ch${spec.chapter}${won ? ' is-won' : ''}${session.failed ? ' is-failed' : ''}`} aria-label="海墓林苑游戏区">
      <div className="nb-readout">
        <span>关卡 {String(spec.level).padStart(2, '0')} · {puzzle.rows}×{puzzle.cols} · {puzzle.clues.length} 岛</span>
        <strong>{session.ops} / par {puzzle.par} · {timed ? `${session.elapsed}/${puzzle.timeLimit}s` : `${session.elapsed}s`} · {score} 分</strong>
      </div>
      <div className="nb-rule">
        <span><Waves size={14} />{spec.title}</span>
        <small>{spec.detail}</small>
        <em>{Array.from({ length: 3 }, (_, heart) => <Heart key={heart} size={12} className={heart < lives ? 'is-full' : 'is-empty'} />)}</em>
      </div>
      <div className="nb-islands" aria-label="各岛当前格数">
        {puzzle.clues.map((clue, index) => (
          <span key={clue.cell} className={`nb-chip${audit.sizes[index] > clue.need ? ' is-over' : ''}${audit.sizes[index] === clue.need ? ' is-done' : ''}`}>
            岛{index + 1} {audit.sizes[index]}/{clue.need}
          </span>
        ))}
      </div>
      <div className="nb-board" style={{ '--nb-cols': puzzle.cols } as CSSProperties}>
        {Array.from({ length: puzzle.rows * puzzle.cols }, (_, cell) => {
          const clue = clueAt[cell]
          const sea = session.state[cell] === 1
          const classes = [
            'nb-cell',
            clue >= 0 ? 'is-clue' : sea ? (puzzle.given[cell] ? 'is-given' : 'is-sea') : 'is-land',
            flooded.has(cell) ? 'is-bad' : '',
          ].filter(Boolean).join(' ')
          const label = clue >= 0 ? `数字 ${puzzle.clues[clue].need}` : sea ? (puzzle.given[cell] ? '预涂海，不可更改' : '海') : '未涂'
          return (
            <button
              key={cell}
              className={classes}
              onClick={() => (clue >= 0 || puzzle.given[cell] ? audio.play('select') : toggleCell(cell))}
              aria-label={`第${Math.floor(cell / puzzle.cols) + 1}行第${(cell % puzzle.cols) + 1}格，${label}`}
            >
              {clue >= 0 && <span className="nb-num">{puzzle.clues[clue].need}</span>}
            </button>
          )
        })}
      </div>
      <div className="nb-actions">
        <button className="nb-key" disabled={paused} onClick={checkSea}><Search size={15} />验证海图</button>
        <button className="nb-key" disabled={paused} onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={15} />重开本关</button>
        <span className="nb-legend">{won ? '海墓落成！' : session.failed ? '亡灵苏醒' : session.notice || '涂出海之归途'}</span>
      </div>
      {won && <div className="nb-banner is-gold">海墓落成！{score} 分</div>}
      {session.failed && <div className="nb-banner is-coral">{timed && session.elapsed >= puzzle.timeLimit ? '汐钟到点' : '亡灵苏醒'}</div>}
    </div>
  )
}
