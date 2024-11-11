import { BreakoutRoom } from '../index.mjs'

const invite = process.argv[2]
console.log('invite', invite)

async function run () {
  const room = new BreakoutRoom({ invite })
  await room.ready()
  setTimeout(() => room.exit(), 25000)
}

run()
