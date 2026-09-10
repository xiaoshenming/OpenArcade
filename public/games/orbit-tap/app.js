const stage = document.querySelector('#stage')
const target = document.querySelector('#target')
const decoys = [...document.querySelectorAll('.decoy')]
const scoreElement = document.querySelector('#score')
const timeElement = document.querySelector('#time')
const levelElement = document.querySelector('#level')
const quotaElement = document.querySelector('#quota')
const modeElement = document.querySelector('#mode')
const ruleCopy = document.querySelector('#rule-copy')
const ruleState = document.querySelector('#rule-state')
const message = document.querySelector('#message')
const messageTitle = message.querySelector('strong')
const messageCopy = message.querySelector('span')
let score = 0
let time = 0
let hits = 0
let strikes = 0
let streak = 0
let level = 1
let timer
let moveTimer
let paused = false
let ended = false
let config = OpenArcadeOrbit.getLevel(1)
let generators = []

const audioCues = {
  hit: { type: 'triangle', notes: [660, 880], gain: .06, stepMs: 55 },
  decoy: { type: 'sawtooth', notes: [130, 98], gain: .05, stepMs: 90 },
  win: { type: 'triangle', notes: [523, 659, 784], gain: .06, stepMs: 95 },
  lose: { type: 'sine', notes: [330, 247], gain: .05, stepMs: 120 },
  tick: { type: 'square', notes: [1040], gain: .03, stepMs: 45 }
}
let audioContext = null
let muted = false

function ensureAudio() {
  if (audioContext || muted) return audioContext
  const constructor = window.AudioContext || window.webkitAudioContext
  if (!constructor) return null
  try {
    audioContext = new constructor()
  } catch {
    audioContext = null
  }
  return audioContext
}

function playCue(cue) {
  if (muted) return
  const audio = ensureAudio()
  if (!audio) return
  const spec = audioCues[cue]
  spec.notes.forEach((frequency, index) => {
    const oscillator = audio.createOscillator()
    const envelope = audio.createGain()
    const start = audio.currentTime + index * spec.stepMs / 1000
    const end = start + spec.stepMs / 1000 + .05
    oscillator.type = spec.type
    oscillator.frequency.value = frequency
    envelope.gain.setValueAtTime(.0001, start)
    envelope.gain.exponentialRampToValueAtTime(spec.gain, start + .012)
    envelope.gain.exponentialRampToValueAtTime(.0001, end)
    oscillator.connect(envelope).connect(audio.destination)
    oscillator.start(start)
    oscillator.stop(end + .02)
  })
}

const sdk = globalThis.OpenArcade.createSdk({ onCommand(command) {
  if (command.type === 'load-level') start(command.level)
  if (command.type === 'restart' || command.type === 'start') start(level)
  if (command.type === 'pause') setPaused(true)
  if (command.type === 'resume') setPaused(false)
  if (command.type === 'mute') muted = Boolean(command.muted)
} })

function setPaused(nextPaused) {
  if (nextPaused && !paused) {
    const entities = [target, ...decoys].filter((element) => !element.hidden)
    const positions = entities.map((element) => {
      const style = getComputedStyle(element)
      return { element, left: style.left, top: style.top }
    })
    stage.classList.add('is-paused')
    positions.forEach(({ element, left, top }) => { element.style.left = left; element.style.top = top })
  } else if (!nextPaused) stage.classList.remove('is-paused')
  paused = nextPaused
}

function placeElement(element, generator, size, occupied) {
  const padTop = 118
  const pad = 16
  const width = Math.max(1, stage.clientWidth - size - pad * 2)
  const height = Math.max(1, stage.clientHeight - size - padTop - pad)
  let position
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const point = generator()
    position = { left: pad + point.x * width, top: padTop + point.y * height, size }
    const clear = occupied.every((item) => Math.hypot(position.left - item.left, position.top - item.top) > (size + item.size) * .65)
    if (clear) break
  }
  element.style.left = position.left + 'px'
  element.style.top = position.top + 'px'
  occupied.push(position)
}

function placeAll() {
  const occupied = []
  placeElement(target, generators[0], config.size, occupied)
  decoys.forEach((decoy, index) => {
    const visible = index < config.decoys
    decoy.hidden = !visible
    if (visible) placeElement(decoy, generators[index + 1], Math.max(48, config.size - 4), occupied)
  })
}

function updateHud() {
  scoreElement.textContent = String(score).padStart(4, '0')
  timeElement.textContent = String(time).padStart(2, '0')
  levelElement.textContent = String(level).padStart(2, '0')
  quotaElement.textContent = hits + '/' + config.quota
  modeElement.textContent = config.title
  ruleCopy.textContent = config.detail
  const strikeText = config.decoys ? '失误 ' + strikes + '/3' : ''
  const comboText = config.combo ? '连击 ×' + Math.max(1, streak) : ''
  ruleState.textContent = [strikeText, comboText].filter(Boolean).join(' · ') || (config.lifetime ? (config.lifetime / 1000).toFixed(1) + 's 跳点' : '命中后移动')
}

function finish(completed) {
  if (ended) return
  ended = true
  playCue(completed ? 'win' : 'lose')
  clearInterval(timer)
  clearInterval(moveTimer)
  target.hidden = true
  decoys.forEach((decoy) => { decoy.hidden = true })
  message.hidden = false
  messageTitle.textContent = completed ? '节拍完成' : strikes >= 3 ? '干扰过载' : '时间到'
  messageCopy.textContent = completed ? '新关卡已解锁' : '观察规则，再挑战一次'
  if (completed) sdk.complete(score)
  else sdk.fail(score)
}

function start(nextLevel) {
  clearInterval(timer)
  clearInterval(moveTimer)
  level = Math.min(30, Math.max(1, Number(nextLevel) || 1))
  config = OpenArcadeOrbit.getLevel(level)
  generators = [0, 1, 2, 3].map((stream) => OpenArcadeOrbit.createPositionGenerator(level, stream))
  score = 0
  hits = 0
  strikes = 0
  streak = 0
  time = config.duration
  paused = false
  ended = false
  stage.dataset.mode = config.mode
  stage.dataset.drift = String(config.drift)
  stage.classList.remove('is-paused')
  target.style.width = config.size + 'px'
  target.style.height = config.size + 'px'
  message.hidden = true
  target.hidden = false
  updateHud()
  placeAll()
  sdk.started()
  timer = setInterval(() => {
    if (paused || ended) return
    time -= 1
    updateHud()
    if (time <= 0) finish(false)
    else if (time <= 5) playCue('tick')
  }, 1000)
  if (config.lifetime) moveTimer = setInterval(() => {
    if (paused || ended) return
    if (config.combo) streak = 0
    placeAll()
    updateHud()
  }, config.lifetime)
}

target.addEventListener('click', () => {
  if (paused || ended || target.hidden) return
  playCue('hit')
  hits += 1
  streak = config.combo ? streak + 1 : 0
  const multiplier = config.combo ? Math.min(5, streak) : 1
  score = Math.min(10000, score + (100 + level * 3) * multiplier)
  updateHud()
  sdk.score(score)
  if (hits >= config.quota) finish(true)
  else placeAll()
})

decoys.forEach((decoy) => decoy.addEventListener('click', () => {
  if (paused || ended || decoy.hidden) return
  playCue('decoy')
  strikes += 1
  streak = 0
  time = Math.max(0, time - config.penalty)
  score = Math.max(0, score - 75)
  updateHud()
  sdk.score(score)
  if (strikes >= 3 || time <= 0) finish(false)
  else placeAll()
}))

sdk.ready()
