export interface User {
  id: string
  walletAddress: string
  tier: number
  holdings: number
  createdAt: string
  lastSeen: string
}

export interface Signal {
  id: string
  content: any
  signalType?: string
  severity?: string
  createdAt: string
  tier1ReleaseAt: string
  tier2ReleaseAt: string
  tier3ReleaseAt: string
  tier4ReleaseAt: string
  isPublic: boolean
  userTier?: number
  nextTierReleaseIn?: number | null
}

export interface ChatMessage {
  id: string
  userId: string
  message: string
  response?: string
  priority: number
  status: 'pending' | 'processing' | 'completed' | 'failed'
  createdAt: string
  respondedAt?: string
  processingTimeMs?: number
}

export interface Session {
  token: string
  tier: number
  holdings: number
  expiresAt: string
}

export interface TerminalCommand {
  command: string
  output: string
  timestamp: Date
  type: 'input' | 'output' | 'error' | 'system'
}

export interface AppState {
  user: User | null
  session: Session | null
  signals: Signal[]
  chatMessages: ChatMessage[]
  terminalHistory: TerminalCommand[]
  isAuthenticated: boolean
  isLoading: boolean
}