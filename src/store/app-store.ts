import { create } from 'zustand'

interface AppState {
  lang: 'en' | 'ar'
  setLang: (lang: 'en' | 'ar') => void
  activeTab: string
  setActiveTab: (tab: string) => void
  balance: number
  setBalance: (balance: number) => void
  streak: number
  setStreak: (streak: number) => void
  lastClaimAt: string | null
  setLastClaimAt: (date: string | null) => void
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  toast: { message: string; type: 'success' | 'error' | 'info' } | null
  showToast: (message: string, type: 'success' | 'error' | 'info') => void
  clearToast: () => void
}

export const useAppStore = create<AppState>((set) => ({
  lang: 'ar',
  setLang: (lang) => set({ lang }),
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),
  balance: 0,
  setBalance: (balance) => set({ balance }),
  streak: 0,
  setStreak: (streak) => set({ streak }),
  lastClaimAt: null,
  setLastClaimAt: (date) => set({ lastClaimAt: date }),
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
  toast: null,
  showToast: (message, type) => {
    set({ toast: { message, type } })
    setTimeout(() => set({ toast: null }), 3000)
  },
  clearToast: () => set({ toast: null }),
}))
