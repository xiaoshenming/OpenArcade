const stage = document.querySelector('#stage')
const target = document.querySelector('#target')
const scoreElement = document.querySelector('#score')
const timeElement = document.querySelector('#time')
const message = document.querySelector('#message')
let score = 0
let time = 20
let timer
let paused = false

const sdk = globalThis.OpenArcade.createSdk({ onCommand(command) {
  if (command.type === 'restart' || command.type === 'start') start()
  if (command.type === 'pause') paused = true
  if (command.type === 'resume') paused = false
} })

function place() {
  const pad = 60
  target.style.left = pad + Math.random() * Math.max(1, stage.clientWidth - pad * 2 - 74) + 'px'
  target.style.top = pad + Math.random() * Math.max(1, stage.clientHeight - pad * 2 - 74) + 'px'
}

function start() {
  clearInterval(timer)
  score = 0
  time = 20
  paused = false
  scoreElement.textContent = '000'
  timeElement.textContent = '20'
  message.hidden = true
  target.hidden = false
  place()
  sdk.started()
  timer = setInterval(() => {
    if (paused) return
    time -= 1
    timeElement.textContent = String(time).padStart(2, '0')
    if (time <= 0) {
      clearInterval(timer)
      target.hidden = true
      message.hidden = false
      sdk.complete(score)
    }
  }, 1000)
}

target.addEventListener('click', () => {
  if (paused) return
  score += 10
  scoreElement.textContent = String(score).padStart(3, '0')
  sdk.score(score)
  place()
})

sdk.ready()
start()
