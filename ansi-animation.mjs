import { setTimeout } from 'timers/promises'

const colors = [
  '\x1b[31m', // red
  '\x1b[32m', // green
  '\x1b[33m', // yellow
  '\x1b[34m', // blue
  '\x1b[35m', // magenta
  '\x1b[36m'  // cyan
]

const reset = '\x1b[0m'

const frames = [
  '⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'
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
