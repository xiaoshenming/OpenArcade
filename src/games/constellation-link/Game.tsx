import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { canLink, degreesFor, edgeKey, failedScore, isSolved, neighborsOf, scoreFor } from './logic'
import { createConstellationPuzzle, LEVEL_COUNT, type ConstellationPuzzle } from './levels'
import './constellation-link.css'

interface Session {
  selected: number | null
  placed: number[]
  placedCount: number
  mistakes: number
  failed: boolean
}

const freshSession = (): Session => ({ selected: null, placed: [], placedCount: 0, mistakes: 0, failed: false })

export default function ConstellationLinkGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const puzzle = useMemo(() => createConstellationPuzzle(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])
  return <StarBoard key={levelNumber} puzzle={puzzle} paused={paused} audio={audio} emit={emit} />
}

function StarBoard({ puzzle, paused, audio, emit }: { puzzle: ConstellationPuzzle; paused: boolean; audio: GameAudio; emit: (event: GameEvent) => void }) {
  const { sky, clues, par, budget, spec } = puzzle
  const [session, setSession] = useState<Session>(freshSession)
  const [announce, setAnnounce] = useState('')
  const degrees = useMemo(() => degreesFor(sky, session.placed), [sky, session.placed])
  const edgeIndex = useMemo(() => new Map(sky.edges.map((edge, slot) => [edgeKey(edge.a, edge.b), slot])), [sky])
  const starSlots = useMemo(() => new Map(sky.stars.map((cell, slot) => [cell, slot])), [sky])
  const complete = !session.failed && isSolved(clues, degrees)
  const locked = paused || session.failed || complete
  const score = scoreFor(session.placedCount, session.mistakes, par)

  const pickStar = useCallback((cell: number) => {
    if (locked) return
    const current = session.selected
    if (current === cell) {
      audio.play('select')
      setSession({ ...session, selected: null })
      return
    }
    if (current === null || !neighborsOf(current, sky.cols, sky.rows).includes(cell)) {
      audio.play('select')
      setAnnounce(`选中第${Math.floor(cell / sky.cols) + 1}行第${(cell % sky.cols) + 1}列的星`)
      setSession({ ...session, selected: cell })
      return
    }
    const edge = edgeIndex.get(edgeKey(current, cell))
    if (edge === undefined) {
      audio.play('select')
      setSession({ ...session, selected: cell })
      return
    }
    if (session.placed.includes(edge)) {
      audio.play('step')
      setAnnounce('拆除一条连线')
      setSession({ ...session, placed: session.placed.filter((slot) => slot !== edge), selected: cell })
      emit({ type: 'score', score: scoreFor(session.placedCount, session.mistakes, par) })
      return
    }
    const grown = [...session.placed, edge]
    if (!canLink(sky, clues, degrees, current, cell)) {
      const mistakes = session.mistakes + 1
      const over = mistakes >= (spec.mistakeLimit ?? Number.MAX_SAFE_INTEGER)
      const currentSlot = starSlots.get(current)
      const chosenFull = currentSlot !== undefined && degrees[currentSlot] >= clues[currentSlot]
      audio.play('mismatch')
      setAnnounce(chosenFull
        ? `这颗星连线已满，失误 ${mistakes}`
        : `第${Math.floor(cell / sky.cols) + 1}行第${(cell % sky.cols) + 1}列的星连线已满，失误 ${mistakes}`)
      setSession({ ...session, mistakes, failed: over, selected: chosenFull ? current : cell })
      emit({ type: 'score', score: scoreFor(session.placedCount, mistakes, par) })
      if (over) {
        audio.play('lose')
        emit({ type: 'failed', score: failedScore(session.placedCount, mistakes, par) })
      }
      return
    }
    const placedCount = session.placedCount + 1
    const solved = isSolved(clues, degreesFor(sky, grown))
    const spent = budget !== undefined && placedCount >= budget && !solved
    const total = scoreFor(placedCount, session.mistakes, par)
    audio.play(solved ? 'win' : 'step')
    setAnnounce(solved ? '星座归位，度数全部吻合' : '连成一条线')
    setSession({ ...session, placed: grown, placedCount, failed: spent, selected: solved ? null : cell })
    emit({ type: 'score', score: total })
    if (solved) {
      emit({ type: 'completed', score: total })
      return
    }
    if (spent) {
      audio.play('lose')
      emit({ type: 'failed', score: failedScore(placedCount, session.mistakes, par) })
    }
  }, [audio, budget, clues, degrees, edgeIndex, emit, locked, par, session, sky, spec.mistakeLimit, starSlots])

  const restart = () => {
    audio.play('select')
    setSession(freshSession())
    setAnnounce('')
  }

  const linked = (a: number, b: number) => {
    const edge = edgeIndex.get(edgeKey(a, b))
    return edge !== undefined && session.placed.includes(edge)
  }

  return (
    <div className={`constellation-game mode-${spec.mode}`} aria-label="星图连线游戏区">
      <div className="constellation-readout">
        <span>关卡 {String(spec.level).padStart(2, '0')} · 第{spec.chapter}章 {spec.title}</span>
        <strong>{session.placed.length}/{par} 线 · {score} 分</strong>
      </div>
      <div className="constellation-rule">
        <span>{spec.title}</span>
        <small>{spec.detail}</small>
        {spec.mistakeLimit && <em>失误 {session.mistakes}/{spec.mistakeLimit}</em>}
        {budget !== undefined && <em>预算 {session.placedCount}/{budget}</em>}
      </div>
      <div className="constellation-sky" style={{ '--sky-cols': sky.cols, '--sky-rows': sky.rows } as CSSProperties}>
        {Array.from({ length: sky.cols * sky.rows }, (_, cell) => {
          const slot = starSlots.get(cell)
          if (slot === undefined) return <i key={cell} className="constellation-void" aria-hidden="true" />
          const degree = degrees[slot]
          const clue = clues[slot]
          const east = cell % sky.cols < sky.cols - 1 && starSlots.has(cell + 1) && linked(cell, cell + 1)
          const south = Math.floor(cell / sky.cols) < sky.rows - 1 && starSlots.has(cell + sky.cols) && linked(cell, cell + sky.cols)
          const classes = [
            'constellation-star',
            session.selected === cell ? 'is-selected' : '',
            degree >= clue ? 'is-done' : degree > 0 ? 'is-partial' : '',
            session.failed ? 'is-lost' : complete ? 'is-won' : '',
          ].filter(Boolean).join(' ')
          return (
            <button
              key={cell}
              data-cell={cell}
              className={classes}
              onClick={() => pickStar(cell)}
              disabled={locked}
              aria-pressed={session.selected === cell}
              aria-label={`第${Math.floor(cell / sky.cols) + 1}行第${(cell % sky.cols) + 1}列星，连线 ${degree}/${clue}`}
            >
              {east && <i className="constellation-tie is-east" aria-hidden="true" />}
              {south && <i className="constellation-tie is-south" aria-hidden="true" />}
              <span className="constellation-core">{degree}/{clue}</span>
            </button>
          )
        })}
      </div>
      <div className="constellation-actions">
        <button className="constellation-restart" onClick={restart} disabled={locked}>
          <RotateCcw size={16} />重开本关
        </button>
      </div>
      <p className="constellation-live" aria-live="polite">{announce}</p>
      {complete && <div className="constellation-stamp is-won" role="status"><span>CONSTELLATION DONE</span><strong>星座归位 · {score} 分</strong></div>}
      {session.failed && <div className="constellation-stamp is-lost" role="status"><span>STARS COLLAPSED</span><strong>{spec.mistakeLimit && session.mistakes >= spec.mistakeLimit ? '失误过多' : '预算耗尽'} · {failedScore(session.placedCount, session.mistakes, par)} 分</strong></div>}
    </div>
  )
}
