import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Heart, RotateCcw, Ship } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { auditBridge, bridgeScore, generateBridgePuzzle, planToggle, runAtCell, runBetween, type BridgePuzzle } from './logic'
import { BRIDGE_LEVEL_COUNT, getBridgeLevel, type BridgeLevel } from './levels'
import './bridge-isles.css'

interface Session {
  readonly state: number[]
  readonly ops: number
  readonly mistakes: number
  readonly elapsed: number
  readonly selected: number
  readonly failed: boolean
}

const freshSession = (puzzle: BridgePuzzle): Session => ({
  state: [...puzzle.fixed], ops: 0, mistakes: 0, elapsed: 0, selected: -1, failed: false,
})

export default function BridgeIslesGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(BRIDGE_LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const spec = useMemo(() => getBridgeLevel(levelNumber), [levelNumber])
  const puzzle = useMemo(() => generateBridgePuzzle(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])
  return <IsleBoard key={levelNumber} paused={paused} audio={audio} emit={emit} spec={spec} puzzle={puzzle} />
}

interface BoardProps {
  paused: boolean
  audio: GameAudio
  emit: (event: GameEvent) => void
  spec: BridgeLevel
  puzzle: BridgePuzzle
}

function IsleBoard({ paused, audio, emit, spec, puzzle }: BoardProps) {
  const [session, setSession] = useState<Session>(() => freshSession(puzzle))
  const [won, setWon] = useState(false)
  const reported = useRef(false)
  const audit = useMemo(() => auditBridge(puzzle, session.state), [puzzle, session.state])
  const locked = paused || won || session.failed
  const timed = spec.timeBase > 0
  const lives = 3 - session.mistakes
  const score = bridgeScore(session.ops, puzzle.par, session.mistakes)

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

  const applyToggle = (runId: number) => {
    const plan = planToggle(puzzle, session.state, runId)
    if (plan.error === 'locked') {
      audio.play('mismatch')
      return
    }
    if (plan.error) {
      const mistakes = session.mistakes + 1
      audio.play('mismatch')
      setSession({ ...session, mistakes, failed: mistakes >= 3 })
      emit({ type: 'score', score: bridgeScore(session.ops, puzzle.par, mistakes) })
      return
    }
    const ops = session.ops + 1
    const solved = auditBridge(puzzle, plan.next).solved
    audio.play(solved ? 'win' : 'step')
    setSession({ ...session, state: [...plan.next], ops })
    emit({ type: 'score', score: bridgeScore(ops, puzzle.par, session.mistakes) })
    if (solved) {
      setWon(true)
      emit({ type: 'completed', score: bridgeScore(ops, puzzle.par, session.mistakes) })
    }
  }

  const clickCell = (cell: number, isleId: number) => {
    if (locked) return
    if (isleId >= 0) {
      if (session.selected < 0 || session.selected === isleId) {
        audio.play('select')
        setSession({ ...session, selected: session.selected === isleId ? -1 : isleId })
        return
      }
      const linked = runBetween(puzzle, session.selected, isleId)
      if (linked >= 0) {
        applyToggle(linked)
        return
      }
      audio.play('select')
      setSession({ ...session, selected: isleId })
      return
    }
    const runId = runAtCell(puzzle, session.state, cell)
    if (runId < 0) {
      audio.play('mismatch')
      return
    }
    applyToggle(runId)
  }

  const isleAt = useMemo(() => {
    const map = new Array<number>(puzzle.rows * puzzle.cols).fill(-1)
    puzzle.isles.forEach((isle, id) => {
      map[isle.row * puzzle.cols + isle.col] = id
    })
    return map
  }, [puzzle])

  const railsByCell = useMemo(() => {
    const map = new Map<number, { id: number; horizontal: boolean; count: number }>()
    puzzle.runs.forEach((run, id) => {
      const count = session.state[id] ?? 0
      if (!count) return
      run.cells.forEach((cell) => map.set(cell, { id, horizontal: run.horizontal, count }))
    })
    return map
  }, [puzzle, session.state])

  const linkSet = useMemo(() => {
    const set = new Set<number>()
    if (session.selected >= 0) {
      puzzle.runs.forEach((run) => {
        if (run.a === session.selected) set.add(run.b)
        if (run.b === session.selected) set.add(run.a)
      })
    }
    return set
  }, [puzzle, session.selected])

  const unfinished = puzzle.isles.filter((isle, id) => audit.counts[id] !== isle.need).length
  const legend = won
    ? '群岛连为一体，航路贯通！'
    : session.failed
      ? (timed && session.elapsed >= puzzle.timeLimit ? '潮汐吞没了航路' : '船员耗尽，航路中止')
      : audit.matched ? '桥数全部吻合，就差最后一里连通' : audit.connected ? '已经连通，还有岛屿桥数未合' : `${unfinished} 座岛屿的桥数未合`

  return (
    <div className={`bi-game ch${spec.chapter}${won ? ' is-won' : ''}${session.failed ? ' is-failed' : ''}`} aria-label="桥连诸岛游戏区">
      <div className="bi-readout">
        <span>关卡 {String(spec.level).padStart(2, '0')} · {puzzle.rows}×{puzzle.cols} · {puzzle.isles.length} 岛</span>
        <strong>{session.ops} / par {puzzle.par} · {timed ? `${session.elapsed}/${puzzle.timeLimit}s` : `${session.elapsed}s`} · {score} 分</strong>
      </div>
      <div className="bi-rule">
        <span><Ship size={14} />{spec.title}</span>
        <small>{spec.detail}</small>
        <em>{Array.from({ length: 3 }, (_, heart) => <Heart key={heart} size={12} className={heart < lives ? 'is-full' : 'is-empty'} />)}</em>
      </div>
      <div className="bi-board" style={{ '--bi-cols': puzzle.cols } as CSSProperties}>
        {Array.from({ length: puzzle.rows * puzzle.cols }, (_, cell) => {
          const isleId = isleAt[cell]
          if (isleId >= 0) {
            const isle = puzzle.isles[isleId]
            return (
              <button
                key={cell}
                className={`bi-cell bi-isle${session.selected === isleId ? ' is-selected' : ''}${linkSet.has(isleId) ? ' is-link' : ''}${audit.counts[isleId] === isle.need ? ' is-done' : ''}`}
                onClick={() => clickCell(cell, isleId)}
                disabled={paused}
                aria-label={`岛屿 ${isleId + 1}：需要 ${isle.need} 座桥，当前 ${audit.counts[isleId]}`}
              >
                <span className="bi-num">{isle.need}</span>
              </button>
            )
          }
          const rail = railsByCell.get(cell)
          const fixed = rail ? puzzle.fixed[rail.id] > 0 : false
          const cls = (name: string) => `bi-rail ${name}${fixed ? ' is-fixed' : ''}`
          return (
            <button key={cell} className={`bi-cell bi-water${rail ? ' is-bridged' : ''}`} onClick={() => clickCell(cell, -1)} disabled={paused} aria-label={`水面 ${cell + 1}${rail ? `：${rail.count} 座桥` : ''}`}>
              {rail && rail.horizontal && (rail.count === 2
                ? <><span className={cls('h-top')} /><span className={cls('h-bot')} /></>
                : <span className={cls('h-mid')} />)}
              {rail && !rail.horizontal && (rail.count === 2
                ? <><span className={cls('v-lft')} /><span className={cls('v-rgt')} /></>
                : <span className={cls('v-mid')} />)}
            </button>
          )
        })}
      </div>
      <div className="bi-actions">
        <button className="bi-restart" disabled={paused} onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={17} />重开本关</button>
        <span className="bi-legend">{legend}</span>
      </div>
      {won && <div className="bi-banner is-gold">群岛连为一体！{score} 分</div>}
      {session.failed && <div className="bi-banner is-coral">{timed && session.elapsed >= puzzle.timeLimit ? '潮汐吞没航路' : '船员耗尽'}</div>}
    </div>
  )
}
