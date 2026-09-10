(() => {
  const patterns = [
    ['tap','初识星点','命中后目标才会移动',0,0,0], ['hop','限时跳点','光环结束时目标会跳走',1,0,0], ['chase','追光移动','目标持续滑向新位置',1,0,1], ['avoid','真假星点','避开干扰点，三次失误即失败',1,1,0], ['combo','连击节拍','连续命中提高倍率',1,0,0],
    ['hop','短促跳点','跳点节奏开始加快',1,0,0], ['chase','长弧追光','观察滑行方向再出手',1,0,1], ['hybrid','追光辨真','追逐真星，避开一个干扰点',1,1,1], ['hybrid','移动连击','移动目标也要保持连击',1,0,1], ['hybrid','轨迹终考','追光、干扰与连击同时出现',1,1,1],
    ['avoid','单星干扰','先辨认实心目标',1,1,0], ['avoid','双星干扰','两个干扰点封锁路线',1,2,0], ['hybrid','跳点辨真','目标跳走时仍要避开干扰',1,1,0], ['hybrid','追光迷阵','移动真星混入双重干扰',1,2,1], ['hybrid','辨真连击','避开双重干扰并维持连击',1,2,0],
    ['combo','连击起步','连续命中建立倍率',1,0,0], ['combo','限时连击','跳点会打断连击节奏',2,0,0], ['hybrid','追光连击','滑动目标考验连续命中',1,0,1], ['hybrid','干扰连击','干扰点会清空倍率并累计失误',1,1,0], ['hybrid','连击终考','追光、干扰、连击三项并行',1,1,1],
    ['hybrid','双扰跳点','在双干扰中追赶跳点',2,2,0], ['hybrid','双扰追光','移动真星穿越双重干扰',1,2,1], ['hybrid','辨真高连','双重干扰下保持倍率',1,2,0], ['hybrid','高速迷阵','快速追光与双重干扰结合',2,2,1], ['hybrid','混合试炼','跳点、追光、干扰与连击结合',2,2,1],
    ['hybrid','终局·追光','高速目标进入终局轨道',2,1,1], ['hybrid','终局·迷阵','三重干扰压缩判断空间',2,3,0], ['hybrid','终局·连击','追光与双重干扰下保持高连',2,2,1], ['hybrid','终局·风暴','最快跳点混合三重干扰',3,3,1], ['hybrid','星域主宰','全部机制同时进入最高强度',3,3,1],
  ]

  function getLevel(level) {
    const numeric = Number.isFinite(Number(level)) ? Math.floor(Number(level)) : 1
    const safe = Math.min(30, Math.max(1, numeric))
    const [mode, title, detail, pace, decoys, drift] = patterns[safe - 1]
    const band = Math.floor((safe - 1) / 5)
    const combo = mode === 'combo' || mode === 'hybrid' && [9,10,15,19,20,23,25,28,29,30].includes(safe)
    return Object.freeze({
      level: safe, chapter: band + 1, mode, title, detail, duration: 18 + Math.min(7, band),
      quota: 4 + Math.ceil(safe * .42), size: Math.max(52, 78 - Math.floor((safe - 1) / 3) * 3),
      lifetime: pace ? Math.max(720, 2350 - band * 190 - pace * 240) : 0,
      decoys, drift: Boolean(drift), combo, penalty: 1 + Math.floor(band / 2), seed: (safe * 2654435761) >>> 0,
    })
  }

  function createPositionGenerator(level, stream = 0) {
    let value = (getLevel(level).seed ^ Math.imul(stream + 1, 0x9e3779b1)) >>> 0
    return () => {
      const coordinate = () => {
        value += 0x6d2b79f5
        let next = value
        next = Math.imul(next ^ (next >>> 15), next | 1)
        next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
        return ((next ^ (next >>> 14)) >>> 0) / 4294967296
      }
      return { x: coordinate(), y: coordinate() }
    }
  }

  globalThis.OpenArcadeOrbit = Object.freeze({ getLevel, createPositionGenerator })
})()
