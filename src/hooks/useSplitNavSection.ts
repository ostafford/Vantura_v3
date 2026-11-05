import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

export type UseSplitNavSectionArgs = {
  storageKey: string
  defaultSection: string
  sectionKeys: readonly string[]
  legacyMigrate?: (keys: string[]) => string | null
}

/**
 * Shared split-nav pattern: URL hash, localStorage persistence, browser back/forward,
 * and validation when the section list changes (a stored section that no
 * longer exists falls back to the default).
 */
export function useSplitNavSection({
  storageKey,
  defaultSection,
  sectionKeys,
  legacyMigrate,
}: UseSplitNavSectionArgs) {
  const navigate = useNavigate()
  const location = useLocation()
  const keysKey = sectionKeys.join('|')
  const sectionKeysRef = useRef(sectionKeys)
  sectionKeysRef.current = sectionKeys

  const [activeSection, setActiveSection] = useState<string>(() => {
    const keys = sectionKeys
    try {
      if (typeof window !== 'undefined') {
        const h = window.location.hash.slice(1)
        if (h && keys.includes(h)) return h
      }
    } catch {
      /* ignore */
    }
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw && keys.includes(raw)) return raw
      if (legacyMigrate) {
        const migrated = legacyMigrate([...keys])
        if (migrated) return migrated
      }
    } catch {
      /* ignore */
    }
    return defaultSection
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, activeSection)
    } catch {
      /* ignore */
    }
  }, [activeSection, storageKey])

  useEffect(() => {
    const hid = location.hash.slice(1)
    const keys = sectionKeysRef.current
    if (hid && keys.includes(hid)) {
      setActiveSection(hid)
    }
  }, [location.hash, keysKey])

  useEffect(() => {
    const keys = sectionKeysRef.current
    if (!keys.includes(activeSection)) {
      setActiveSection(defaultSection)
      navigate({ hash: `#${defaultSection}` }, { replace: true })
    }
  }, [activeSection, navigate, defaultSection, keysKey])

  function selectSection(key: string) {
    setActiveSection(key)
    navigate({ hash: `#${key}` }, { replace: true })
  }

  return { activeSection, selectSection, sectionKeys }
}
