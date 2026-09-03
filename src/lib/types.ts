// Shared types for Social Circle (LinkedIn-style)
export interface User {
  id: string
  name: string
  email?: string
  avatarColor: string
  bio?: string | null
  headline?: string | null
  location?: string | null
  postsCount: number
  followersCount: number
  likesCount?: number
  connectionsCount?: number
  followingCount?: number
  isFollowing?: boolean
  isConnected?: boolean
  hasPendingRequest?: boolean // outgoing pending
}

export interface Product {
  id: string
  name: string
  quantity: string
  country: string
  currency: string
  price: number
  unit?: string | null
  gender?: string | null
  description?: string | null
  imageUrl?: string | null
  category: string
  author: {
    id: string
    name: string
    avatarColor: string
  }
  likes?: { id: string; userId: string }[]
  createdAt: string
}

export interface Post {
  id: string
  content: string
  imageUrl?: string | null
  authorId: string
  author: {
    id: string
    name: string
    avatarColor: string
    headline?: string | null
    location?: string | null
  }
  likes: { id: string; userId: string }[]
  comments: Comment[]
  createdAt: string
}

export interface Comment {
  id: string
  content: string
  authorId: string
  author: {
    id: string
    name: string
    avatarColor: string
    headline?: string | null
  }
  createdAt: string
}

export interface Connection {
  id: string
  requesterId: string
  receiverId: string
  status: 'PENDING' | 'ACCEPTED' | 'IGNORED'
  note?: string | null
  createdAt: string
  // Populated fields
  otherUser?: User
  isIncoming?: boolean // true if receiverId = me, false if requesterId = me
}

export interface Message {
  id: string
  senderId: string
  receiverId: string
  content: string
  read: boolean
  createdAt: string
}

export interface Conversation {
  user: User
  lastMessage: Message | null
  unreadCount: number
}

export type TabKey = 'feed' | 'discover' | 'network' | 'bookmark'
