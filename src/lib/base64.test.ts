import { describe, it, expect } from 'vitest'
import { bufferToBase64, base64ToBuffer } from './base64'

// ── the three pre-consolidation implementations, reproduced verbatim ──────

// crypto.ts
function cryptoEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
function cryptoDecode(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

// biometricSession.ts (identical shape to the webauthn.ts inline version)
function bioEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}
function bioDecode(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n)
  for (let i = 0; i < n; i++) b[i] = (i * 37 + 11) & 0xff
  return b
}

describe('base64', () => {
  it('round-trips key-material-shaped buffers (32 / 16 / 12 bytes)', () => {
    for (const n of [32, 16, 12]) {
      const original = randomBytes(n)
      const decoded = base64ToBuffer(bufferToBase64(original))
      expect(Array.from(decoded)).toEqual(Array.from(original))
    }
  })

  it('round-trips every byte value 0x00–0xff', () => {
    const all = new Uint8Array(256)
    for (let i = 0; i < 256; i++) all[i] = i
    expect(Array.from(base64ToBuffer(bufferToBase64(all)))).toEqual(
      Array.from(all)
    )
  })

  it('encodes byte-identically to the pre-change crypto.ts implementation', () => {
    const key = randomBytes(32)
    expect(bufferToBase64(key)).toBe(cryptoEncode(key.buffer))
  })

  it('encodes byte-identically to the pre-change biometric/webauthn implementation', () => {
    const raw = randomBytes(48)
    expect(bufferToBase64(raw)).toBe(bioEncode(raw.buffer))
  })

  it('decodes to the same bytes as both pre-change implementations', () => {
    const b64 = bufferToBase64(randomBytes(32))
    expect(Array.from(base64ToBuffer(b64))).toEqual(
      Array.from(new Uint8Array(cryptoDecode(b64)))
    )
    expect(Array.from(base64ToBuffer(b64))).toEqual(Array.from(bioDecode(b64)))
  })

  it('accepts an ArrayBuffer or a Uint8Array view and yields the same string', () => {
    const bytes = randomBytes(20)
    expect(bufferToBase64(bytes)).toBe(bufferToBase64(bytes.buffer))
  })

  it('returns a Uint8Array from base64ToBuffer', () => {
    expect(base64ToBuffer(bufferToBase64(randomBytes(8)))).toBeInstanceOf(
      Uint8Array
    )
  })

  it('handles the empty buffer', () => {
    expect(bufferToBase64(new Uint8Array(0))).toBe('')
    expect(base64ToBuffer('').length).toBe(0)
  })
})
