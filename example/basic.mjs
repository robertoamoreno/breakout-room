import { BreakoutRoom } from '../index.mjs'

const invite = process.argv[2]

async function run () {
  const room = new BreakoutRoom({ invite })
  const hostInvite = await room.ready()
  if (hostInvite) console.log('Give out invite:', hostInvite)

  // send room messages from standard in
  process.stdin.on('data', async (data) => {
    await room.message(data.toString())
  })

  // on remote messages, get the full transcript
  room.on('message', () => {
    console.log('remote message recieved')
    // get the full transcript

    const transcript = room.getTranscript()
    console.log('Transcript:', transcript)
  })

  const shutdown = () => {
    room.exit()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

run()
