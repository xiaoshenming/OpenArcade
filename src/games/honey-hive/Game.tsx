import { useEffect, useMemo, useState } from 'react'
import { Bug, Crown, Hexagon, Layers, RotateCcw, Sigma, Sparkles, Timer } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { cellKey, isSolved, placeConflicts, ringSums, ringTotals, scoreFor, type HiveLevel } from './logic'
import { createHiveLevel, getHiveSpec } from './levels'
import './honey-hive.css'

const MODE_ICONS: Record<string, typeof Sparkles> = { flow: Sparkles, honey: Layers, guard: Bug, delta: Sigma, gauntlet: Crown }

export default function HoneyHiveGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(60, Math.max(1, Math.floor(level)))
  const spec = useMemo(() => getHiveSpec(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [data] = useState<HiveLevel>(() => createHiveLevel(levelNumber))
  const [fills, setFills] = useState<Record<string, number>>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [mistakes, setMistakes] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [shake, setShake] = useState('')
  const [over, setOver] = useState<'win' | 'lose' | null>(null)

  useEffect(() => {
    audio.setMuted(muted)
  }, [audio, muted])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  useEffect(() => {
    if (paused || over) return
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [paused, over])

  useEffect(() => {
    if (!shake) return
    const timer = window.setTimeout(() => setShake(''), 420)
    return () => window.clearTimeout(timer)
  }, [shake])

  const targets = useMemo(() => ringSums(data.clues), [data])
  const hex = data.radius >= 4 ? 19 : data.radius === 3 ? 25 : 34

  const pour = (value: number) => {
    if (paused || over || !selected || data.givens[selected]) return
    if (fills[selected] === value) {
      setSelected(null)
      return
    }
    if (placeConflicts(data, fills, selected, value)) {
      const nextMistakes = mistakes + 1
      setMistakes(nextMistakes)
      setShake(selected)
      audio.play('mismatch')
      emit({ type: 'score', score: scoreFor(nextMistakes, seconds, data.par) })
      if (data.budget !== null && nextMistakes > data.budget) {
        setOver('lose')
        audio.play('lose')
        emit({ type: 'failed', score: scoreFor(nextMistakes, seconds, data.par) })
      }
      return
    }
    const next = { ...fills, [selected]: value }
    const totals = ringTotals(data, next)
    const ring = data.ringIndex[selected]
    const complete = totals[ring].filled === data.rings[ring].length && totals[ring].sum === targets[ring]
    setFills(next)
    audio.play(complete ? 'match' : 'step')
    emit({ type: 'score', score: scoreFor(mistakes, seconds, data.par) })
    if (isSolved(data, next)) {
      setOver('win')
      audio.play('win')
      emit({ type: 'completed', score: scoreFor(mistakes, seconds, data.par) })
    }
  }

  const pickCell = (key: string) => {
    if (paused || over) return
    if (data.givens[key]) {
      audio.play('mismatch')
      return
    }
    setSelected(key === selected ? null : key)
    audio.play('select')
  }

  const wipe = () => {
    if (paused || over || !selected || data.givens[selected] || !fills[selected]) return
    const next = { ...fills }
    delete next[selected]
    setFills(next)
    audio.play('select')
  }

  const Icon = MODE_ICONS[spec.mode] ?? Sparkles
  const litRing = selected !== null ? data.ringIndex[selected] : -1
  const hot = data.budget !== null && mistakes >= data.budget
  return (
    <div className={`hive-game mode-${spec.mode}`} aria-label="蜂巢酿蜜游戏区">
      <div className={`hive-readout ${hot ? 'is-hot' : ''}`}>
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 时限 {data.par}s</span>
        <strong><Timer size={12} /> {seconds}s · 失误 {mistakes}{data.budget !== null ? ` / ${data.budget}` : ''}</strong>
      </div>
      <div className="hive-rule">
        <span><Icon size={14} />{spec.title}</span>
        <small>{spec.detail}</small>
        <em>半径 {data.radius}</em>
      </div>
      <div className="hive-clues" aria-label="环带线索">
        {data.clues.map((clue, index) =>
          index === 0 ? null : (
            <span key={index} className={`hive-clue ${litRing === index ? 'is-lit' : ''} ${clue.kind === 'delta' ? 'is-delta' : ''}`}>
              环{index} {clue.kind === 'sum' ? `Σ ${clue.value}` : `Δ ${clue.value > 0 ? '+' : ''}${clue.value}`}
            </span>
          ),
        )}
      </div>
      <div
        className="hive-board"
        style={{ '--hex': `${hex}px`, width: `${Math.round(Math.sqrt(3) * hex * (2 * data.radius + 1.6))}px`, height: `${Math.round(hex * (3 * data.radius + 2.6))}px` } as React.CSSProperties}
        aria-label={`半径 ${data.radius} 的蜂巢盘`}
      >
        {data.cells.map((cell) => {
          const key = cellKey(cell)
          const given = data.givens[key]
          const value = given ?? fills[key]
          const x = Math.sqrt(3) * hex * (cell.q + cell.r / 2)
          const y = 1.5 * hex * cell.r
          return (
            <button
              key={key}
              className={`hive-cell ${given ? 'is-given' : ''} ${!given && fills[key] ? 'is-filled' : ''} ${selected === key ? 'is-selected' : ''} ${shake === key ? 'is-shake' : ''} ${litRing === data.ringIndex[key] ? 'is-lit' : ''}`}
              style={{ left: `calc(50% + ${Math.round(x)}px)`, top: `calc(50% + ${Math.round(y)}px)` } as React.CSSProperties}
              aria-pressed={selected === key}
              aria-disabled={!!given}
              aria-label={`蜂格 ${key}：${given ? `蜂房线索 ${given}` : fills[key] ? `花蜜 ${fills[key]}` : '空格'}`}
              onClick={() => pickCell(key)}
            >
              {value ? <span>{value}</span> : <i />}
            </button>
          )
        })}
      </div>
      <div className="hive-pad" role="toolbar" aria-label="花蜜量">
        {[1, 2, 3, 4, 5, 6].map((value) => (
          <button key={value} className="hive-pour" disabled={over !== null || !selected} onClick={() => pour(value)}>{value}</button>
        ))}
        <button className="hive-wipe" disabled={over !== null} onClick={wipe}><Hexagon size={13} />除净</button>
      </div>
      {over === 'win' && <div className="hive-banner is-win">酿蜜完成！</div>}
      {over === 'lose' && <div className="hive-banner is-lose">发酵过头，再试一次</div>}
      <button className="hive-restart" onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={17} />重开本关</button>
    </div>
  )
}
