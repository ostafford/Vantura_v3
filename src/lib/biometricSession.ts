const KEY_LS = 'vantura_bio_key'
const TOKEN_SS = 'vantura_bio_token'

function b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
}

function fromb64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

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
  localStorage.setItem(KEY_LS, b64(rawKey))
  sessionStorage.setItem(
    TOKEN_SS,
    JSON.stringify({ iv: b64(iv.buffer), ct: b64(ciphertext) })
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
      fromb64(keyB64),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    )
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromb64(ivB64) },
      key,
      fromb64(ctB64)
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
