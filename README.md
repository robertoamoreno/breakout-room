breakout-room
=============

A small place to dm chat over p2p. No ownership, but the hypercores are useful for 
logging what was said and committed to.

quickstart test
===============
```
 > npm i
 > node example/basic.mjs
our key shq9qi1iq3wdfzufq4ceuqptx3xuhbrt39zkoa11arcu68iteeyy
Give out invite: yry3hiqo3hz4t8puopbptrc1wspd8g7ucdhojnmazjr3fiuiukhb185syc6kia1oi8waeu5xdpa4pd7ora9rno7iffqryrua5jm5iqxokc
```

then in another terminal
```
 > node example/basic.mjs yry3hiqo3hz4t8puopbptrc1wspd8g7ucdhojnmazjr3fiuiukhb185syc6kia1oi8waeu5xdpa4pd7ora9rno7iffqryrua5jm5iqxokc

```

Then you can type messages in each terminal to have it go into the chat log.

see [basic example](example/basic.mjs) for using the breakout-room

api usage
--------

npm i breakout-room

```
import { BreakoutRoom } from 'breakout-room'

const invite = process.argv[2]

async function run () {
  const room = new BreakoutRoom({ invite })
  const hostInvite = await room.ready()
  if (hostInvite) console.log('Give out invite:', hostInvite)

  // send room messages from standard in
  process.stdin.on('data', async (data) => await room.message(data.toString()))

  room.on('peerEntered', (peerKey) => console.log('peer entered the room', peerKey))
  room.on('peerLeft', (peerKey) => {
    console.log('peer left the room', peerKey)
    room.exit()
    process.exit(0)
  })

  room.on('message', async (m) => {
    console.log('remote message recieved', m)
    const transcript = await room.getTranscript()
    console.log('Transcript:', transcript)
  })

  const shutdown = async () => {
    await room.exit()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}
run()

```
