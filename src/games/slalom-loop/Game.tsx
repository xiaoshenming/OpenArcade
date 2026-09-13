import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactElement } from 'react'
import { RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio, type GameAudio } from '../../platform/game-audio'
import { edgeTotal, failedScore, hEdgeAt, loopOrder, scoreFor, vEdgeAt, validateLoop } from './logic'
import { createSlalomPuzzle, getSlalomLevel, hasClosedLoop, LEVEL_COUNT } from './levels'
import './slalom-loop.css'

interface BoardProps {
  paused: boolean
  audio: GameAudio
  emit: (event: GameEvent) => void
  level: ReturnType<typeof getSlalomLevel>
}

type DragMode = 'draw' | 'erase'

export default function SlalomLoopGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const audio = useMemo(() => createGameAudio(), [])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])
  return <SlalomBoard key={levelNumber} paused={paused} audio={audio} emit={emit} level={getSlalomLevel(levelNumber)} />
}

function SlalomBoard({ paused, audio, emit, level }: BoardProps) {
  const puzzle = useMemo(() => createSlalomPuzzle(level.level), [level.level])
  const { cols, rows } = level
  const [marks, setMarks] = useState<boolean[]>(() => new Array<boolean>(edgeTotal(cols, rows)).fill(false))
  const [mistakes, setMistakes] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [failed, setFailed] = useState(false)
  const [done, setDone] = useState(false)
  const [announce, setAnnounce] = useState('')
  const drag = useRef<DragMode | null>(null)
  const score = scoreFor(elapsed, mistakes, level.par)
  const locked = paused || failed || done

  useEffect(() => {
    if (paused || failed || done) return
    const timer = window.setInterval(() => setElapsed((current) => current + 1), 1000)
    return () => window.clearInterval(timer)
  }, [paused, failed, done])

  useEffect(() => {
    if (elapsed <= level.par || failed || done || paused) return
    emit({ type: 'score', score })
  }, [done, elapsed, emit, failed, level.par, paused, score])

  const blankMarks = () => new Array<boolean>(edgeTotal(cols, rows)).fill(false)

  const applyEdge = (edge: number, mode: DragMode) => {
    if (locked || marks[edge] === (mode === 'draw')) return
    const next = [...marks]
    next[edge] = mode === 'draw'
    const on = next.reduce<number[]>((list, onEdge, index) => (onEdge ? [...list, index] : list), [])
    if (!hasClosedLoop(on, cols, rows)) {
      audio.play(mode === 'draw' ? 'step' : 'select')
      emit({ type: 'score', score })
      setMarks(next)
      return
    }
    // Masyu 本就允许多解：闭环只要穿过全部圈示且逐枚满足直转弯规则即判胜，
    // 不再要求与存储解完全一致（评审方案 2 的「合法环即胜」）
    const order = loopOrder(on, cols, rows)
    if (order && validateLoop(order, puzzle.clues, cols, rows)) {
      setMarks(next)
      setDone(true)
      setAnnounce(`回环闭合！${score} 分`)
      audio.play('win')
      emit({ type: 'score', score })
      emit({ type: 'completed', score })
      return
    }
    const nextMistakes = mistakes + 1
    const collapsed = level.mistakeLimit !== undefined && nextMistakes >= level.mistakeLimit
    setMarks(blankMarks())
    setMistakes(nextMistakes)
    audio.play('mismatch')
    if (collapsed) {
      setFailed(true)
      setAnnounce(`闭环不合规则，失误 ${nextMistakes}/${level.mistakeLimit}，滑径崩塌`)
      emit({ type: 'failed', score: failedScore(elapsed, nextMistakes, level.par) })
      return
    }
    setAnnounce(`闭环不合规则，已清空，失误 ${nextMistakes}${level.mistakeLimit !== undefined ? `/${level.mistakeLimit}` : ''}`)
  }

  const onEdgeDown = (edge: number) => (event: PointerEvent<HTMLButtonElement>) => {
    const mode: DragMode = marks[edge] ? 'erase' : 'draw'
    drag.current = mode
    const target = event.currentTarget
    try {
      if (target.hasPointerCapture?.(event.pointerId)) target.releasePointerCapture(event.pointerId)
    } catch {
      // jsdom 及部分环境无指针捕获，可忽略
    }
    applyEdge(edge, mode)
  }

  useEffect(() => {
    const stop = () => { drag.current = null }
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [])

  const restart = () => {
    audio.play('select')
    setMarks(blankMarks())
    setMistakes(0)
    setElapsed(0)
    setFailed(false)
    setDone(false)
    setAnnounce('重新开始')
  }

  const items: ReactElement[] = []
  for (let row = 0; row < 2 * rows + 1; row += 1) {
    for (let col = 0; col < 2 * cols + 1; col += 1) {
      const key = `${row}:${col}`
      const cellRow = Math.floor(row / 2)
      const cellCol = Math.floor(col / 2)
      if (row % 2 === 0 && col % 2 === 0) {
        items.push(<i key={key} className="slalom-node" aria-hidden="true" />)
      } else if (row % 2 === 1 && col % 2 === 1) {
        const clue = puzzle.clues[cellRow * cols + cellCol]
        items.push(
          <div
            key={key}
            className="slalom-cell"
            role="img"
            aria-label={clue > 0 ? `第${cellRow + 1}行第${cellCol + 1}列${clue === 2 ? '黑圈' : '白圈'}` : undefined}
          >
            {clue > 0 && <span className={`slalom-clue ${clue === 2 ? 'is-black' : 'is-white'}`} aria-hidden="true" />}
          </div>,
        )
      } else if (row % 2 === 1) {
        if (col === 0 || col === 2 * cols) {
          items.push(<i key={key} className="slalom-node" aria-hidden="true" />)
          continue
        }
        const edge = hEdgeAt(cellRow, col / 2 - 1, cols)
        items.push(
          <button
            key={key}
            type="button"
            className={`slalom-edge is-h${marks[edge] ? ' is-on' : ''}`}
            disabled={locked}
            aria-label={`第${cellRow + 1}行第${col / 2}格右侧连线${marks[edge] ? '，已画' : '，空'}`}
            onPointerDown={onEdgeDown(edge)}
            onPointerEnter={() => { if (drag.current) applyEdge(edge, drag.current) }}
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
              if (event.key === 'Enter' || event.key === ' ') applyEdge(edge, marks[edge] ? 'erase' : 'draw')
            }}
          />,
        )
      } else {
        if (row === 0 || row === 2 * rows) {
          items.push(<i key={key} className="slalom-node" aria-hidden="true" />)
          continue
        }
        const edge = vEdgeAt(row / 2 - 1, cellCol, cols, rows)
        items.push(
          <button
            key={key}
            type="button"
            className={`slalom-edge is-v${marks[edge] ? ' is-on' : ''}`}
            disabled={locked}
            aria-label={`第${row / 2}行第${cellCol + 1}格下侧连线${marks[edge] ? '，已画' : '，空'}`}
            onPointerDown={onEdgeDown(edge)}
            onPointerEnter={() => { if (drag.current) applyEdge(edge, drag.current) }}
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
              if (event.key === 'Enter' || event.key === ' ') applyEdge(edge, marks[edge] ? 'erase' : 'draw')
            }}
          />,
        )
      }
    }
  }

  return (
    <div className={`slalom-game chapter-${level.chapter}`} aria-label="回环滑径游戏区">
      <div className="slalom-readout">
        <span>关卡 {String(level.level).padStart(2, '0')} · 第{level.chapter}章 {level.title}</span>
        <strong>{cols}×{rows} · {elapsed}s / par {level.par}s · {score} 分</strong>
      </div>
      <div className="slalom-rule">
        <span>{level.title}</span>
        <small>{level.detail}</small>
        <em>失误 {mistakes}{level.mistakeLimit !== undefined ? `/${level.mistakeLimit}` : ''}</em>
      </div>
      <div
        className="slalom-board"
        style={{ gridTemplateColumns: `repeat(${cols * 2 + 1}, 1fr)`, gridTemplateRows: `repeat(${rows * 2 + 1}, 1fr)`, aspectRatio: `${cols * 2 + 1} / ${rows * 2 + 1}` } as CSSProperties}
      >
        {items}
      </div>
      <div className="slalom-pad">
        <button className="slalom-key" type="button" disabled={locked} onClick={restart}>
          <RotateCcw size={15} />重开
        </button>
      </div>
      <p className="slalom-live" aria-live="polite">{announce}</p>
      {failed && <div className="slalom-banner is-failed">失误过多，滑径崩塌</div>}
      {done && <div className="slalom-banner is-complete">回环闭合！{score} 分</div>}
    </div>
  )
}
