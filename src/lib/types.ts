// Shared types for Social Circle
export interface User {
  id: string
  name: string
  email?: string
  avatarColor: string
  bio?: string | null
  postsCount: number
  followersCount: number
  likesCount?: number
  followingCount?: number
  isFollowing?: boolean
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

export interface Trend {
  label: string
  count: number
}

export type TabKey = 'feed' | 'discover' | 'network' | 'bookmark'
