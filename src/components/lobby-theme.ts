const FALLBACK = [63, 72, 88]

function channels(hex: string) {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex)
  return match ? match.slice(1).map((value) => Number.parseInt(value, 16)) : FALLBACK
}

function luminance(values: number[]) {
  const linear = values.map((value) => {
    const channel = value / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

export function getLobbyAccent(hex: string) {
  let values = channels(hex)
  while (1.05 / (luminance(values) + 0.05) < 4.8) {
    values = values.map((value) => Math.round(value * 0.88))
  }
  return `rgb(${values.join(', ')})`
}
