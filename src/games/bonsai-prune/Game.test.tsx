import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GameEvent } from '../../platform/types'
import BonsaiPruneGame from './Game'
import { getBonsaiLevel } from './levels'

afterEach(cleanup)

const chipInfo = (level: number) => {
  const view = render(<BonsaiPruneGame sessionKey={1} paused={false} muted emit={vi.fn()} level={level} />)
  const chips = [...view.container.querySelectorAll('.leaf-chip')] as HTMLElement[]
  const info = chips.map((chip) => ({
    className: chip.className,
    title: chip.getAttribute('title') ?? '',
    text: chip.textContent ?? '',
    reveal: chip.querySelector('.leaf-chip-reveal')?.textContent ?? null,
  }))
  view.unmount()
  return info
}

const ariaFor = (level: number) => {
  const spec = getBonsaiLevel(level)
  const id = spec.cuts[0]
  const node = spec.nodes[id]
  return node.leaf ? `剪断第 ${node.leafNo} 片叶的枝` : `剪断枝干 ${id + 1}`
}

describe('bonsai target chips', () => {
  it('renders shuffled chips where fog and dead leaves share one veiled style', () => {
    const level = 40
    const spec = getBonsaiLevel(level)
    expect(spec.fog.length).toBeGreaterThan(0)
    const chips = chipInfo(level)
    expect(chips).toHaveLength(spec.leaves.length)
    // chip 顺序为确定性洗牌，位置不再泄露叶号
    const numbers = chips.map((chip) => Number(chip.title.replace(/\D/g, '')))
    expect(numbers).not.toEqual(Array.from({ length: numbers.length }, (_, index) => index + 1))
    expect(numbers.sort((a, b) => a - b)).toEqual(Array.from({ length: numbers.length }, (_, index) => index + 1))
    // 雾叶与死叶同为 is-veiled 雾样式，只有 hover/点击后经 reveal 揭示叶号
    const foggedKept = chips.find((chip) => chip.title === `雾隐叶 ${spec.fog[0]}`)
    const deadNo = Array.from({ length: spec.leaves.length }, (_, index) => index + 1)
      .find((leafNo) => !spec.target.includes(leafNo))!
    const dead = chips.find((chip) => chip.title === `雾隐叶 ${deadNo}`)
    const keptNo = spec.target.find((leafNo) => !spec.fog.includes(leafNo))!
    const kept = chips.find((chip) => chip.title === `保留叶 ${keptNo}`)
    for (const veiled of [foggedKept, dead]) {
      expect(veiled).toBeDefined()
      expect(veiled!.className).toContain('is-veiled')
      expect(veiled!.className).not.toContain('is-kept')
      expect(veiled!.text).toContain('🌫')
      expect(veiled!.reveal).toBe(veiled!.title.replace(/\D/g, ''))
    }
    expect(foggedKept!.className).toBe(dead!.className)
    expect(kept!.className).toContain('is-kept')
    expect(kept!.text).toBe(String(keptNo))
  })
})

describe('bonsai falling animation', () => {
  it('suspends the fall cleanup timer while paused and resumes it after', () => {
    vi.useFakeTimers()
    try {
      const emit = vi.fn<(event: GameEvent) => void>()
      const props = { sessionKey: 1, muted: true, emit, level: 1 }
      const view = render(<BonsaiPruneGame {...props} paused={false} />)
      fireEvent.click(view.getByRole('button', { name: ariaFor(1) }))
      expect(document.querySelector('.bonsai-tree li.is-falling')).not.toBeNull()

      view.rerender(<BonsaiPruneGame {...props} paused />)
      act(() => { vi.advanceTimersByTime(1200) })
      expect(document.querySelector('.bonsai-tree li.is-falling')).not.toBeNull()

      view.rerender(<BonsaiPruneGame {...props} paused={false} />)
      act(() => { vi.advanceTimersByTime(560) })
      expect(document.querySelector('.bonsai-tree li.is-falling')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips the falling animation entirely when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    try {
      const emit = vi.fn<(event: GameEvent) => void>()
      const view = render(<BonsaiPruneGame sessionKey={1} paused={false} muted emit={emit} level={1} />)
      fireEvent.click(view.getByRole('button', { name: ariaFor(1) }))
      expect(document.querySelector('.bonsai-tree li.is-falling')).toBeNull()
    } finally {
      vi.unstubAllGlobals()
      cleanup()
    }
  })
})
