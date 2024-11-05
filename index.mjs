import { EventEmitter } from 'events'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import RAM from 'random-access-memory'
import Hypercore from 'hypercore'
import b4a from 'b4a'

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
    this.swarm = new Hyperswarm()
  }

  async ready () {
    await Promise.all([this.mainCore.ready()])
    console.log('hypercore key:', b4a.toString(this.mainCore.key, 'hex'))
    // commented things are for the readers
    // const foundPeers = core.findingPeers()
    this.swarm.join(this.mainCore.discoveryKey)
    this.swarm.on('connection', (conn) => this.store.replicate(conn))
    // this.swarm.flush().then(() => foundPeers())
  }
  exit () {
    this.swarm.destroy()
  }
}
