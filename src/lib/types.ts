// Shared types for Social Circle (LinkedIn-style + Local Price Posts)
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
  hasPendingRequest?: boolean

  // Local contributor fields
  isLocal?: boolean
  verifiedLocal?: boolean
  rating?: number
  expertiseTags?: string[] | string | null
  helpfulVotes?: number
  localPostCount?: number
  incomingInvitationsCount?: number
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
  otherUser?: User
  isIncoming?: boolean
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

// =====================================================
// LOCAL PRICE POSTS types
// =====================================================

export type LocalPricePostType = 'PRODUCT' | 'SERVICE'

export interface LocalPricePost {
  id: string
  postType: LocalPricePostType
  productName: string
  description?: string | null
  country: string
  city?: string | null
  neighborhood?: string | null
  market?: string | null
  currency: string
  priceMin: number
  priceMax: number
  recommendedPrice?: number | null
  touristPrice?: number | null
  personalPrice?: number | null
  localTip?: string | null
  category: string
  imageUrl?: string | null
  authorId: string
  author: LocalPriceAuthor
  helpfulCount: number
  notAccurateCount: number
  myVote?: 'HELPFUL' | 'NOT_ACCURATE' | null
  createdAt: string
}

export interface LocalPriceAuthor {
  id: string
  name: string
  avatarColor: string
  isLocal?: boolean
  verifiedLocal?: boolean
  rating?: number
  helpfulVotes?: number
  localPostCount?: number
  headline?: string | null
  location?: string | null
  expertiseTags?: string[] | null
}

export interface LocalPriceConsensus {
  productName: string
  country: string
  city?: string | null
  currency: string
  avgPriceMin: number
  avgPriceMax: number
  recommendedPrice: number | null
  avgTouristPrice: number | null
  reportCount: number
  // Fair price verdict
  verdict: 'fair' | 'expensive' | 'cheap' | 'unknown'
  // Posts that contributed
  contributingPosts: LocalPricePost[]
}

export interface PriceHistoryPoint {
  label: string // e.g. "Current", "3 months ago"
  priceMin: number
  priceMax: number
  recommendedPrice: number | null
  sampleCount: number
  date?: string
}

export interface LocalPriceHistory {
  productName: string
  country: string
  city?: string | null
  currency: string
  history: PriceHistoryPoint[]
}

export type TabKey = 'feed' | 'local' | 'network' | 'bookmark'
