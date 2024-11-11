import { EventEmitter } from 'events'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import RAM from 'random-access-memory'
import ProtomuxRPC from 'protomux-rpc'
import b4a from 'b4a'
import { createInvite, getParts, verifyInviteBuffer } from 'hyper-evite'

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
    this.swarm = new Hyperswarm()
  }

  async ready () {
    await Promise.all([this.mainCore.ready()])
    const hostRoom = this.invite ? false : true
    const { parts, invite } = hostRoom ?  createInvite(this.mainCore.keyPair.secretKey) : getParts(this.invite)
    let swarmMode = { client: true, server: false }
    if (hostRoom) {
      console.log('invite your friends', invite)
      swarmMode.server = true // do we need to do this?
    }
    const discovery = this.swarm.join(parts.topic, swarmMode)
    this.swarm.on('connection', async (conn, peerInfo) => {
      const name = b4a.toString(conn.remotePublicKey, 'hex')
      console.log('* got a connection from:', name, '*')
      const rpc = new ProtomuxRPC(conn)
      if (hostRoom) {
        rpc.respond('addMe', (req) => {
          console.log('handle add me request')
          const { malformed, signFailed, expired } = verifyInviteBuffer(this.mainCore.keyPair.publicKey, req)
          console.log('malformed', malformed, signFailed, expired)
          if (malformed || signFailed || expired) return console.log('bad invite')
          console.log('invite is good!')
          // let them in!
        })
      } else {
        console.log('starting rpc request', parts)
        await rpc.request('addMe', Buffer.concat([parts.topic, parts.expirationBuffer, parts.signature]))
        console.log('rpc request done')
      }
      // this.corestore.replicate(conn)
    })
    discovery.flushed().then(() => {
      console.log('joined topic:', b4a.toString(parts.topic, 'hex'))
    })
  }
  exit () {
    this.swarm.destroy()
  }
}
