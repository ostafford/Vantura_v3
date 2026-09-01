import { bufferToBase64, base64ToBuffer } from './base64'

const KEY_LS = 'vantura_bio_key'
const TOKEN_SS = 'vantura_bio_token'

export async function storeBiometricSession(apiToken: string): Promise<void> {
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
  const rawKey = await crypto.subtle.exportKey('raw', key)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(apiToken)
  )
  localStorage.setItem(KEY_LS, bufferToBase64(rawKey))
  sessionStorage.setItem(
    TOKEN_SS,
    JSON.stringify({ iv: bufferToBase64(iv), ct: bufferToBase64(ciphertext) })
  )
}

export async function retrieveBiometricSession(): Promise<string | null> {
  try {
    const keyB64 = localStorage.getItem(KEY_LS)
    const payloadJson = sessionStorage.getItem(TOKEN_SS)
    if (!keyB64 || !payloadJson) return null
    const { iv: ivB64, ct: ctB64 } = JSON.parse(payloadJson) as {
      iv: string
      ct: string
    }
    const key = await crypto.subtle.importKey(
      'raw',
      base64ToBuffer(keyB64),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    )
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBuffer(ivB64) },
      key,
      base64ToBuffer(ctB64)
    )
    return new TextDecoder().decode(decrypted)
  } catch {
    return null
  }
}

export function hasBiometricSession(): boolean {
  return !!(localStorage.getItem(KEY_LS) && sessionStorage.getItem(TOKEN_SS))
}

export function clearBiometricSession(): void {
  localStorage.removeItem(KEY_LS)
  sessionStorage.removeItem(TOKEN_SS)
}
