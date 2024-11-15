import Autobase from 'autobase'
import BlindPairing from 'blind-pairing'
import { MessageEncryption } from './encryption.mjs'
import Corestore from 'corestore'
import Hyperswarm from 'hyperswarm'
import RAM from 'random-access-memory'
import z32 from 'z32'
import { EventEmitter } from 'events'

export class RoomManager {
  constructor (opts = {}) {
    this.internalManaged = { corestore: false, swarm: false, pairing: false }
    if (opts.corestore) this.corestore = opts.corestore
    else {
      this.internalManaged.corestore = true
      if (opts.storageDir) this.corestore = new Corestore(opts.storageDir)
      else this.corestore = new Corestore(RAM.reusable())
    }
    this.swarm = opts.swarm ? opts.swarm : (this.internalManaged.swarm = true, new Hyperswarm())
    this.pairing = opts.pairing ? opts.pairing : (this.internalManaged.pairing = true, new BlindPairing(this.swarm))
    this.rooms = {}
  }

  getRoomOptions (roomId) {
    const corestore = roomId ? this.corestore.namespace(roomId) : this.corestore
    return { corestore, swarm: this.swarm, pairing: this.pairing }
  }

  createRoom (opts = {}) {
    const roomId = generateRoomId()
    const baseOpts = this.getRoomOptions(roomId)
    if (opts.invite) baseOpts.invite = opts.invite
    baseOpts.metadata = opts.metadata || {}
    baseOpts.roomId = roomId
    const room = new BreakoutRoom(baseOpts)
    this.rooms[roomId] = room
    room.on('roomClosed', () => delete this.rooms[roomId])
    return room
  }

  async cleanup () {
    const exitPromises = Object.values(this.rooms).map(room => room.exit())
    await Promise.all(exitPromises)
    this.rooms = {}

    // Clean up other resources
    if (this.internalManaged.pairing) await this.pairing.close()
    if (this.internalManaged.swarm) await this.swarm.destroy()
    if (this.internalManaged.corestere) await this.corestore.close()
  }
}

export class BreakoutRoom extends EventEmitter {
  constructor (opts = {}) {
    super()
    this.roomId = opts.roomId || generateRoomId()
    this.password = opts.password
    this.encryption = opts.password ? new MessageEncryption(opts.password) : null
    this.authenticated = !opts.password // if no password, auto-authenticate
    this.internalManaged = { corestore: false, swarm: false, pairing: false }
    if (opts.corestore) this.corestore = opts.corestore
    else {
      this.internalManaged.corestore = true
      if (opts.storageDir) this.corestore = new Corestore(opts.storageDir)
      else this.corestore = new Corestore(RAM.reusable())
    }
    this.swarm = opts.swarm ? opts.swarm : (this.internalManaged.swarm = true, new Hyperswarm())
    this.pairing = opts.pairing ? opts.pairing : (this.internalManaged.pairing = true, new BlindPairing(this.swarm))
    this.autobase = new Autobase(this.corestore, null, { apply, open, valueEncoding: 'json' })
    if (opts.invite) this.invite = z32.decode(opts.invite)
    if (opts.roomCount) this.roomCount = opts.roomCount
    this.metadata = opts.metadata || {}
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
      await candidate.pairing
    } else {
      const { invite, publicKey, discoveryKey } = BlindPairing.createInvite(this.autobase.local.key)
      this.metadata.host = {
        publicKey: z32.encode(publicKey),
        discoveryKey: z32.encode(discoveryKey)
      }
      const member = this.pairing.addMember({
        discoveryKey,
        onadd: (candidate) => this._onAddMember(publicKey, candidate)
      })
      await member.flushed()
      return z32.encode(invite)
    }
  }

  getRoomInfo () {
    return {
      roomId: this.roomId,
      metadata: this.metadata
    }
  }

  async message (data) {
    if (!this.authenticated) {
      throw new Error('Not authenticated')
    }

    const messageData = {
      type: data.type || 'text',
      content: data.content || data,
      hasAnsi: data.hasAnsi || false
    }

    const encryptedData = this.encryption ? 
      this.encryption.encrypt(messageData) : 
      messageData

    await this.autobase.append({
      when: Date.now(),
      who: z32.encode(this.autobase.local.key),
      data: encryptedData,
      encrypted: !!this.encryption
    })
  }

  setPassword(password) {
    if (this.encryption) return
    this.password = password
    this.encryption = new MessageEncryption(password)
    this.authenticated = true
  }

  verifyPassword(password) {
    if (!this.password) return true
    const testEncryption = new MessageEncryption(password)
    const challenge = MessageEncryption.generateChallenge()
    const encrypted = testEncryption.encrypt({ test: challenge })
    const decrypted = testEncryption.decrypt(encrypted)
    if (decrypted && decrypted.test === challenge) {
      this.encryption = testEncryption
      this.authenticated = true
      return true
    }
    return false
  }

  async _onHostInvite (result) {
    if (result.key) {
      this._connectOtherCore(result.key)
      this.metadata.host = {
        publicKey: z32.encode(result.key)
        // should add the discovery key here
      }
    }
  }

  async _onAddMember (publicKey, candidate) {
    candidate.open(publicKey)
    candidate.confirm({ key: this.autobase.local.key })
    this._connectOtherCore(candidate.userData)
  }

  async _connectOtherCore (key) {
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
    if (this.internalManaged.pairing) await this.pairing.close()
    if (this.internalManaged.swarm) await this.swarm.destroy()
    if (this.internalManaged.corestore) await this.corestore.close()
    this.emit('roomClosed')
    this.removeAllListeners() // clean up listeners
  }
}

// create the view
function open (store) {
  return store.get({ name: 'view', valueEncoding: 'json' })
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

function generateRoomId () {
  const timestamp = Date.now().toString(36) // Base36 timestamp
  const random = Math.random().toString(36).substr(2, 5) // 5 random chars
  return `room-${timestamp}-${random}`
}
