/**
 * Base64 ⇄ bytes conversion shared by the crypto and biometric-auth layers.
 *
 * This is the "binary string" scheme: one character per byte via
 * `String.fromCharCode` / `charCodeAt`, wrapped with `btoa` / `atob`. Every
 * caller — API-token encryption (`crypto.ts`), WebAuthn credential ids
 * (`webauthn.ts`), and the biometric session blob (`biometricSession.ts`) —
 * has always used exactly this encoding. Consolidating three copies; the
 * format itself must not change.
 */

/** Encode bytes as a base64 string. Accepts an ArrayBuffer or a typed-array view. */
export function bufferToBase64(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/** Decode a base64 string to bytes. */
export function base64ToBuffer(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
