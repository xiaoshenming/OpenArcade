import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Brush, Crown, Layers, RefreshCw, RotateCcw, RotateCw, Stamp } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { applyOp, diffCount, gridsEqual, paintOp, rotOp, type LoomDir, type LoomKind, type LoomLevel, type LoomOp } from './logic'
import { createLoomLevel, getLoomSpec } from './levels'
import './dream-loom.css'

interface ToolChip { key: string; kind: LoomKind; dir: LoomDir; label: string; icon: typeof Brush }
const TOOL_CHIPS: readonly ToolChip[] = [
  { key: 'paint', kind: 'paint', dir: 1, label: '画笔', icon: Brush },
  { key: 'row:1', kind: 'row', dir: 1, label: '行→', icon: ArrowRight },
  { key: 'row:-1', kind: 'row', dir: -1, label: '行←', icon: ArrowLeft },
  { key: 'col:1', kind: 'col', dir: 1, label: '列↓', icon: ArrowDown },
  { key: 'col:-1', kind: 'col', dir: -1, label: '列↑', icon: ArrowUp },
  { key: 'rot:1', kind: 'rot', dir: 1, label: '旋↻', icon: RotateCw },
  { key: 'rot:-1', kind: 'rot', dir: -1, label: '旋↺', icon: RotateCcw },
]
const MODE_ICONS: Record<string, typeof Brush> = { sketch: Stamp, weave: RefreshCw, dense: Layers, spin: RotateCw, gauntlet: Crown }
const scoreFor = (used: number, par: number) => Math.max(100, 1000 - Math.max(0, used - par) * 40)

export default function DreamLoomGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(60, Math.max(1, Math.floor(level)))
  const spec = useMemo(() => getLoomSpec(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [data, setData] = useState<LoomLevel>(() => createLoomLevel(levelNumber))
  const [tool, setTool] = useState('paint')
  const [uses, setUses] = useState(0)
  const [flash, setFlash] = useState<number[]>([])
  const [over, setOver] = useState<'win' | 'lose' | null>(null)
  const chips = useMemo(() => TOOL_CHIPS.filter((chip) => chip.kind === 'paint' || (chip.kind === 'rot' ? spec.tools.includes('rotate') : spec.tools.includes('shift'))), [spec.tools])

  useEffect(() => {
    audio.setMuted(muted)
  }, [audio, muted])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  useEffect(() => {
    if (!flash.length) return
    const timer = window.setTimeout(() => setFlash([]), 340)
    return () => window.clearTimeout(timer)
  }, [flash])

  const chooseTool = (key: string) => {
    if (paused || over) return
    setTool(key)
    audio.play('select')
  }

  const weaveCell = (row: number, col: number) => {
    if (paused || over) return
    const chip = chips.find((item) => item.key === tool) ?? chips[0]
    const op: LoomOp = chip.kind === 'paint' ? paintOp(row, col) : chip.kind === 'rot' ? rotOp(row, col, chip.dir) : chip.kind === 'row' ? { kind: 'row', row, col: 0, dir: chip.dir } : { kind: 'col', row: 0, col, dir: chip.dir }
    if (chip.kind === 'rot' && (row + 1 >= data.size || col + 1 >= data.size)) {
      audio.play('mismatch')
      return
    }
    const next = applyOp(data.start, op)
    if (gridsEqual(next, data.start)) {
      audio.play('mismatch')
      return
    }
    const nextUses = uses + 1
    const before = diffCount(data.start, data.target)
    const after = diffCount(next, data.target)
    const solved = gridsEqual(next, data.target)
    setData({ ...data, start: next })
    setUses(nextUses)
    setFlash([row * data.size + col])
    audio.play(solved ? 'win' : after < before ? 'match' : 'step')
    emit({ type: 'score', score: scoreFor(nextUses, data.par) })
    if (solved) {
      setOver('win')
      emit({ type: 'completed', score: scoreFor(nextUses, data.par) })
      return
    }
    if (nextUses >= data.quota) {
      setOver('lose')
      audio.play('lose')
      emit({ type: 'failed', score: scoreFor(nextUses, data.par) })
    }
  }

  const Icon = MODE_ICONS[spec.mode] ?? Stamp
  const hot = uses >= data.quota - 1
  return (
    <div className={`loom-game mode-${spec.mode}`} aria-label="织梦机游戏区">
      <div className={`loom-readout ${hot ? 'is-hot' : ''}`}>
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 参考 {data.par} 步</span>
        <strong>{uses} / {data.quota} 次工具</strong>
      </div>
      <div className="loom-rule">
        <span><Icon size={14} />{spec.title}</span>
        <small>{spec.detail}</small>
        <em>{data.size}×{data.size}</em>
      </div>
      <div className="loom-stage">
        <div className="loom-board" style={{ '--loom-size': data.size } as React.CSSProperties}>
          {data.start.map((line, row) => line.map((cell, col) => {
            const diff = cell !== data.target[row][col]
            return (
              <button
                key={`${row}-${col}`}
                className={`loom-cell ${cell ? 'is-filled' : ''} ${diff ? 'is-diff' : ''} ${flash.includes(row * data.size + col) ? 'is-flash' : ''}`}
                data-tool={tool.startsWith('rot') ? 'rot' : tool.startsWith('row') ? 'row' : tool.startsWith('col') ? 'col' : 'paint'}
                aria-label={`织格 ${row + 1},${col + 1}：${cell ? '有纱' : '空白'}${diff ? '，与目标不同' : ''}`}
                onClick={() => weaveCell(row, col)}
              />
            )
          }))}
        </div>
        <div className="loom-target" aria-label={`目标图案 ${data.size} 见方`}>
          <small>目标</small>
          <span className="loom-mini" style={{ '--loom-size': data.size } as React.CSSProperties}>
            {data.target.flatMap((line, row) => line.map((cell, col) => <i key={`${row}-${col}`} className={cell ? 'is-filled' : ''} />))}
          </span>
        </div>
      </div>
      <div className="loom-tools" role="toolbar" aria-label="织造工具">
        {chips.map((chip) => (
          <button key={chip.key} className={`loom-tool ${tool === chip.key ? 'is-active' : ''}`} onClick={() => chooseTool(chip.key)} aria-pressed={tool === chip.key}>
            <chip.icon size={15} /><span>{chip.label}</span>
          </button>
        ))}
      </div>
      {over === 'win' && <div className="loom-banner is-win">织梦完成！</div>}
      {over === 'lose' && <div className="loom-banner is-lose">配额用尽，再试一次</div>}
      <button className="loom-restart" onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={17} />重开本关</button>
    </div>
  )
}
