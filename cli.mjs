#!/usr/bin/env node
import { BreakoutRoom } from './index.mjs'
import { createAnimation } from './ansi-animation.mjs'

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
    // Show animation for 3 seconds
    for await (const frame of animation) {
      process.stdout.write(`\r${frame} New peer connected!`)
      if (Date.now() - Date.now() > 3000) break
    }
    process.stdout.write('\n')
  })
  room.on('peerLeft', async (peerKey) => {
    console.log('peer left the room', peerKey)
    await room.exit()
    process.exit(0)
  })

  room.on('message', async (m) => {
    if (m.data && m.data.type === 'text') {
      const prefix = `${m.who}: `
      if (m.data.hasAnsi) {
        console.log(prefix + m.data.content)
      } else {
        console.log(prefix + m.data.content)
      }
    }
    const transcript = await room.getTranscript()
    console.log('Transcript:', transcript)
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
