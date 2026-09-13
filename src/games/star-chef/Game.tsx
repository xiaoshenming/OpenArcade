import { useEffect, useMemo, useState } from 'react'
import { Bell, ChefHat, ConciergeBell, Crown, Layers, RotateCcw, Soup, Sparkles, Utensils } from 'lucide-react'
import type { GameModuleProps } from '../../platform/types'
import { createGameAudio } from '../../platform/game-audio'
import { canAdd, countUses, FLAVORS, gapState, gapTrio, plateSum, sameTrio, scoreFor, type ChefLevel, type Flavor, type Trio } from './logic'
import { createChefLevel, getChefSpec } from './levels'
import './star-chef.css'

const FLAVOR_LABEL: Record<Flavor, string> = { sweet: '甜', spicy: '辣', umami: '鲜' }
const MODE_ICONS: Record<string, typeof Soup> = { taste: Sparkles, recipe: Utensils, ration: Layers, crowd: Bell, gauntlet: Crown }

interface Round {
  readonly data: ChefLevel
  readonly plate: readonly number[]
  readonly dish: number
  readonly clicks: number
  readonly adds: number
  readonly mistakes: number
  readonly over: 'win' | 'lose' | null
}

const freshRound = (levelNumber: number): Round => ({ data: createChefLevel(levelNumber), plate: [], dish: 0, clicks: 0, adds: 0, mistakes: 0, over: null })

const TrioChips = ({ trio }: { trio: Trio }) => (
  <span className="chef-trio">
    {FLAVORS.map((flavor) => (
      <i key={flavor} data-flavor={flavor}>{FLAVOR_LABEL[flavor]}{trio[flavor]}</i>
    ))}
  </span>
)

export default function StarChefGame({ paused, muted, emit, level = 1 }: GameModuleProps) {
  const levelNumber = Math.min(60, Math.max(1, Math.floor(level)))
  const spec = useMemo(() => getChefSpec(levelNumber), [levelNumber])
  const audio = useMemo(() => createGameAudio(), [])
  const [rounds, setRounds] = useState<Record<number, Round>>(() => ({ [levelNumber]: freshRound(levelNumber) }))
  const round = useMemo(() => rounds[levelNumber] ?? freshRound(levelNumber), [rounds, levelNumber])

  const update = (next: Round) => setRounds((prev) => ({ ...prev, [levelNumber]: next }))

  useEffect(() => {
    audio.setMuted(muted)
  }, [audio, muted])

  useEffect(() => {
    emit({ type: 'ready' })
    emit({ type: 'started' })
  }, [emit])

  const dish = round.data.dishes[Math.min(round.dish, round.data.dishes.length - 1)]
  const par = round.data.dishes.reduce((sum, item) => sum + item.par, 0)
  const sum = plateSum(round.data.shelf, round.plate)
  const state = gapState(dish.target, sum)
  const gap = gapTrio(dish.target, sum)
  const hot = round.clicks >= round.data.budget - 1 || round.mistakes >= round.data.lives - 1

  const settle = (next: Round) => {
    const final = scoreFor(next.adds, par, next.mistakes)
    if (next.over === 'lose') {
      audio.play('lose')
      emit({ type: 'score', score: final })
      emit({ type: 'failed', score: final })
      return
    }
    if (next.over === 'win') {
      audio.play('win')
      emit({ type: 'score', score: final })
      emit({ type: 'completed', score: final })
      return
    }
    emit({ type: 'score', score: final })
  }

  const toggle = (id: number) => {
    if (paused || round.over) return
    const picked = round.plate.includes(id)
    if (!picked && !canAdd(round.data.shelf, round.plate, id)) {
      audio.play('mismatch')
      return
    }
    const plate = picked ? round.plate.filter((item) => item !== id) : [...round.plate, id]
    const raw = { ...round, plate, clicks: round.clicks + 1, adds: round.adds + (picked ? 0 : 1) }
    const exact = sameTrio(plateSum(raw.data.shelf, raw.plate), dish.target)
    const next: Round = { ...raw, over: !exact && raw.clicks >= raw.data.budget ? 'lose' : null }
    update(next)
    audio.play(picked ? 'select' : 'step')
    settle(next)
  }

  const serve = () => {
    if (paused || round.over) return
    if (!sameTrio(sum, dish.target)) {
      const mistakes = round.mistakes + 1
      const next: Round = { ...round, mistakes, over: mistakes >= round.data.lives ? 'lose' : null }
      audio.play('mismatch')
      update(next)
      settle(next)
      return
    }
    const last = round.dish + 1 >= round.data.dishes.length
    const next: Round = { ...round, plate: [], dish: round.dish + 1, over: last ? 'win' : null }
    update(next)
    settle(next)
  }

  const restart = () => {
    if (paused) return
    update(freshRound(levelNumber))
    audio.play('select')
  }

  const Icon = MODE_ICONS[spec.mode] ?? Soup
  return (
    <div className={`chef-game mode-${spec.mode}`} aria-label="星厨配餐游戏区">
      <div className={`chef-readout ${hot ? 'is-hot' : ''}`}>
        <span>关卡 {String(levelNumber).padStart(2, '0')} · 参考 {par} 种 · 命 {round.data.lives - round.mistakes}/{round.data.lives}</span>
        <strong>{round.clicks} / {round.data.budget} 步</strong>
      </div>
      <div className="chef-rule">
        <span><Icon size={14} />{spec.title}</span>
        <small>{spec.detail}</small>
        <em>第 {Math.min(round.dish + 1, round.data.dishes.length)}/{round.data.dishes.length} 道</em>
      </div>
      <div className="chef-board">
        <div className={`chef-target is-${state}`} aria-label={`菜谱目标 甜${dish.target.sweet} 辣${dish.target.spicy} 鲜${dish.target.umami}`}>
          <small><ChefHat size={12} />菜谱目标</small>
          <TrioChips trio={dish.target} />
          <span className="chef-gap" data-state={state}>
            {FLAVORS.map((flavor) => (
              <i key={flavor} data-flavor={flavor}>{gap[flavor] === 0 ? '✓' : gap[flavor] > 0 ? `缺${gap[flavor]}` : `超${-gap[flavor]}`}</i>
            ))}
          </span>
          <small><Soup size={12} />盘中</small>
          <TrioChips trio={sum} />
        </div>
        <div className="chef-shelf" role="listbox" aria-label="食材架">
          {round.data.shelf.map((item) => {
            const uses = countUses(round.plate, item.id)
            const out = uses >= item.limit
            return (
              <button
                key={item.id}
                role="option"
                aria-selected={uses > 0}
                className={`chef-item ${uses > 0 ? 'is-picked' : ''} ${out ? 'is-out' : ''}`}
                aria-label={`${item.name}：甜${item.trio.sweet} 辣${item.trio.spicy} 鲜${item.trio.umami}${item.limit > 1 ? `，可取${item.limit}次` : ''}${uses > 0 ? '，已在盘中' : ''}`}
                onClick={() => toggle(item.id)}
                disabled={paused || !!round.over}
              >
                <b>{item.name}</b>
                <TrioChips trio={item.trio} />
                <small>{item.limit > 1 ? `×${item.limit - uses}` : uses > 0 ? '已用' : '可用'}</small>
              </button>
            )
          })}
        </div>
      </div>
      <div className="chef-tools" role="toolbar" aria-label="后厨工具">
        <button className="chef-serve" onClick={serve} disabled={paused || !!round.over}>
          <ConciergeBell size={16} />上菜 · 第 {Math.min(round.dish + 1, round.data.dishes.length)} 道
        </button>
        <button className="chef-clear" onClick={() => { if (!paused && !round.over && round.plate.length) { update({ ...round, plate: [], clicks: round.clicks + 1 }); audio.play('select'); settle({ ...round, plate: [], clicks: round.clicks + 1 }) } }} disabled={paused || !round.plate.length || !!round.over}>
          清空案板
        </button>
      </div>
      {round.over === 'win' && <div className="chef-banner is-win">星宴上齐！</div>}
      {round.over === 'lose' && <div className="chef-banner is-lose">后厨失手，再试一次</div>}
      <button className="chef-restart" onClick={restart} disabled={paused}><RotateCcw size={17} />重开本关</button>
    </div>
  )
}
