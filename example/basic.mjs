import { BreakoutRoom } from '../index.mjs'

async function run () {
  const room = new BreakoutRoom()
  await room.ready()
  setTimeout(() => room.exit(), 5000)
}

run()
