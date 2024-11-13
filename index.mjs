import z32 from 'z32'
import { EventEmitter } from 'events'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import RAM from 'random-access-memory'
import BlindPairing from 'blind-pairing'
import Autobase from 'autobase'

export class BreakoutRoom extends EventEmitter {
  constructor (opts = {}) {
    super()
    this.internalManaged = { corestore: false, swarm: false, pairing: false }
    if (opts.corestore) this.corestore = opts.corestore
    else {
      this.internalManaged.corestore = true
      if (opts.storageDir) this.corestore = new Corestore(opts.storageDir)
      else this.corestore = new Corestore(RAM.reusable())
    }
    this.swarm = opts.swarm ? opts.swarm : (this.internalManaged.swarm = true, new Hyperswarm());
    this.pairing = opts.pairing ? opts.pairing : (this.internalManaged.pairing = true, new BlindPairing(this.swarm))
    this.autobase = new Autobase(this.corestore, null, { apply, open, valueEncoding: 'json' })
    if (opts.invite) this.invite = z32.decode(opts.invite)
  }

  async ready () {
    await this.autobase.ready()
    // some hacky stuff to only emit remote messages, and only emit once
    this.lastEmitMessageLength = 0
    this.autobase.view.on('append', async () => {
      const entry = await this.autobase.view.get(this.autobase.view.length - 1)
      if (entry.who === z32.encode(this.autobase.local.key)) return
      if (entry.event === 'leftChat') return this.emit('peerLeft', entry.who)
      if (this.lastEmitMessageLength === this.autobase.view.length) return
      this.lastEmitMessageLength = this.autobase.view.length
      process.nextTick(() => this.emit('message', entry))
    })
    this.swarm.join(this.autobase.local.discoveryKey)
    this.swarm.on('connection', conn => this.corestore.replicate(conn))

    if (this.invite) {
      const candidate = this.pairing.addCandidate({
        invite: this.invite,
        userData: this.autobase.local.key,
        onadd: (result) => this._onHostInvite(result)
      })
      await candidate.paring
    } else {
      const { invite, publicKey, discoveryKey } = BlindPairing.createInvite(this.autobase.local.key)
      const member = this.pairing.addMember({
        discoveryKey,
        onadd: (candidate) => this._onAddMember(publicKey, candidate)
      })
      await member.flushed()
      return z32.encode(invite)
    }
  }

  async message (data) {
    await this.autobase.append({ 
      when: Date.now(), 
      who: z32.encode(this.autobase.local.key), 
      data 
    })
  }

  async _onHostInvite (result) {
    if (result.key) this._connectOtherCore(result.key)
  }

  async _onAddMember (publicKey, candidate) {
    candidate.open(publicKey)
    candidate.confirm({ key: this.autobase.local.key })
    this._connectOtherCore(candidate.userData)
  }

  async _connectOtherCore (key) {
    console.log('connecting to other', z32.encode(key))
    await this.autobase.append({ addWriter: key })
    this.emit('peerEntered', z32.encode(key))
  }

  async getTranscript () {
    const transcript = []
    await this.autobase.update()
    for (let i = 0; i < this.autobase.view.length; i++) {
      transcript.push(await this.autobase.view.get(i))
    }
    return transcript
  }

  async exit () {
    await this.autobase.append({ 
      when: Date.now(), 
      who: z32.encode(this.autobase.local.key), 
      event: 'leftChat' 
    })
    await this.autobase.update()
    this.swarm.leave(this.autobase.local.discoveryKey)
    await this.autobase.close()
    this.removeAllListeners() // clean up listeners
    if (this.internalManaged.pairing) await this.pairing.close()
    if (this.internalManaged.swarm) await this.swarm.destroy()
  }
}

// create the view
function open (store) {
  return store.get({name: 'view', valueEncoding: 'json'})
}

// use apply to handle to updates
async function apply (nodes, view, base) {
  for (const { value } of nodes) {
    if (value.addWriter) {
      if (value.addWriter.type) continue // weird cycle have to figure out
      await base.addWriter(value.addWriter, { isIndexer: true })
      continue
    }
    await view.append(value)
  }
}
