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
    if (opts.storageDir) this.corestore = new Corestore(opts.storageDir)
    else this.corestore = new Corestore(RAM.reusable())
    this.autobase = new Autobase(this.corestore, null, { apply, open, valueEncoding: 'json' })
    this.swarm = new Hyperswarm()
    if (opts.invite) this.invite = z32.decode(opts.invite)
  }

  async ready () {
    await this.autobase.ready()
    console.log('our key', z32.encode(this.autobase.local.key))
    this.swarm.join(this.autobase.local.discoveryKey)
    this.swarm.on('connection', conn => this.corestore.replicate(conn))

    this.pairing = new BlindPairing(this.swarm)
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
    await this.autobase.append({ data })
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
    console.log('connection complete')
  }

  async getTranscript () {
    const transcript = []
    await this.autobase.update()
    for (let i = 0; i < this.autobase.view.length; i++) {
      transcript.push(await this.autobase.view.get(i))
    }    
  }

  async exit () {
    await this.pairing.close()
    await this.swarm.destroy()
  }
}

// create the view
async function open (store) {
  return store.get({name: 'view', valueEncoding: 'json'})
}

// use apply to handle to updates
async function apply (nodes, view, base) {
  console.log('doing', view)
  for (const { value } of nodes) {
    console.log('the value', value)
    if (value.addWriter) {
      if (value.addWriter.type) continue // weird cycle have to figure out
      console.log('adding writer', z32.encode(value.addWriter))
      await base.addWriter(value.addWriter, { isIndexer: true })
      console.log('writer added')
      continue
    }
    if (view && view.append) {
      console.log('doing append')
      await view.append(value)
    } else console.log('skipping')
  }
}
