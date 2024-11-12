import z32 from 'z32'
import { EventEmitter } from 'events'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import RAM from 'random-access-memory'
import BlindPairing from 'blind-pairing'

export class BreakoutRoom extends EventEmitter {
  constructor (opts = {}) {
    super()
    if (opts.storageDir) this.corestore = new Corestore(opts.storageDir)
    else this.corestore = new Corestore(RAM)
    this.mainCore = this.corestore.get({ name: 'manifest', valueEncoding: 'json' })
    this.swarm = new Hyperswarm()
    if (opts.invite) this.invite = z32.decode(opts.invite)
  }

  async ready () {
    await Promise.all([this.mainCore.ready()])
    this.swarm.join(this.mainCore.discoveryKey)
    this.swarm.on('connection', conn => this.corestore.replicate(conn))

    this.pairing = new BlindPairing(this.swarm)
    if (this.invite) {
      const candidate = this.pairing.addCandidate({
        invite: this.invite,
        userData: this.mainCore.key,
        onadd: (result) => this._onHostInvite(result)
      })
      await candidate.paring
    } else {
      const { invite, publicKey, discoveryKey } = BlindPairing.createInvite(this.mainCore.key)
      const member = this.pairing.addMember({
        discoveryKey,
        onadd: (candidate) => this._onAddMember(publicKey, candidate)
      })
      await member.flushed()
      return z32.encode(invite)
    }
  }

  message (data) {
    this.mainCore.append({ data })
  }

  async _onHostInvite (result) {
    if (result.key) this._connectOtherCore(result.key)
  }

  async _onAddMember (publicKey, candidate) {
    candidate.open(publicKey)
    candidate.confirm({ key: this.mainCore.key })
    this._connectOtherCore(candidate.userData)
  }

  async _connectOtherCore (key) {
    const core = this.corestore.get(key)
    await core.ready()
    this.swarm.join(core.discoveryKey)
    core.on('append', () => this.emit('message'))
    await core.update()
  }

  async exit () {
    await this.pairing.close()
    await this.swarm.destroy()
  }
}
