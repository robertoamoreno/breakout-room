#!/usr/bin/env node
import { BreakoutRoom } from './index.mjs'
import { createAnimation, getRandomConnectMessage } from './ansi-animation.mjs'

const invite = process.argv[2]

async function run () {
  const room = new BreakoutRoom({ invite })
  const hostInvite = await room.ready()
  if (hostInvite) console.log('Give out invite:', hostInvite)

  // send room messages from standard in
  process.stdin.on('data', async (data) => {
    const message = data.toString().trim()
    if (message) {
      await room.message({
        type: 'text',
        content: message,
        hasAnsi: message.includes('\x1b[')
      })
    }
  })

  room.on('peerEntered', async (peerKey) => {
    console.log('peer entered the room', peerKey)
    const animation = createAnimation()
    const connectMsg = getRandomConnectMessage()
    const startTime = Date.now()
    for await (const frame of animation) {
      process.stdout.write(`\r${frame} ${connectMsg}`)
      if (Date.now() - startTime > 3000) {
        process.stdout.write('\n')
        break
      }
    }
  })
  room.on('peerLeft', async (peerKey) => {
    console.log('peer left the room', peerKey)
    await room.exit()
    process.exit(0)
  })

  room.on('message', async (m) => {
    if (m.data && m.data.type === 'text') {
      const prefix = `${m.who}: `
      console.log(prefix + m.data.content)
    }
  })

  let inShutdown = false
  const shutdown = async () => {
    if (inShutdown) return
    inShutdown = true
    await room.exit()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
run()
