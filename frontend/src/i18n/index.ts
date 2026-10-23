import { create } from 'zustand'
import { es } from './es'
import { en } from './en'
import type { Language, TranslationSchema } from './types'

export * from './types'
export { es } from './es'
export { en } from './en'

const STORAGE_KEY = 'uptimecore_language'

const dictionaries: Record<Language, TranslationSchema> = {
  es,
  en,
}

function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'es'
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'es' || saved === 'en') {
      return saved
    }
    const navLang = navigator.language?.toLowerCase() || ''
    if (navLang.startsWith('en')) {
      return 'en'
    }
  } catch {
    // ignore localStorage access issues in sandboxed contexts
  }
  return 'es'
}

interface I18nStore {
  language: Language
  t: TranslationSchema
  setLanguage: (lang: Language) => void
  toggleLanguage: () => void
}

export const useI18nStore = create<I18nStore>((set) => {
  const initialLang = getInitialLanguage()
  return {
    language: initialLang,
    t: dictionaries[initialLang],
    setLanguage: (lang: Language) => {
      try {
        localStorage.setItem(STORAGE_KEY, lang)
      } catch {
        // ignore
      }
      set({
        language: lang,
        t: dictionaries[lang],
      })
    },
    toggleLanguage: () => {
      set((state) => {
        const nextLang: Language = state.language === 'es' ? 'en' : 'es'
        try {
          localStorage.setItem(STORAGE_KEY, nextLang)
        } catch {
          // ignore
        }
        return {
          language: nextLang,
          t: dictionaries[nextLang],
        }
      })
    },
  }
})

/**
 * Hook para consumir las traducciones reactivas en cualquier componente.
 */
export function useTranslation() {
  const language = useI18nStore((s) => s.language)
  const t = useI18nStore((s) => s.t)
  const setLanguage = useI18nStore((s) => s.setLanguage)
  const toggleLanguage = useI18nStore((s) => s.toggleLanguage)

  const locale = language === 'en' ? 'en-US' : 'es-MX'
  const isEn = language === 'en'
  const isEs = language === 'es'

  /**
   * Reemplaza variables {nombre} en una cadena de traducción.
   * Ejemplo: interpolate("Hola {name}", { name: "Eric" }) -> "Hola Eric"
   */
  const interpolate = (text: string, vars?: Record<string, string | number>): string => {
    if (!vars) return text
    return Object.entries(vars).reduce(
      (acc, [key, val]) => acc.replace(new RegExp(`\\{${key}\\}`, 'g'), String(val)),
      text
    )
  }

  return {
    t,
    language,
    locale,
    isEn,
    isEs,
    setLanguage,
    toggleLanguage,
    interpolate,
  }
}
