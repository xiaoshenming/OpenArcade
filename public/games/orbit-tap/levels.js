(() => {
  function getLevel(level) {
    const safe = Math.min(30, Math.max(1, Math.floor(level)))
    const band = Math.floor((safe - 1) / 5)
    return Object.freeze({
      level: safe,
      duration: Math.max(12, 20 - band),
      quota: 4 + safe,
      size: 74 - band * 6,
      lifetime: 1500 - band * 150,
      seed: (safe * 2654435761) >>> 0,
    })
  }

  function createPositionGenerator(level) {
    let value = getLevel(level).seed
    return () => {
      value += 0x6d2b79f5
      let next = value
      next = Math.imul(next ^ (next >>> 15), next | 1)
      next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
      const x = ((next ^ (next >>> 14)) >>> 0) / 4294967296
      value += 0x6d2b79f5
      next = value
      next = Math.imul(next ^ (next >>> 15), next | 1)
      next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
      const y = ((next ^ (next >>> 14)) >>> 0) / 4294967296
      return { x, y }
    }
  }

  globalThis.OpenArcadeOrbit = Object.freeze({ getLevel, createPositionGenerator })
})()
