import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Flag, RotateCcw } from 'lucide-react'
import type { GameEvent, GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { evaluatePaths, horizontalEdge, LIVES, scoreFor, verticalEdge, wallCount, type PathStatus } from './logic'
import { createLacePuzzle, getLaceLevel, LEVEL_COUNT, type LaceLevel, type LacePuzzle } from './levels'
import './maze-lace.css'

interface Session {
  walls: number[]
  lives: number
  failed: boolean
  solved: boolean
}

const freshSession = (presets: readonly number[], total: number): Session => {
  const walls = new Array<number>(total).fill(0)
  presets.forEach((id) => { walls[id] = 1 })
  return { walls, lives: LIVES, failed: false, solved: false }
}

const statusCopy: Record<PathStatus, string> = {
  solved: '已唯一 · 长度正确',
  offlength: '已唯一 · 长度不符',
  multiple: '多条通路',
  blocked: '起点不通',
}

export default function MazeLaceGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(LEVEL_COUNT, Math.max(1, Math.floor(level) || 1))
  const rule = getLaceLevel(levelNumber)
  const puzzle = useMemo(() => createLacePuzzle(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  useEffect(() => audio.setMuted(muted), [audio, muted])

  return <LaceBoard key={levelNumber} paused={paused} audio={audio} emit={emit} rule={rule} puzzle={puzzle} />
}

interface BoardProps {
  paused: boolean
  audio: ReturnType<typeof createGameAudio>
  emit: (event: GameEvent) => void
  rule: LaceLevel
  puzzle: LacePuzzle
}

function LaceBoard({ paused, audio, emit, rule, puzzle }: BoardProps) {
  const { rows, cols } = rule
  const edges = rows * (cols - 1) + (rows - 1) * cols
  const [session, setSession] = useState<Session>(() => freshSession(puzzle.presets, edges))
  const [announce, setAnnounce] = useState('')
  const presetSet = useMemo(() => new Set(puzzle.presets), [puzzle.presets])
  const budget = rule.slack === undefined ? undefined : puzzle.par + rule.slack
  const placed = wallCount(session.walls)
  const verdict = useMemo(
    () => evaluatePaths(session.walls, rows, cols, puzzle.start, puzzle.goal, puzzle.targetLen),
    [cols, puzzle.goal, puzzle.start, puzzle.targetLen, rows, session.walls],
  )
  const settled = session.failed || session.solved
  const score = scoreFor(placed, puzzle.par)

  const toggle = useCallback((edge: number) => {
    if (paused || settled) return
    if (presetSet.has(edge)) {
      audio.play('mismatch')
      setAnnounce('预埋经线不可拆除')
      return
    }
    const walls = [...session.walls]
    if (walls[edge]) {
      walls[edge] = 0
      audio.play('select')
    } else {
      if (budget !== undefined && wallCount(walls) >= budget) {
        audio.play('mismatch')
        setAnnounce(`墙数预算 ${budget} 已用尽，先拆一道墙`)
        return
      }
      walls[edge] = 1
      audio.play('step')
    }
    setSession({ ...session, walls })
    emit({ type: 'score', score: scoreFor(wallCount(walls), puzzle.par) })
  }, [audio, budget, emit, paused, presetSet, puzzle.par, settled, session])

  const submit = () => {
    if (paused || settled) return
    const total = scoreFor(placed, puzzle.par)
    if (verdict.status === 'solved') {
      audio.play('win')
      setAnnounce(`蕾丝成络！唯一路径长度 ${puzzle.targetLen}，${total} 分`)
      setSession({ ...session, solved: true })
      emit({ type: 'completed', score: total })
      return
    }
    const lives = session.lives - 1
    const reason = verdict.status === 'blocked' ? '起点已不通' : verdict.status === 'multiple' ? '仍有多条通路' : `唯一路径长度 ${verdict.length} ≠ ${puzzle.targetLen}`
    if (lives <= 0) {
      audio.play('lose')
      setSession({ ...session, lives: 0, failed: true })
      setAnnounce(`校验失败：${reason}，织机停摆`)
      emit({ type: 'failed', score: total })
      return
    }
    audio.play('mismatch')
    setSession({ ...session, lives })
    setAnnounce(`校验失败：${reason}，余命 ${lives}`)
  }

  const restart = () => {
    audio.play('select')
    setSession(freshSession(puzzle.presets, edges))
    setAnnounce('')
  }

  const track = (n: number) => `repeat(${n - 1}, var(--lace-cell) var(--lace-edge)) var(--lace-cell)`
  const tiles = []
  for (let trackRow = 0; trackRow < rows * 2 - 1; trackRow += 1) {
    for (let trackCol = 0; trackCol < cols * 2 - 1; trackCol += 1) {
      if (trackRow % 2 === 0 && trackCol % 2 === 0) {
        const cell = (trackRow / 2) * cols + trackCol / 2
        tiles.push(
          <div key={`c${cell}`} className={`lace-cell ${cell === puzzle.start ? 'is-start' : ''} ${cell === puzzle.goal ? 'is-goal' : ''}`}>
            {cell === puzzle.start ? <strong>{puzzle.targetLen}</strong> : null}
            {cell === puzzle.goal ? <Flag size={15} /> : null}
          </div>,
        )
        continue
      }
      if (trackRow % 2 === 0 && trackCol % 2 === 1) {
        const edge = verticalEdge(trackRow / 2, (trackCol - 1) / 2, cols)
        tiles.push(
          <button
            key={`e${edge}`}
            className={`lace-edge ${session.walls[edge] ? 'is-wall' : ''} ${presetSet.has(edge) ? 'is-preset' : ''}`}
            data-orient="v"
            aria-pressed={session.walls[edge] === 1}
            aria-disabled={presetSet.has(edge)}
            aria-label={`第${trackRow / 2 + 1}行第${(trackCol + 1) / 2}列右侧墙缝${session.walls[edge] ? '，有墙' : ''}${presetSet.has(edge) ? '，预埋' : ''}`}
            disabled={paused || settled}
            onClick={() => toggle(edge)}
          />,
        )
        continue
      }
      if (trackRow % 2 === 1 && trackCol % 2 === 0) {
        const edge = horizontalEdge((trackRow - 1) / 2, trackCol / 2, rows, cols)
        tiles.push(
          <button
            key={`e${edge}`}
            className={`lace-edge ${session.walls[edge] ? 'is-wall' : ''} ${presetSet.has(edge) ? 'is-preset' : ''}`}
            data-orient="h"
            aria-pressed={session.walls[edge] === 1}
            aria-disabled={presetSet.has(edge)}
            aria-label={`第${(trackRow + 1) / 2}行第${trackCol / 2 + 1}列下方墙缝${session.walls[edge] ? '，有墙' : ''}${presetSet.has(edge) ? '，预埋' : ''}`}
            disabled={paused || settled}
            onClick={() => toggle(edge)}
          />,
        )
        continue
      }
      tiles.push(<span key={`d${trackRow}-${trackCol}`} className="lace-dot" />)
    }
  }

  return (
    <div className={`lace-game mode-${rule.mode}`} aria-label="迷径铺陈游戏区">
      <div className="lace-readout">
        <span>关卡 {String(rule.level).padStart(2, '0')} · 第{rule.chapter}章</span>
        <strong>墙 {placed}{budget !== undefined ? ` / ${budget}` : ''} · 参考 {puzzle.par} · {score} 分 · 命 {session.lives}/{LIVES}</strong>
      </div>
      <div className="lace-rule">
        <span>{rule.title}</span>
        <small>{rule.detail}</small>
        <em className={`lace-status is-${verdict.status}`}>{statusCopy[verdict.status]}</em>
      </div>
      <div className="lace-board" style={{ gridTemplateColumns: track(cols), gridTemplateRows: track(rows) } as CSSProperties}>
        {tiles}
      </div>
      <div className="lace-actions">
        <button className="lace-submit" disabled={paused || settled} onClick={submit}>提交校验</button>
        <button className="lace-restart" disabled={paused || settled} onClick={restart}>
          <RotateCcw size={16} />重开本关
        </button>
      </div>
      <p className="lace-live" aria-live="polite">{announce}</p>
      {(session.solved || session.failed) && (
        <div className="lace-stamp" role="status">
          <span>{session.solved ? 'LACE COMPLETE' : 'LOOM JAMMED'}</span>
          <strong>{session.solved ? `唯一路径 ${puzzle.targetLen} 步 · ${score} 分` : `织机停摆 · ${score} 分`}</strong>
          <button className="lace-again" onClick={restart}><RotateCcw size={15} />再来一次</button>
        </div>
      )}
    </div>
  )
}
