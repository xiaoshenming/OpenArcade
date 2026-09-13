import { useEffect, useMemo, useState } from 'react'
import { Beaker, Blend, Crown, Droplet, Droplets, FlaskConical, Layers, RotateCcw, Waves } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { applyDrop, BOTTLES, bottleChannel, cssColor, sameColor, scoreFor, STEP, type HueLevel, type Rgb } from './logic'
import { createHueLevel, getHueSpec } from './levels'
import './hue-blend.css'

const MODE_ICONS: Record<string, typeof Droplet> = { tint: Droplet, blend: Blend, press: Layers, stream: Waves, gauntlet: Crown }
const CHANNEL_LETTER: Record<string, string> = { r: 'R', g: 'G', b: 'B' }
const CHANNEL_WORD: Record<string, string> = { r: '红', g: '绿', b: '蓝' }

export default function HueBlendGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(60, Math.max(1, Math.floor(level)))
  const spec = useMemo(() => getHueSpec(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [data] = useState<HueLevel>(() => createHueLevel(levelNumber))
  const [mix, setMix] = useState<Rgb>(() => ({ ...data.start }))
  const [steps, setSteps] = useState(0)
  const [unit, setUnit] = useState(1)
  const [found, setFound] = useState<string[]>([])
  const [splash, setSplash] = useState('')
  const [over, setOver] = useState<'win' | 'lose' | null>(null)

  useEffect(() => {
    audio.setMuted(muted)
  }, [audio, muted])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  useEffect(() => {
    if (!splash) return
    const timer = window.setTimeout(() => setSplash(''), 360)
    return () => window.clearTimeout(timer)
  }, [splash])

  const spend = (nextSteps: number) => {
    setSteps(nextSteps)
    emit({ type: 'score', score: scoreFor(nextSteps, data.par) })
    if (nextSteps >= data.budget) {
      setOver('lose')
      audio.play('lose')
      emit({ type: 'failed', score: scoreFor(nextSteps, data.par) })
    }
  }

  const drop = (key: string) => {
    if (paused || over) return
    if (data.duds.includes(key)) {
      if (!found.includes(key)) setFound([...found, key])
      setSplash(key)
      audio.play('mismatch')
      spend(steps + 1)
      return
    }
    const next = applyDrop(mix, key, unit)
    if (!next) {
      setSplash(key)
      audio.play('mismatch')
      return
    }
    const nextSteps = steps + 1
    const solved = sameColor(next, data.target)
    const settled = next[bottleChannel(key)] === data.target[bottleChannel(key)]
    setMix(next)
    setSplash(key)
    audio.play(solved ? 'win' : settled ? 'match' : 'step')
    if (solved) {
      setSteps(nextSteps)
      setOver('win')
      emit({ type: 'score', score: scoreFor(nextSteps, data.par) })
      emit({ type: 'completed', score: scoreFor(nextSteps, data.par) })
      return
    }
    spend(nextSteps)
  }

  const chooseUnit = (value: number) => {
    if (paused || over) return
    setUnit(value)
    audio.play('select')
  }

  const Icon = MODE_ICONS[spec.mode] ?? FlaskConical
  const hot = steps >= data.budget - 1
  return (
    <div className={`hue-game mode-${spec.mode}`} aria-label="流光调色游戏区">
      <div className={`hue-readout ${hot ? 'is-hot' : ''}`}>
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 参考 {data.par} 滴</span>
        <strong>{steps} / {data.budget} 步</strong>
      </div>
      <div className="hue-rule">
        <span><Icon size={14} />{spec.title}</span>
        <small>{spec.detail}</small>
        {data.droplets.length > 1 && <em>滴量 ×1/×5</em>}
      </div>
      <div className="hue-stage">
        <div className="hue-flask" aria-label={`烧杯当前 rgb(${mix.r}, ${mix.g}, ${mix.b})`}>
          <span className="hue-pool" style={{ background: cssColor(mix), boxShadow: `0 0 22px ${cssColor(mix)}` } as React.CSSProperties} />
          <span className="hue-nums">
            {(['r', 'g', 'b'] as const).map((channel) => (
              <i key={channel} data-channel={channel}>{CHANNEL_LETTER[channel]} {mix[channel]}</i>
            ))}
          </span>
          <small><Beaker size={12} />烧杯</small>
        </div>
        <div className="hue-flask is-goal" aria-label={`目标 rgb(${data.target.r}, ${data.target.g}, ${data.target.b})`}>
          <span className="hue-pool" style={{ background: cssColor(data.target), boxShadow: `0 0 22px ${cssColor(data.target)}` } as React.CSSProperties} />
          <span className="hue-nums">
            {(['r', 'g', 'b'] as const).map((channel) => {
              const gap = data.target[channel] - mix[channel]
              return <i key={channel} data-channel={channel}>{gap === 0 ? '✓' : `${gap > 0 ? '+' : '−'}${Math.abs(gap)}`} {data.target[channel]}</i>
            })}
          </span>
          <small><Droplets size={12} />目标</small>
        </div>
      </div>
      <div className="hue-bottles" role="toolbar" aria-label="色瓶架">
        {BOTTLES.map((key) => {
          const channel = bottleChannel(key)
          const exposed = found.includes(key)
          return (
            <button
              key={key}
              data-channel={channel}
              data-sign={key[0]}
              className={`hue-bottle ${splash === key ? 'is-splash' : ''} ${exposed ? 'is-dud' : ''}`}
              aria-label={`${key[0] === '+' ? '加' : '减'}${CHANNEL_WORD[channel]}瓶，每滴${key[0] === '+' ? '加' : '减'}${STEP * unit}${exposed ? '，已识破哑瓶' : ''}`}
              onClick={() => drop(key)}
            >
              <b>{key[0] === '+' ? `+${CHANNEL_WORD[channel]}` : `−${CHANNEL_WORD[channel]}`}</b>
              <small>{key[0] === '+' ? `+${STEP * unit}` : `−${STEP * unit}`}</small>
            </button>
          )
        })}
      </div>
      {data.droplets.length > 1 && (
        <div className="hue-units" role="radiogroup" aria-label="每次滴量">
          {data.droplets.map((value) => (
            <button key={value} className={`hue-unit ${unit === value ? 'is-active' : ''}`} aria-pressed={unit === value} onClick={() => chooseUnit(value)}>
              ×{value} 滴
            </button>
          ))}
        </div>
      )}
      {over === 'win' && <div className="hue-banner is-win">调色完成！</div>}
      {over === 'lose' && <div className="hue-banner is-lose">步数用尽，再试一次</div>}
      <button className="hue-restart" onClick={() => emit({ type: 'request-restart' })}><RotateCcw size={17} />重开本关</button>
    </div>
  )
}
