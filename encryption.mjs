import crypto from 'crypto'

export class MessageEncryption {
  constructor(password) {
    this.key = crypto.scryptSync(password, 'salt', 32)
  }

  encrypt(message) {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key, iv)
    let encrypted = cipher.update(JSON.stringify(message), 'utf8', 'hex')
    encrypted += cipher.final('hex')
    const authTag = cipher.getAuthTag()
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    }
  }

  decrypt(encryptedData) {
    try {
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.key,
        Buffer.from(encryptedData.iv, 'hex')
      )
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'))
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      return JSON.parse(decrypted)
    } catch (error) {
      console.error('Decryption failed - wrong password?')
      return null
    }
  }

  static generateChallenge() {
    return crypto.randomBytes(32).toString('hex')
  }
}
