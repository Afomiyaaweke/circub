'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Send, ArrowLeft, MessageCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'
import type { User, Conversation, Message } from '@/lib/types'

interface MessageModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  // If targetUserId is set, immediately open conversation with that user
  targetUserId: string | null
  me: User | null
}

function timeLabel(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    day: 'numeric',
  })
}

export function MessageModal({
  open,
  onOpenChange,
  targetUserId,
  me,
}: MessageModalProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeUserId, setActiveUserId] = useState<string | null>(targetUserId)
  const [activeUser, setActiveUser] = useState<User | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const [loadingConvs, setLoadingConvs] = useState(true)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [sending, setSending] = useState(false)
  const [showList, setShowList] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    setLoadingConvs(true)
    try {
      const res = await fetch('/api/conversations')
      const data = await res.json()
      setConversations(data.conversations || [])
    } catch {
      setConversations([])
    } finally {
      setLoadingConvs(false)
    }
  }, [])

  // Fetch active user details + messages
  useEffect(() => {
    if (!activeUserId) {
      setActiveUser(null)
      setMessages([])
      return
    }
    setLoadingMsgs(true)
    Promise.all([
      fetch(`/api/auth/messages/${activeUserId}`).then((r) => r.json()),
      fetch('/api/users').then((r) => r.json()),
    ])
      .then(([msgs, usersData]) => {
        setMessages(msgs.messages || [])
        const found = (usersData.users as any[]).find((u) => u.id === activeUserId)
        if (found) {
          setActiveUser({
            ...found,
            postsCount: found.postsCount ?? 0,
            followersCount: found.followersCount ?? 0,
          })
        }
      })
      .catch(() => {
        setMessages([])
      })
      .finally(() => {
        setLoadingMsgs(false)
        setShowList(false)
      })
  }, [activeUserId])

  // On open, fetch conversations; if targetUserId set, switch to that conversation
  useEffect(() => {
    if (open) {
      fetchConversations()
      if (targetUserId) {
        setActiveUserId(targetUserId)
        setShowList(false)
      } else {
        setShowList(true)
      }
    } else {
      // When closing, clear target
      setActiveUserId(null)
      setDraft('')
    }
  }, [open, targetUserId, fetchConversations])

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!draft.trim() || !activeUserId) return
    setSending(true)
    try {
      const res = await fetch(`/api/auth/messages/${activeUserId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: draft }),
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Failed')
      }
      const data = await res.json()
      setMessages((prev) => [...prev, data.message])
      setDraft('')
      fetchConversations() // refresh sidebar order
    } catch (e) {
      toast({
        title: 'Send failed',
        description: (e as Error).message,
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  const isMyMessage = (m: Message) => me && m.senderId === me.id

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Messages</DialogTitle>
        <div className="flex h-[80vh]">
          {/* Conversations list (hidden on mobile when chatting) */}
          <div
            className={cn(
              'w-full sm:w-64 shrink-0 border-r border-border flex flex-col',
              !showList && 'hidden sm:flex'
            )}
          >
            <div className="p-4 border-b border-border bg-card">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-primary" />
                  Messages
                </h3>
                <span className="text-xs text-muted-foreground">
                  {conversations.length}
                </span>
              </div>
              {me && (
                <p className="text-xs text-muted-foreground mt-1">
                  Logged in as {me.name}
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin">
              {loadingConvs ? (
                <p className="text-xs text-muted-foreground p-4 text-center">
                  Loading...
                </p>
              ) : conversations.length === 0 ? (
                <p className="text-xs text-muted-foreground p-4 text-center">
                  No conversations yet.
                  <br />
                  Connect with people and start chatting!
                </p>
              ) : (
                conversations.map((c) => (
                  <button
                    key={c.user.id}
                    onClick={() => {
                      setActiveUserId(c.user.id)
                      setShowList(false)
                    }}
                    className={cn(
                      'w-full text-left p-3 hover:bg-accent transition-colors flex items-start gap-3 border-b border-border/50',
                      activeUserId === c.user.id && 'bg-accent/60'
                    )}
                  >
                    <Avatar className="w-10 h-10 border border-accent">
                      <AvatarFallback className="bg-primary/15 text-primary font-semibold text-sm">
                        {c.user.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {c.user.name}
                        </p>
                        {c.unreadCount > 0 && (
                          <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-semibold bg-primary text-primary-foreground rounded-full shrink-0">
                            {c.unreadCount}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">
                        {c.lastMessage
                          ? `${c.lastMessage.senderId === me?.id ? 'You: ' : ''}${c.lastMessage.content}`
                          : '-'}
                      </p>
                      {c.lastMessage && (
                        <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                          {timeLabel(c.lastMessage.createdAt)}
                        </p>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Conversation thread */}
          <div
            className={cn(
              'flex-1 flex flex-col min-w-0',
              showList && 'hidden sm:flex'
            )}
          >
            {activeUser ? (
              <>
                {/* Header */}
                <div className="p-3 border-b border-border bg-card flex items-center gap-3">
                  <button
                    onClick={() => setShowList(true)}
                    className="sm:hidden p-1.5 rounded-md hover:bg-accent text-muted-foreground"
                    aria-label="Back to conversations"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <Avatar className="w-9 h-9 border border-accent">
                    <AvatarFallback className="bg-primary/15 text-primary font-semibold text-sm">
                      {activeUser.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {activeUser.name}
                    </p>
                    {activeUser.headline && (
                      <p className="text-xs text-muted-foreground truncate">
                        {activeUser.headline}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => onOpenChange(false)}
                    className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3 bg-accent/10">
                  {loadingMsgs ? (
                    <p className="text-sm text-muted-foreground text-center">
                      Loading messages...
                    </p>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-10">
                      <Avatar className="w-14 h-14 mx-auto border-2 border-accent">
                        <AvatarFallback className="bg-primary/15 text-primary text-lg font-semibold">
                          {activeUser.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <p className="mt-3 text-sm font-medium text-foreground">
                        {activeUser.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Say hi to start the conversation
                      </p>
                    </div>
                  ) : (
                    messages.map((m) => {
                      const mine = isMyMessage(m)
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            'flex items-end gap-2',
                            mine ? 'flex-row-reverse' : 'flex-row'
                          )}
                        >
                          <Avatar className="w-7 h-7 border border-accent shrink-0">
                            <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                              {mine
                                ? me?.name.charAt(0).toUpperCase()
                                : activeUser.name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div
                            className={cn(
                              'max-w-[75%] rounded-2xl px-3 py-2',
                              mine
                                ? 'bg-primary text-primary-foreground rounded-br-sm'
                                : 'bg-card border border-border text-foreground rounded-bl-sm'
                            )}
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">
                              {m.content}
                            </p>
                            <p
                              className={cn(
                                'text-[10px] mt-1',
                                mine ? 'text-primary-foreground/70' : 'text-muted-foreground'
                              )}
                            >
                              {timeLabel(m.createdAt)}
                            </p>
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Composer */}
                <div className="p-3 border-t border-border bg-card flex items-end gap-2">
                  <Input
                    placeholder="Write a message..."
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSend()
                      }
                    }}
                    className="flex-1"
                  />
                  <Button
                    onClick={handleSend}
                    disabled={sending || !draft.trim()}
                    className="bg-primary hover:bg-primary/90 gap-1.5"
                  >
                    <Send className="w-4 h-4" />
                    <span className="hidden sm:inline">Send</span>
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent mb-3">
                  <MessageCircle className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground">Your messages</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Send a private message to a connection. Pick a conversation
                  or start a new one.
                </p>
                <Button
                  onClick={() => setShowList(true)}
                  className="mt-4 bg-primary hover:bg-primary/90"
                >
                  Show conversations
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
