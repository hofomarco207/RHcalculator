'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import { zh } from './locales/zh'
import { en } from './locales/en'
import type { Translations } from './locales/zh'

export type Language = 'zh' | 'en'

const STORAGE_KEY = 'imile-language'
const DEFAULT_LANGUAGE: Language = 'zh'

interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  t: Translations
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

const locales: Record<Language, Translations> = { zh: zh as unknown as Translations, en }

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Language | null
    if (stored && (stored === 'zh' || stored === 'en')) {
      setLanguageState(stored)
    }
  }, [])

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, lang)
    }
  }, [])

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: locales[language] }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within a LanguageProvider')
  return ctx
}

/** Shortcut: returns just the translation object */
export function useT(): Translations {
  return useLanguage().t
}
