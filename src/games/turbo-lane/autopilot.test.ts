import { describe, expect, it } from 'vitest'
import { PLAYER_HALF, START_LIVES, SWITCH_COOLDOWN, step, type GameState, type InputState } from './logic'
import { LEVEL_COUNT, createTurboState } from './levels'

const FRAME = 1 / 60
const FRAME_BUDGET = 12000
const SWITCH_REACH = 0.55
const FORCED = 0.9
const GAIN = 1.35

const idle: InputState = { left: false, right: false, throttle: false }
const contact = (half: number) => half + PLAYER_HALF

// 车道的「下次碰撞时间」：min(净距 / 相对速度)。玩家最快，威胁只来自前方。
function timeToContact(state: GameState, lane: number): number {
  let best = Infinity
  for (const car of state.cars) {
    if (car.lane !== lane || car.y <= -contact(car.half)) continue
    const closing = Math.max(1, state.base - car.speed)
    best = Math.min(best, (car.y - contact(car.half)) / closing)
  }
  return best
}

const behindClear = (state: GameState, lane: number) => {
  for (const car of state.cars) {
    if (car.lane === lane && car.y <= 0 && Math.abs(car.y) - contact(car.half) < 8) return false
  }
  return true
}

// 贪心自动驾驶：以「下次碰撞时间」评估车道——当前车道时间过短(FORCED)或邻道时间明显
// 更充裕(GAIN 倍)时切换；目标车道必须自身留有 SWITCH_REACH 秒且后方无贴身车。
// 变道后遵守 0.22s 冷却。全程不踩油门。
export function autopilot(level: number): GameState {
  let state = createTurboState(level)
  let cooldown = 0
  for (let frame = 0; frame < FRAME_BUDGET && state.status === 'playing'; frame += 1) {
    const input: InputState = { ...idle }
    if (cooldown <= 0) {
      // 上限 6s：空车道不应是 Infinity，否则任何收益比较都会失效、bot 永远不换道。
      const times = [0, 1, 2].map((lane) => Math.min(timeToContact(state, lane), 6))
      let best = 0
      for (const lane of [1, 2]) if (times[lane] > times[best]) best = lane
      if (best !== state.lane) {
        const dir = best > state.lane ? 1 : -1
        const nextLane = state.lane + dir
        const forced = times[state.lane] < FORCED
        const eager = times[best] > times[state.lane] * GAIN
        const gain = times[nextLane] > times[state.lane] * 1.15
        if (times[nextLane] > SWITCH_REACH && behindClear(state, nextLane) && (forced || eager || gain)) {
          input[dir > 0 ? 'right' : 'left'] = true
          cooldown = SWITCH_COOLDOWN
        }
      }
    }
    cooldown = Math.max(0, cooldown - FRAME)
    state = step(state, input, FRAME)
  }
  return state
}

describe('turbo lane autopilot fairness', () => {
  it('greedy driver survives all sixty levels and reaches the distance quota', () => {
    const doomed: string[] = []
    let totalLost = 0
    for (let level = 1; level <= LEVEL_COUNT; level += 1) {
      const end = autopilot(level)
      const lost = START_LIVES - end.lives
      totalLost += lost
      if (end.status !== 'cleared' || lost > 2) doomed.push(`L${level}:${end.status}:-${lost}:${Math.floor(end.distance)}/${end.quota}`)
      expect(end.status, `level ${level} ended as ${end.status}`).toBe('cleared')
      expect(end.distance, `level ${level} only reached ${Math.floor(end.distance)}`).toBeGreaterThanOrEqual(end.quota)
      expect(lost, `level ${level} lost ${lost} lives`).toBeLessThanOrEqual(2)
    }
    expect(doomed, `unfair levels: ${doomed.join(', ')}`).toEqual([])
    expect(totalLost, `total lives lost ${totalLost} across sixty levels`).toBeLessThanOrEqual(40)
  })

  it('drives a level deterministically from a fixed seed', () => {
    expect(JSON.stringify(autopilot(30))).toBe(JSON.stringify(autopilot(30)))
    expect(autopilot(30).status).toBe('cleared')
  }, 30000)
})
