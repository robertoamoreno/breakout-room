import { BreakoutRoom } from '../index.mjs'

const invite = process.argv[2]
console.log('invite', invite)

async function run () {
  const room = new BreakoutRoom({ invite })
  await room.ready()

  process.stdin.on('data', (data) => {
    room.message(data.toString())
  })

  const shutdown = () => {
    console.log('shutting down')
    room.exit()
    process.exit(0)
  } 
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}


run()
