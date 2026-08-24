const stage = document.querySelector('#stage')
const target = document.querySelector('#target')
const scoreElement = document.querySelector('#score')
const timeElement = document.querySelector('#time')
const levelElement = document.querySelector('#level')
const quotaElement = document.querySelector('#quota')
const message = document.querySelector('#message')
const messageTitle = message.querySelector('strong')
const messageCopy = message.querySelector('span')
let score = 0
let time = 0
let hits = 0
let level = 1
let timer
let moveTimer
let paused = false
let config = OpenArcadeOrbit.getLevel(1)
let nextPosition = OpenArcadeOrbit.createPositionGenerator(1)

const sdk = globalThis.OpenArcade.createSdk({ onCommand(command) {
  if (command.type === 'load-level') start(command.level)
  if (command.type === 'restart' || command.type === 'start') start(level)
  if (command.type === 'pause') paused = true
  if (command.type === 'resume') paused = false
} })

function place() {
  const point = nextPosition()
  const padTop = 72
  const pad = 16
  const width = Math.max(1, stage.clientWidth - config.size - pad * 2)
  const height = Math.max(1, stage.clientHeight - config.size - padTop - pad)
  target.style.left = pad + point.x * width + 'px'
  target.style.top = padTop + point.y * height + 'px'
}

function updateHud() {
  scoreElement.textContent = String(score).padStart(4, '0')
  timeElement.textContent = String(time).padStart(2, '0')
  levelElement.textContent = String(level).padStart(2, '0')
  quotaElement.textContent = hits + '/' + config.quota
}

function finish(completed) {
  clearInterval(timer)
  clearInterval(moveTimer)
  target.hidden = true
  message.hidden = false
  messageTitle.textContent = completed ? '节拍完成' : '时间到'
  messageCopy.textContent = completed ? '新关卡已解锁' : '重新挑战这一关'
  if (completed) sdk.complete(score)
  else sdk.fail(score)
}

function start(nextLevel) {
  clearInterval(timer)
  clearInterval(moveTimer)
  level = Math.min(30, Math.max(1, Number(nextLevel) || 1))
  config = OpenArcadeOrbit.getLevel(level)
  nextPosition = OpenArcadeOrbit.createPositionGenerator(level)
  score = 0
  hits = 0
  time = config.duration
  paused = false
  target.style.width = config.size + 'px'
  target.style.height = config.size + 'px'
  message.hidden = true
  target.hidden = false
  updateHud()
  place()
  sdk.started()
  timer = setInterval(() => {
    if (paused) return
    time -= 1
    updateHud()
    if (time <= 0) finish(false)
  }, 1000)
  moveTimer = setInterval(() => { if (!paused) place() }, config.lifetime)
}

target.addEventListener('click', () => {
  if (paused || target.hidden) return
  hits += 1
  score = Math.min(10000, score + 100 + level * 5)
  updateHud()
  sdk.score(score)
  if (hits >= config.quota) finish(true)
  else place()
})

sdk.ready()
