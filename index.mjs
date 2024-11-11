import { EventEmitter } from 'events'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import RAM from 'random-access-memory'
import ProtomuxRPC from 'protomux-rpc'
import b4a from 'b4a'
import { createInvite, getParts, verifyInviteBuffer, encodeInviteParts } from 'hyper-evite'

export class BreakoutRoom extends EventEmitter {
  constructor (opts = {}) {
    super()
    if (opts.storageDir) {
      this.corestore = new Corestore(opts.storageDir)
    } else {
      console.log('loading RAM')
      this.corestore = new Corestore(RAM)
    }
    // we default to an in memory storage
    if (opts.key) {
      this.mainCore = this.corestore.get(opts.key)
    } else {
      console.log('creating mainCore')
      this.mainCore = this.corestore.get({ name: 'manifest', valueEncoding: 'json' })
    }
    if (opts.invite) this.invite = opts.invite
    else {
      this.hostRoom = true
      this.usedInvites = {}
    }
    this.swarm = new Hyperswarm()
  }

  async ready () {
    await Promise.all([this.mainCore.ready()])
    const hostRoom = !this.invite
    const { parts, invite } = hostRoom ? createInvite(this.mainCore.keyPair.secretKey) : getParts(this.invite)
    const swarmMode = { client: true, server: false }
    if (hostRoom) {
      console.log('invite your friends', invite)
      swarmMode.server = true // do we need to do this?
    }
    const discovery = this.swarm.join(parts.topic, swarmMode)
    this.swarm.on('connection', async (conn, peerInfo) => {
      const rpc = new ProtomuxRPC(conn)
      if (hostRoom) {
        rpc.respond('addMe', (req) => {
          const { malformed, signFailed, expired } = verifyInviteBuffer(this.mainCore.keyPair.publicKey, req)
          if (malformed || signFailed || expired) return console.log('bad invite')
          const invite = encodeInviteParts(getParts(req))
          if (this.usedInvites[invite]) return console.log('invite already used')
          this.usedInvites[invite] = true
          // let them in!
        })
      } else {
        await rpc.request('addMe', Buffer.concat([parts.topic, parts.expirationBuffer, parts.signature]))
      }
      this.corestore.replicate(conn)
    })
    discovery.flushed().then(() => console.log('joined topic:', b4a.toString(parts.topic, 'hex')))
  }

  exit () {
    this.swarm.destroy()
  }
}
