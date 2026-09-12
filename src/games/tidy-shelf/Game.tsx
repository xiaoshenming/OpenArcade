import { useEffect, useMemo, useState } from 'react'
import { Crown, Layers, RefreshCw, RotateCcw, Snowflake, Sparkles } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { isShelfTidy, SIZE_DOTS, swapAdjacent, TYPE_GLYPHS, sizeOf, typeOf, type TidyMode } from './logic'
import { createTidyLevel, getTidySpec } from './levels'
import './tidy-shelf.css'

const MODE_ICONS: Record<TidyMode, typeof Sparkles> = { classic: Sparkles, grouped: Layers, frozen: Snowflake, alternating: RefreshCw, gauntlet: Crown }
const scoreFor = (used: number, par: number) => Math.max(100, 1000 - Math.max(0, used - par) * 15)

export default function TidyShelfGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(60, Math.max(1, Math.floor(level)))
  const spec = useMemo(() => getTidySpec(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [data, setData] = useState(() => createTidyLevel(levelNumber))
  const [selected, setSelected] = useState<number | null>(null)
  const [swaps, setSwaps] = useState(0)
  const [pulse, setPulse] = useState<number[]>([])
  const [over, setOver] = useState<'win' | 'lose' | null>(null)

  useEffect(() => {
    audio.setMuted(muted)
  }, [audio, muted])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  useEffect(() => {
    if (!pulse.length) return
    const timer = window.setTimeout(() => setPulse([]), 340)
    return () => window.clearTimeout(timer)
  }, [pulse])

  const chooseItem = (index: number) => {
    if (paused || over) return
    if (data.frozen.includes(index)) {
      audio.play('mismatch')
      return
    }
    if (selected === null || selected === index) {
      if (selected === index) setSelected(null)
      else {
        setSelected(index)
        audio.play('select')
      }
      return
    }
    if (Math.abs(selected - index) !== 1) {
      setSelected(index)
      audio.play('select')
      return
    }
    const next = swapAdjacent(data.shelf, data.frozen, Math.min(selected, index))
    if (!next) {
      audio.play('mismatch')
      return
    }
    const nextSwaps = swaps + 1
    const nextTidy = isShelfTidy(next, data.counts, data.alternates)
    setData({ ...data, shelf: next })
    setSwaps(nextSwaps)
    setSelected(null)
    setPulse([selected, index])
    audio.play(nextTidy ? 'match' : 'step')
    emit({ type: 'score', score: scoreFor(nextSwaps, data.par) })
    if (nextTidy) {
      setOver('win')
      audio.play('win')
      emit({ type: 'completed', score: scoreFor(nextSwaps, data.par) })
      return
    }
    if (nextSwaps >= data.budget) {
      setOver('lose')
      audio.play('lose')
      emit({ type: 'failed', score: scoreFor(nextSwaps, data.par) })
    }
  }

  const Icon = MODE_ICONS[spec.mode]
  const hot = swaps >= data.budget - 1
  return (
    <div className={`shelf-game mode-${spec.mode}`} aria-label="收纳小筑游戏区">
      <div className={`shelf-readout ${hot ? 'is-hot' : ''}`}>
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 参考 {data.par} 步</span>
        <strong>{swaps} / {data.budget} 次交换</strong>
      </div>
      <div className="shelf-rule">
        <span><Icon size={14} />{spec.title}</span>
        <small>{spec.detail}</small>
        {spec.alternates && <em>{TYPE_GLYPHS[spec.alternates[0]]}⇄{TYPE_GLYPHS[spec.alternates[1]]}</em>}
        {data.frozen.length > 0 && <em>❄×{data.frozen.length}</em>}
      </div>
      <div className="shelf-target" aria-label="目标排列">
        <small>目标</small>
        {data.target.map((item) => <i key={item} data-type={typeOf(item)}>{TYPE_GLYPHS[typeOf(item)]}</i>)}
      </div>
      <div className="shelf-board">
        {data.shelf.map((item, index) => {
          const isFrozen = data.frozen.includes(index)
          const adjacent = selected !== null && selected !== index && Math.abs(selected - index) === 1
          return (
            <button
              key={item}
              className={`shelf-slot ${selected === index ? 'is-selected' : ''} ${adjacent ? 'is-adjacent' : ''} ${isFrozen ? 'is-frozen' : ''} ${pulse.includes(index) ? 'is-pulsing' : ''}`}
              style={{ '--scale': 0.7 + sizeOf(item) * 0.15 } as React.CSSProperties}
              data-type={typeOf(item)}
              aria-disabled={isFrozen}
              aria-pressed={selected === index}
              aria-label={`格子 ${index + 1}：${TYPE_GLYPHS[typeOf(item)]} ${['小', '中', '大', '特大'][sizeOf(item)]}${isFrozen ? '，已冻结' : ''}`}
              onClick={() => chooseItem(index)}
            >
              <span className="shelf-item">{TYPE_GLYPHS[typeOf(item)]}</span>
              <span className="shelf-size">{SIZE_DOTS[sizeOf(item)]}</span>
              {isFrozen && <span className="shelf-frost">❄</span>}
            </button>
          )
        })}
      </div>
      {over === 'win' && <div className="shelf-banner is-win">收纳完成！</div>}
      {over === 'lose' && <div className="shelf-banner is-lose">预算耗尽，再试一次</div>}
      <button className="shelf-restart" onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={17} />重开本关</button>
    </div>
  )
}
