#!/usr/bin/env node
import { BreakoutRoom } from './index.mjs'
import { createAnimation, getRandomConnectMessage } from './ansi-animation.mjs'

const invite = process.argv[2]

import readline from 'readline'
import { MessageEncryption } from './encryption.mjs'

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

const question = (query) => new Promise((resolve) => rl.question(query, resolve))

async function run () {
  let password
  if (!invite) {
    // Host sets password
    password = await question('Set room password (or press enter for none): ')
  }
  
  const room = new BreakoutRoom({ invite, password })
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
    if (!m.data) return
    
    let messageData = m.data
    if (m.data.encrypted) {
      if (!room.encryption) {
        console.log('Encrypted message received but no password set')
        return
      }
      messageData = room.encryption.decrypt(m.data)
      if (!messageData) return
    }

    if (messageData.type === 'text') {
      const prefix = `${m.who}: `
      console.log(prefix + messageData.content)
    }
  })

  // Handle password verification for joining peers
  if (invite && room.password) {
    const password = await question('Enter room password: ')
    if (!room.verifyPassword(password)) {
      console.error('Invalid password!')
      process.exit(1)
    }
    console.log('Password accepted!')
    
    // Send a test encrypted message
    const colors = ['\x1b[32m', '\x1b[33m', '\x1b[34m']
    const testMsg = colors[Math.floor(Math.random() * colors.length)] +
      'Encrypted message test - if you see this, encryption is working!' +
      '\x1b[0m'
    
    await room.message({
      type: 'text',
      content: testMsg,
      hasAnsi: true
    })
  }

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
