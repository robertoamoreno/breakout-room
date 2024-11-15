import { setTimeout } from 'timers/promises'

const colors = [
  '\x1b[31m', // red
  '\x1b[32m', // green
  '\x1b[33m', // yellow
  '\x1b[34m', // blue
  '\x1b[35m', // magenta
  '\x1b[36m'  // cyan
]

const backgrounds = [
  '\x1b[40m', // black
  '\x1b[41m', // red
  '\x1b[42m', // green
  '\x1b[44m', // blue
  '\x1b[45m', // magenta
  '\x1b[46m'  // cyan
]

const reset = '\x1b[0m'

const frames = [
  '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'
]

const connectMessages = [
  '🔗 Connected!',
  '✨ Peer joined!',
  '👋 Welcome!',
  '🚀 Ready to chat!',
  '🎉 New friend!'
]

export async function* createAnimation() {
  let i = 0
  while (true) {
    const color = colors[i % colors.length]
    const frame = frames[i % frames.length]
    yield `${color}${frame}${reset}`
    i++
    await setTimeout(100)
  }
}

export function getRandomConnectMessage() {
  const color = colors[Math.floor(Math.random() * colors.length)]
  const bg = backgrounds[Math.floor(Math.random() * backgrounds.length)]
  const msg = connectMessages[Math.floor(Math.random() * connectMessages.length)]
  return `${color}${bg}${msg}${reset}`
}
