import { describe, expect, it } from 'vitest'
import { classifyImportError } from './importErrorClassification'
import { IMPORT_ERROR_WRONG_PASSPHRASE } from '@/services/profileExport'

describe('classifyImportError', () => {
  it('classifies the wrong-passphrase sentinel as a passphrase error', () => {
    expect(classifyImportError(IMPORT_ERROR_WRONG_PASSPHRASE)).toBe(
      'passphrase'
    )
  })

  it('classifies any message mentioning "passphrase" as a passphrase error', () => {
    expect(classifyImportError('Invalid passphrase provided')).toBe(
      'passphrase'
    )
  })

  it('classifies a "newer app version" message as a passphrase error', () => {
    expect(
      classifyImportError('This file was exported by a newer app version')
    ).toBe('passphrase')
  })

  it('classifies anything else as a file error', () => {
    expect(classifyImportError('Malformed JSON')).toBe('file')
    expect(classifyImportError('Unexpected end of file')).toBe('file')
    expect(classifyImportError('')).toBe('file')
  })
})
