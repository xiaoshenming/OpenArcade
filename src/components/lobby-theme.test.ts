import { describe, expect, it } from 'vitest'
import { getLobbyAccent } from './lobby-theme'

function whiteContrast(color: string) {
  const values = color.match(/\d+/g)!.map(Number).map((value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2]
  return 1.05 / (luminance + 0.05)
}

describe('lobby accent', () => {
  it('derives an AA-safe action color from arbitrary manifest accents', () => {
    for (const accent of ['#ef476f', '#06a6a6', '#ffb000', '#ffffff', 'invalid']) {
      expect(whiteContrast(getLobbyAccent(accent))).toBeGreaterThanOrEqual(4.8)
    }
  })
})
