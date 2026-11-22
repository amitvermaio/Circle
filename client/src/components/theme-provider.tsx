import { createContext, use, useCallback, useLayoutEffect, useMemo, useState } from 'react'

type Theme = 'dark' | 'light'

type ThemeState = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggle: () => void
}

const STORAGE_KEY = 'chaiui-theme'

const ThemeContext = createContext<ThemeState | null>(null)

function readStored(storageKey: string, fallback: Theme): Theme {
  if (typeof window === 'undefined') return fallback
  try {
    const v = localStorage.getItem(storageKey)
    return v === 'light' || v === 'dark' ? v : fallback
  } catch {
    return fallback
  }
}

/**
 * Dark by default, as on chaicode.com. The choice is a `dark` class on
 * <html>, kept in localStorage.
 */
export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  storageKey = STORAGE_KEY,
}: {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}) {
  const [theme, setThemeState] = useState(() => readStored(storageKey, defaultTheme))

  useLayoutEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', theme === 'dark')
    root.style.colorScheme = theme

    return () => {
      root.classList.remove('dark')
      root.style.removeProperty('color-scheme')
    }
  }, [theme])

  const setTheme = useCallback(
    (next: Theme) => {
      try {
        localStorage.setItem(storageKey, next)
      } catch {
        // Private windows can refuse storage; the theme still applies.
      }
      setThemeState(next)
    },
    [storageKey],
  )

  const value = useMemo(
    () => ({ theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }),
    [theme, setTheme],
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}

export function useTheme() {
  const ctx = use(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
