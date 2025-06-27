import { create } from 'zustand'
import { AppState, Signal, ChatMessage, Session, User, TerminalCommand } from '../types'

interface AppStore extends AppState {
  // Actions
  setUser: (user: User | null) => void
  setSession: (session: Session | null) => void
  setSignals: (signals: Signal[]) => void
  addSignal: (signal: Signal) => void
  setChatMessages: (messages: ChatMessage[]) => void
  addChatMessage: (message: ChatMessage) => void
  updateChatMessage: (id: string, updates: Partial<ChatMessage>) => void
  addTerminalCommand: (command: TerminalCommand) => void
  setIsAuthenticated: (isAuthenticated: boolean) => void
  setIsLoading: (isLoading: boolean) => void
  clearTerminalHistory: () => void
}

export const useAppStore = create<AppStore>((set, get) => ({
  // Initial state
  user: null,
  session: null,
  signals: [],
  chatMessages: [],
  terminalHistory: [],
  isAuthenticated: false,
  isLoading: false,

  // Actions
  setUser: (user) => set({ user }),
  
  setSession: (session) => set({ session }),
  
  setSignals: (signals) => set({ signals }),
  
  addSignal: (signal) => set((state) => ({
    signals: [signal, ...state.signals].slice(0, 100) // Keep only latest 100
  })),
  
  setChatMessages: (chatMessages) => set({ chatMessages }),
  
  addChatMessage: (message) => set((state) => ({
    chatMessages: [...state.chatMessages, message]
  })),
  
  updateChatMessage: (id, updates) => set((state) => ({
    chatMessages: state.chatMessages.map(msg => 
      msg.id === id ? { ...msg, ...updates } : msg
    )
  })),
  
  addTerminalCommand: (command) => set((state) => ({
    terminalHistory: [...state.terminalHistory, command].slice(-1000) // Keep only latest 1000
  })),
  
  setIsAuthenticated: (isAuthenticated) => set({ isAuthenticated }),
  
  setIsLoading: (isLoading) => set({ isLoading }),
  
  clearTerminalHistory: () => set({ terminalHistory: [] })
}))