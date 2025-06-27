import React, { useState, useEffect, useRef } from 'react'
import styled from 'styled-components'
import { useAppStore } from '../store/appStore'
import { useAuth } from '../hooks/useAuth'
import { api } from '../utils/supabase'
import { Signal, ChatMessage } from '../types'

const TerminalContainer = styled.div`
  background: #000;
  color: #00ff00;
  font-family: 'Courier New', monospace;
  height: 100vh;
  overflow-y: auto;
  padding: 20px;
  box-sizing: border-box;
`

const PromptLine = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 5px;
  
  &::before {
    content: '$ ';
    color: #00ff00;
    font-weight: bold;
  }
`

const Input = styled.input`
  background: transparent;
  border: none;
  color: #00ff00;
  font-family: inherit;
  font-size: inherit;
  outline: none;
  flex: 1;
  caret-color: #00ff00;
`

const OutputLine = styled.div<{ type?: 'error' | 'success' | 'info' | 'warning' }>`
  margin-bottom: 5px;
  color: ${props => {
    switch (props.type) {
      case 'error': return '#ff0000'
      case 'success': return '#00ff00'
      case 'info': return '#00ffff'
      case 'warning': return '#ffff00'
      default: return '#ffffff'
    }
  }};
`

const TierBadge = styled.span<{ tier: number }>`
  background: ${props => {
    switch (props.tier) {
      case 1: return '#ffd700'
      case 2: return '#c0c0c0'
      case 3: return '#cd7f32'
      default: return '#666'
    }
  }};
  color: #000;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 10px;
  margin-left: 10px;
`

export const Terminal: React.FC = () => {
  const [currentInput, setCurrentInput] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const {
    terminalHistory,
    addTerminalCommand,
    session,
    signals,
    setSignals,
    addChatMessage,
    chatMessages,
    isAuthenticated
  } = useAppStore()
  
  const { address } = useAuth()

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus()
    }
  }, [])

  const addOutput = (output: string, type: 'input' | 'output' | 'error' | 'system' = 'output') => {
    addTerminalCommand({
      command: type === 'input' ? currentInput : '',
      output,
      timestamp: new Date(),
      type
    })
  }

  const executeCommand = async (command: string) => {
    const cmd = command.trim().toLowerCase()
    const args = cmd.split(' ')
    
    addTerminalCommand({
      command,
      output: '',
      timestamp: new Date(),
      type: 'input'
    })

    try {
      switch (args[0]) {
        case 'help':
          addOutput(`Available commands:
  help              - Show this help message
  signals           - List recent signals
  signals refresh   - Refresh signals from server
  chat <message>    - Send message to AI agent
  status            - Show your account status
  clear             - Clear terminal
  wallet            - Show wallet information
  tier              - Show your tier information`, 'info')
          break

        case 'signals':
          if (args[1] === 'refresh' && session) {
            try {
              const response = await api.getSignals(session.token)
              setSignals(response.signals)
              addOutput(`✓ Refreshed ${response.signals.length} signals`, 'success')
            } catch (error) {
              addOutput(`✗ Failed to refresh signals: ${error}`, 'error')
            }
          } else {
            if (signals.length === 0) {
              addOutput('No signals available. Use "signals refresh" to fetch latest.', 'info')
            } else {
              signals.slice(0, 10).forEach((signal, index) => {
                const releaseTime = new Date(signal.createdAt).toLocaleTimeString()
                addOutput(`[${index + 1}] ${releaseTime} - ${signal.content?.title || 'Signal'} - ${signal.signalType || 'General'}`)
              })
            }
          }
          break

        case 'chat':
          const message = args.slice(1).join(' ')
          if (!message) {
            addOutput('Usage: chat <your message>', 'error')
            break
          }
          
          if (!session) {
            addOutput('✗ Please authenticate first', 'error')
            break
          }

          try {
            const response = await api.sendChatMessage(session.token, message)
            addOutput(`✓ Message sent (ID: ${response.messageId})`, 'success')
            addOutput(`Estimated wait time: ${response.estimatedWaitTime}`, 'info')
            
            // Poll for response
            const pollResponse = async (messageId: string, attempts = 0) => {
              if (attempts > 30) { // Max 5 minutes
                addOutput('✗ Response timeout', 'error')
                return
              }
              
              try {
                const status = await api.getChatStatus(session.token, messageId)
                if (status.status === 'completed' && status.response) {
                  addOutput(`AI: ${status.response}`, 'success')
                } else if (status.status === 'failed') {
                  addOutput('✗ AI response failed', 'error')
                } else {
                  setTimeout(() => pollResponse(messageId, attempts + 1), 10000) // Poll every 10s
                }
              } catch (error) {
                addOutput(`✗ Failed to check response: ${error}`, 'error')
              }
            }
            
            setTimeout(() => pollResponse(response.messageId), 5000)
          } catch (error) {
            addOutput(`✗ Failed to send message: ${error}`, 'error')
          }
          break

        case 'status':
          if (isAuthenticated && session) {
            addOutput(`Connected: ${address}`, 'success')
            addOutput(`Tier: ${session.tier} (Holdings: ${session.holdings} tokens)`, 'info')
            addOutput(`Session expires: ${new Date(session.expiresAt).toLocaleString()}`, 'info')
          } else {
            addOutput('Not authenticated. Please connect your wallet.', 'warning')
          }
          break

        case 'clear':
          // This would be handled by the parent component
          addOutput('Terminal cleared', 'system')
          break

        case 'wallet':
          if (address) {
            addOutput(`Wallet: ${address}`, 'info')
            addOutput(`Status: ${isAuthenticated ? 'Connected' : 'Disconnected'}`, isAuthenticated ? 'success' : 'warning')
          } else {
            addOutput('No wallet connected', 'warning')
          }
          break

        case 'tier':
          if (session) {
            const tierNames = ['', 'Premium', 'Priority', 'Standard', 'Public']
            const benefits = {
              1: 'Instant signals',
              2: '5min delay',
              3: '15min delay', 
              4: '30min delay'
            }
            addOutput(`Tier ${session.tier}: ${tierNames[session.tier]}`, 'success')
            addOutput(`Benefits: ${benefits[session.tier as keyof typeof benefits]}`, 'info')
            addOutput(`Holdings: ${session.holdings} tokens`, 'info')
          } else {
            addOutput('Not authenticated', 'error')
          }
          break

        default:
          if (cmd) {
            addOutput(`Command not found: ${args[0]}. Type 'help' for available commands.`, 'error')
          }
      }
    } catch (error) {
      addOutput(`Error: ${error}`, 'error')
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (currentInput.trim()) {
      setCommandHistory(prev => [...prev, currentInput])
      setHistoryIndex(-1)
      executeCommand(currentInput)
      setCurrentInput('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (historyIndex < commandHistory.length - 1) {
        const newIndex = historyIndex + 1
        setHistoryIndex(newIndex)
        setCurrentInput(commandHistory[commandHistory.length - 1 - newIndex])
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1
        setHistoryIndex(newIndex)
        setCurrentInput(commandHistory[commandHistory.length - 1 - newIndex])
      } else if (historyIndex === 0) {
        setHistoryIndex(-1)
        setCurrentInput('')
      }
    }
  }

  return (
    <TerminalContainer>
      <OutputLine type="success">Signal Terminal v1.0 - Tiered Trading Signals</OutputLine>
      <OutputLine type="info">Type 'help' for available commands</OutputLine>
      {session && (
        <OutputLine type="success">
          Authenticated as {address?.slice(0, 6)}...{address?.slice(-4)}
          <TierBadge tier={session.tier}>Tier {session.tier}</TierBadge>
        </OutputLine>
      )}
      <OutputLine>---</OutputLine>
      
      {terminalHistory.map((entry, index) => (
        <div key={index}>
          {entry.type === 'input' && (
            <PromptLine>
              <span style={{ color: '#00ff00' }}>{entry.command}</span>
            </PromptLine>
          )}
          {entry.output && (
            <OutputLine type={entry.type === 'error' ? 'error' : entry.type === 'system' ? 'info' : undefined}>
              {entry.output}
            </OutputLine>
          )}
        </div>
      ))}
      
      <form onSubmit={handleSubmit}>
        <PromptLine>
          <Input
            ref={inputRef}
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter command..."
            autoComplete="off"
          />
        </PromptLine>
      </form>
    </TerminalContainer>
  )
}