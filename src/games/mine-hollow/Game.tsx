import { useEffect, useMemo, useRef, useState } from 'react'
import { Bomb, Flag, RotateCcw, Shovel, Sparkles, Timer } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { seedFor } from '../../platform/rng'
import { createBoard, primeBoard, revealAt, scoreFor, toggleFlag, type MineBoard } from './logic'
import { getMineLevel, MINE_LEVEL_COUNT, type MineLevelSpec } from './levels'
import './mine-hollow.css'

const CHAPTER_NAMES = ['一', '二', '三', '四', '五'] as const
const LONG_PRESS_MS = 430

const clock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

interface RoundProps {
  level: number
  spec: MineLevelSpec
  paused: boolean
  muted: boolean
  emit: GameModuleProps['emit']
}

function MineRound({ level, spec, paused, muted, emit }: RoundProps) {
  const audio = useMemo(() => createGameAudio(), [])
  const [board, setBoard] = useState<MineBoard>(() => createBoard(spec))
  const [tool, setTool] = useState<'dig' | 'flag'>('dig')
  const [elapsed, setElapsed] = useState(0)
  const [usedFlag, setUsedFlag] = useState(false)
  const anchor = useRef({ base: 0, at: null as number | null })
  const pressTimer = useRef<number | null>(null)
  const longFired = useRef(false)
  const running = board.phase === 'playing' && !paused

  useEffect(() => audio.setMuted(muted), [audio, muted])

  useEffect(() => {
    if (!running) return
    const cell = anchor.current
    cell.at = performance.now()
    const id = window.setInterval(() => {
      const now = performance.now()
      if (cell.at !== null) cell.base += now - cell.at
      cell.at = now
      setElapsed(cell.base)
    }, 100)
    return () => {
      if (cell.at !== null) {
        cell.base += performance.now() - cell.at
        cell.at = null
      }
      window.clearInterval(id)
    }
  }, [running])

  useEffect(() => () => {
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current)
  }, [])

  const act = (index: number, flag: boolean) => {
    if (paused || board.phase === 'won' || board.phase === 'lost') return
    if (flag) {
      const next = toggleFlag(board, index)
      if (next === board) return
      if (next.flags > board.flags) setUsedFlag(true)
      audio.play('select')
      setBoard(next)
      return
    }
    if (board.cells[index].flagged) return
    const primed = board.phase === 'idle' ? primeBoard(board, index, seedFor(level, index)) : board
    const next = revealAt(primed, index)
    if (next === primed) return
    const seconds = anchor.current.base / 1000
    if (next.phase === 'lost') {
      setElapsed(seconds * 1000)
      audio.play('lose')
      setBoard(next)
      emit({ type: 'failed', score: scoreFor(seconds, spec, usedFlag) })
      return
    }
    if (next.phase === 'won') {
      setElapsed(seconds * 1000)
      audio.play('win')
      setBoard(next)
      emit({ type: 'completed', score: scoreFor(seconds, spec, usedFlag) })
      return
    }
    audio.play('step')
    emit({ type: 'score', score: scoreFor(seconds, spec, usedFlag) })
    setBoard(next)
  }

  const cancelLongPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }
  const scheduleLongPress = (index: number) => {
    longFired.current = false
    cancelLongPress()
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null
      longFired.current = true
      act(index, true)
    }, LONG_PRESS_MS)
  }

  const ended = board.phase === 'won' || board.phase === 'lost'
  const safeTotal = spec.rows * spec.columns - spec.mines
  const revealedSafe = board.cells.reduce((sum, cell) => sum + (cell.revealed && !cell.mine ? 1 : 0), 0)

  return (
    <div className={`mine-game mode-${spec.mode}`} aria-label="扫雷秘境游戏区">
      <div className="mh-readout">
        <span>关卡 {String(level).padStart(2, '0')} · 第{CHAPTER_NAMES[spec.chapter - 1]}卷 {spec.title}</span>
        <strong>{spec.mines - board.flags} 雷 · 已开 {revealedSafe}/{safeTotal}{spec.timer ? ` · ${clock(elapsed)} / ${clock(spec.par * 1000)}` : ''}</strong>
      </div>
      <div className="mh-rule">
        <span>{spec.mode === 'hollow' ? <Sparkles size={14} /> : spec.timer ? <Timer size={14} /> : <Bomb size={14} />}{spec.title}</span>
        <small>{spec.detail}</small>
        {spec.flagBonus > 0 && <em className={usedFlag ? 'is-dim' : ''}>无旗 +{spec.flagBonus}</em>}
        <em>par {spec.par}s</em>
      </div>
      <div className={`mh-board ${ended ? 'is-ended' : ''}`} style={{ '--mh-cols': spec.columns } as React.CSSProperties}>
        {board.cells.map((cell, index) => {
          const boom = board.phase === 'lost' && board.opened[0] === index
          const glyph = cell.mine && ended ? '✸' : cell.flagged && !cell.revealed ? '⚑' : cell.revealed && cell.count > 0 ? String(cell.count) : ''
          return (
            <button
              key={index}
              className={`mh-cell ${cell.revealed ? 'is-revealed' : ''} ${cell.flagged ? 'is-flagged' : ''} ${boom ? 'is-boom' : ''} ${ended && cell.mine && !cell.flagged && !boom ? 'is-mine' : ''}`}
              data-count={cell.count}
              style={{ '--enter-index': index } as React.CSSProperties}
              onClick={() => {
                if (longFired.current) { longFired.current = false; return }
                act(index, tool === 'flag')
              }}
              onContextMenu={(event) => { event.preventDefault(); act(index, true) }}
              onPointerDown={() => scheduleLongPress(index)}
              onPointerUp={cancelLongPress}
              onPointerLeave={cancelLongPress}
              onPointerCancel={cancelLongPress}
              aria-label={cell.revealed ? `格子 ${index + 1}：${cell.mine ? '雷' : cell.count}` : cell.flagged ? `格子 ${index + 1}：已插旗` : `揭示格子 ${index + 1}`}
            >
              <span>{glyph}</span>
            </button>
          )
        })}
        {ended && (
          <div className="mh-stamp">
            <span>{board.phase === 'won' ? '秘境贯通' : '触雷崩塌'}</span>
            <strong>{board.phase === 'won' ? `+${scoreFor(elapsed / 1000, spec, usedFlag)}` : '再试一次'}</strong>
          </div>
        )}
      </div>
      <div className="mh-actions">
        <button className={`mh-tool ${tool === 'dig' ? 'is-active' : ''}`} onClick={() => setTool('dig')} aria-pressed={tool === 'dig'} title="揭示模式"><Shovel size={19} /><span>铲</span></button>
        <button className={`mh-tool ${tool === 'flag' ? 'is-active' : ''}`} onClick={() => setTool('flag')} aria-pressed={tool === 'flag'} title="插旗模式"><Flag size={19} /><span>旗</span></button>
        <button className="mh-restart" onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={18} /><span>重开本关</span></button>
      </div>
    </div>
  )
}

export default function MineHollowGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(MINE_LEVEL_COUNT, Math.max(1, Math.floor(Number(level) || 1)))
  const spec = useMemo(() => getMineLevel(levelNumber), [levelNumber])
  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])
  return <MineRound key={levelNumber} level={levelNumber} spec={spec} paused={paused} muted={muted} emit={emit} />
}
