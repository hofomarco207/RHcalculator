'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'

// ─── Tab Registry ────────────────────────────────────────────────────────────

export interface TabDefinition {
  id: string
  emoji: string
  closable: boolean
  /** Group label in sidebar (for visual grouping only) */
  group: string
}

export const TAB_DEFINITIONS: TabDefinition[] = [
  { id: 'scenarios', emoji: '🔬', closable: true, group: 'core' },
  { id: 'pricing-flow', emoji: '💰', closable: true, group: 'core' },
  { id: 'library', emoji: '📚', closable: true, group: 'core' },
  { id: 'vendors', emoji: '🏢', closable: true, group: 'core' },
  { id: 'settings', emoji: '⚙️', closable: true, group: 'core' },
  { id: 'data-shipments', emoji: '🗂️', closable: true, group: 'core' },
  { id: 'rate-card', emoji: '📋', closable: true, group: 'core' },
  { id: 'advanced-analysis', emoji: '📊', closable: true, group: 'advanced' },
  { id: 'competitor', emoji: '🏆', closable: true, group: 'advanced' },
]

export const TAB_IDS = TAB_DEFINITIONS.map((d) => d.id)
export type TabId = (typeof TAB_IDS)[number]

const DEFAULT_TAB: TabId = 'scenarios'
const STORAGE_KEY = 'imile-open-tabs'
const ACTIVE_STORAGE_KEY = 'imile-active-tab'

// ─── Context ─────────────────────────────────────────────────────────────────

interface TabContextValue {
  /** Ordered list of currently open tab IDs */
  openTabs: TabId[]
  /** Currently visible tab */
  activeTabId: TabId
  /** Set of tab IDs that have been mounted at least once (for lazy mount) */
  mountedTabs: Set<TabId>
  /** Open a tab (or switch to it if already open) */
  openTab: (tabId: TabId) => void
  /** Close a tab (switches to adjacent tab) */
  closeTab: (tabId: TabId) => void
  /** Switch to an already-open tab without opening a new one */
  setActiveTab: (tabId: TabId) => void
}

const TabContext = createContext<TabContextValue | null>(null)

// ─── Provider ────────────────────────────────────────────────────────────────

export function TabProvider({ children }: { children: ReactNode }) {
  const [openTabs, setOpenTabs] = useState<TabId[]>([DEFAULT_TAB])
  const [activeTabId, setActiveTabIdState] = useState<TabId>(DEFAULT_TAB)
  const [mountedTabs, setMountedTabs] = useState<Set<TabId>>(new Set([DEFAULT_TAB]))
  const [hydrated, setHydrated] = useState(false)

  // Hydrate from sessionStorage + URL hash on mount
  useEffect(() => {
    const hash = window.location.hash.replace('#', '')
    const storedTabs = sessionStorage.getItem(STORAGE_KEY)
    const storedActive = sessionStorage.getItem(ACTIVE_STORAGE_KEY)

    let tabs: TabId[] = [DEFAULT_TAB]
    if (storedTabs) {
      try {
        const parsed = JSON.parse(storedTabs) as string[]
        const valid = parsed.filter((t) => TAB_IDS.includes(t))
        if (valid.length > 0) tabs = valid
      } catch { /* ignore */ }
    }

    // If URL hash points to a valid tab, ensure it's open and active
    let active = storedActive && TAB_IDS.includes(storedActive) ? storedActive : tabs[0]
    if (hash && TAB_IDS.includes(hash)) {
      if (!tabs.includes(hash)) {
        tabs = [...tabs, hash]
      }
      active = hash
    }

    setOpenTabs(tabs)
    setActiveTabIdState(active)
    setMountedTabs(new Set(tabs))
    setHydrated(true)
  }, [])

  // Persist to sessionStorage + URL hash on change
  useEffect(() => {
    if (!hydrated) return
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(openTabs))
    sessionStorage.setItem(ACTIVE_STORAGE_KEY, activeTabId)
    window.history.replaceState(null, '', `#${activeTabId}`)
  }, [openTabs, activeTabId, hydrated])

  const openTab = useCallback((tabId: TabId) => {
    setOpenTabs((prev) => {
      if (prev.includes(tabId)) return prev
      return [...prev, tabId]
    })
    setActiveTabIdState(tabId)
    setMountedTabs((prev) => {
      if (prev.has(tabId)) return prev
      const next = new Set(prev)
      next.add(tabId)
      return next
    })
  }, [])

  const closeTab = useCallback((tabId: TabId) => {
    setOpenTabs((prev) => {
      const idx = prev.indexOf(tabId)
      if (idx === -1) return prev
      const remaining = prev.filter((t) => t !== tabId)
      const nextTabs = remaining.length === 0 ? [DEFAULT_TAB] : remaining

      // Compute the new active tab from within this updater (atomic read of prev)
      setActiveTabIdState((prevActive) => {
        if (prevActive !== tabId) return prevActive
        if (remaining.length === 0) return DEFAULT_TAB
        // Pick the tab at the same index, or the last one
        const newIdx = Math.min(idx, remaining.length - 1)
        return remaining[newIdx]
      })

      return nextTabs
    })
  }, [])

  const setActiveTab = useCallback((tabId: TabId) => {
    setActiveTabIdState(tabId)
    setMountedTabs((prev) => {
      if (prev.has(tabId)) return prev
      const next = new Set(prev)
      next.add(tabId)
      return next
    })
  }, [])

  return (
    <TabContext.Provider
      value={{ openTabs, activeTabId, mountedTabs, openTab, closeTab, setActiveTab }}
    >
      {children}
    </TabContext.Provider>
  )
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useTab(): TabContextValue {
  const ctx = useContext(TabContext)
  if (!ctx) {
    throw new Error('useTab must be used within a TabProvider')
  }
  return ctx
}
