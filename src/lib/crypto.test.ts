import { describe, it, expect } from 'vitest'
import {
  generateSalt,
  deriveKeyFromPassphrase,
  encryptToken,
  decryptToken,
  reEncryptSecret,
  PASSPHRASE_MIN_LENGTH,
} from './crypto'

describe('crypto', () => {
  it('generateSalt returns base64 string of correct length', () => {
    const salt = generateSalt()
    expect(typeof salt).toBe('string')
    expect(atob(salt).length).toBe(16)
  })

  it('deriveKeyFromPassphrase produces a key from passphrase and salt', async () => {
    const salt = generateSalt()
    const key = await deriveKeyFromPassphrase('test passphrase', salt, 1000)
    expect(key).toBeDefined()
    expect(key.type).toBe('secret')
    expect(key.algorithm).toBeDefined()
  })

  it('encryptToken and decryptToken round-trip', async () => {
    const salt = generateSalt()
    const key = await deriveKeyFromPassphrase('secret', salt, 1000)
    const plaintext = 'up:pat:secret-token-123'
    const encrypted = await encryptToken(plaintext, key)
    expect(encrypted).toBeDefined()
    expect(encrypted).not.toBe(plaintext)
    const decrypted = await decryptToken(encrypted, key)
    expect(decrypted).toBe(plaintext)
  })

  it('decryptToken fails on tampered payload', async () => {
    const salt = generateSalt()
    const key = await deriveKeyFromPassphrase('secret', salt, 1000)
    const encrypted = await encryptToken('original', key)
    const tampered = encrypted.slice(0, -2) + 'xx'
    await expect(decryptToken(tampered, key)).rejects.toThrow()
  })

  it('decryptToken fails on too-short payload', async () => {
    const salt = generateSalt()
    const key = await deriveKeyFromPassphrase('secret', salt, 1000)
    await expect(decryptToken(btoa('short'), key)).rejects.toThrow('too short')
  })

  describe('reEncryptSecret (#33)', () => {
    const ITER = 1000
    const CURRENT = 'current-passphrase-abc'
    const NEXT = 'a-fresh-longer-passphrase'
    const TOKEN = 'up:pat:secret-token-xyz'

    async function seedCiphertext(): Promise<{ salt: string; ct: string }> {
      const salt = generateSalt()
      const key = await deriveKeyFromPassphrase(CURRENT, salt, ITER)
      return { salt, ct: await encryptToken(TOKEN, key) }
    }

    it('re-encrypts under a new passphrase + fresh salt, recovering the plaintext', async () => {
      const { salt, ct } = await seedCiphertext()
      const res = await reEncryptSecret(ct, salt, CURRENT, NEXT, ITER)

      expect(res.plaintext).toBe(TOKEN)
      expect(res.salt).not.toBe(salt)

      // New ciphertext opens with the new passphrase…
      const newKey = await deriveKeyFromPassphrase(NEXT, res.salt, ITER)
      expect(await decryptToken(res.ciphertext, newKey)).toBe(TOKEN)
      // …and not with the old one.
      const oldKey = await deriveKeyFromPassphrase(CURRENT, res.salt, ITER)
      await expect(decryptToken(res.ciphertext, oldKey)).rejects.toThrow()
    })

    it('throws when the current passphrase is wrong', async () => {
      const { salt, ct } = await seedCiphertext()
      await expect(
        reEncryptSecret(ct, salt, 'wrong-passphrase', NEXT, ITER)
      ).rejects.toThrow()
    })

    it('throws when the new passphrase is shorter than the minimum', async () => {
      const { salt, ct } = await seedCiphertext()
      const short = 'x'.repeat(PASSPHRASE_MIN_LENGTH - 1)
      await expect(
        reEncryptSecret(ct, salt, CURRENT, short, ITER)
      ).rejects.toThrow(/at least/)
    })
  })
})
