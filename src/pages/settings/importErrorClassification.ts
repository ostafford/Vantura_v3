import { IMPORT_ERROR_WRONG_PASSPHRASE } from '@/services/profileExport'

/**
 * Which import field an error message should be attached to, so the UI can
 * highlight the field the user actually needs to fix.
 */
export function classifyImportError(message: string): 'file' | 'passphrase' {
  return message === IMPORT_ERROR_WRONG_PASSPHRASE ||
    message.includes('passphrase') ||
    message.includes('newer app version')
    ? 'passphrase'
    : 'file'
}
