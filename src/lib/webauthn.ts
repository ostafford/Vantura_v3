import { bufferToBase64, base64ToBuffer } from './base64'

export async function isBiometricAvailable(): Promise<boolean> {
  if (!window.PublicKeyCredential) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export async function registerBiometric(): Promise<string> {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const userId = crypto.getRandomValues(new Uint8Array(16))
  const rpId = window.location.hostname

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { id: rpId, name: 'Vantura' },
      user: { id: userId, name: 'vantura-user', displayName: 'Vantura User' },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },
        { alg: -257, type: 'public-key' },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
    },
  })

  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error('Biometric registration failed')
  }

  return bufferToBase64(credential.rawId)
}

export async function verifyBiometric(
  credentialIdB64: string
): Promise<boolean> {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const rpId = window.location.hostname
  const credId = base64ToBuffer(credentialIdB64)

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId,
      allowCredentials: [
        { type: 'public-key', id: credId, transports: ['internal'] },
      ],
      userVerification: 'required',
      timeout: 60000,
    },
  })

  return assertion !== null
}
