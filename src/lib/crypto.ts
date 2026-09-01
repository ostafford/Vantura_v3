/**
 * Passphrase-derived encryption for API token storage.
 * Web Crypto API: PBKDF2 (SHA-256) for key derivation, AES-GCM for encryption.
 * Salt and IV are stored with ciphertext; passphrase and raw key are never stored.
 */

import { bufferToBase64, base64ToBuffer } from './base64'

const PBKDF2_ITERATIONS = 100_000
const KEY_LENGTH_BITS = 256
const SALT_LENGTH_BYTES = 16
const IV_LENGTH_BYTES = 12
const AES_GCM_TAG_LENGTH_BITS = 128

/**
 * Generate a random salt for key derivation. Store in app_settings.encryption_salt (e.g. base64).
 */
export function generateSalt(): string {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES))
  return bufferToBase64(salt)
}

/**
 * Derive a 256-bit AES key from passphrase using PBKDF2-SHA256.
 * Salt must be the same value used when encrypting (stored in app_settings).
 */
export async function deriveKeyFromPassphrase(
  passphrase: string,
  saltBase64: string,
  iterations: number = PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const salt = base64ToBuffer(saltBase64)
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt plaintext with AES-GCM. Returns base64(IV || ciphertext).
 * IV is 12 bytes; store the whole result in app_settings.api_token_encrypted.
 */
export async function encryptToken(
  plaintext: string,
  key: CryptoKey
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES))
  const enc = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      tagLength: AES_GCM_TAG_LENGTH_BITS,
    },
    key,
    enc.encode(plaintext)
  )
  const combined = new Uint8Array(iv.length + ciphertext.byteLength)
  combined.set(iv)
  combined.set(new Uint8Array(ciphertext), iv.length)
  return bufferToBase64(combined.buffer)
}

/**
 * Decrypt payload from encryptToken. Payload is base64(IV || ciphertext).
 */
export async function decryptToken(
  ivAndCiphertextBase64: string,
  key: CryptoKey
): Promise<string> {
  const combined = new Uint8Array(base64ToBuffer(ivAndCiphertextBase64))
  if (combined.length < IV_LENGTH_BYTES) {
    throw new Error('Invalid encrypted payload: too short')
  }
  const iv = combined.slice(0, IV_LENGTH_BYTES)
  const ciphertext = combined.slice(IV_LENGTH_BYTES)
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv,
      tagLength: AES_GCM_TAG_LENGTH_BITS,
    },
    key,
    ciphertext
  )
  return new TextDecoder().decode(decrypted)
}

export { PBKDF2_ITERATIONS }
