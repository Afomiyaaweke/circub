'use client'

import { useState, useEffect, useCallback } from 'react'
import { Sparkles, TrendingUp, Newspaper } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PostComposer } from './post-composer'
import { PostCard } from './post-card'
import { useToast } from '@/hooks/use-toast'
import type { User, Post, Comment } from '@/lib/types'

interface FeedTabProps {
  user: User
  onMessage: (userId: string) => void
  onRefreshUser: () => void
}

export function FeedTab({ user, onMessage, onRefreshUser }: FeedTabProps) {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/posts')
      const data = await res.json()
      setPosts(data.posts || [])
    } catch {
      setPosts([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  const handleLike = async (postId: string) => {
    try {
      const res = await fetch(`/api/posts/${postId}/like`, { method: 'POST' })
      const data = await res.json()
      setPosts((prev) =>
        prev.map((p) => {
          if (p.id !== postId) return p
          if (data.liked) {
            // Add my like
            const hasMyLike = p.likes.some((l) => l.userId === user.id)
            if (hasMyLike) return p
            return { ...p, likes: [...p.likes, { id: 'temp', userId: user.id }] }
          } else {
            return { ...p, likes: p.likes.filter((l) => l.userId !== user.id) }
          }
        })
      )
    } catch {
      /* ignore */
    }
  }

  const handleComment = (postId: string, comment: Comment) => {
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, comments: [...p.comments, comment] } : p
      )
    )
  }

  const handleDelete = async (postId: string) => {
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Failed to delete')
      }
      setPosts((prev) => prev.filter((p) => p.id !== postId))
      toast({ title: 'Post deleted' })
      onRefreshUser()
    } catch (e) {
      toast({
        title: 'Delete failed',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  const handlePosted = (post: Post) => {
    setPosts((prev) => [post, ...prev])
    onRefreshUser()
  }

  return (
    <div className="space-y-4">
      <PostComposer user={user} onPosted={handlePosted} />

      {/* Feed header / sort bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-6 h-0.5 bg-primary rounded-full" />
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Newspaper className="w-4 h-4 text-primary" />
            Your feed
          </h2>
        </div>
        <div className="text-xs text-muted-foreground">
          Sort by: <span className="font-medium text-foreground">Top</span>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Skeleton className="w-12 h-12 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-2.5 w-48" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-2/3" />
            </Card>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent mb-3">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground">Your feed is quiet</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Start following more people or share your first post to fill your
            feed with global trade updates.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {posts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              currentUserId={user.id}
              onLike={handleLike}
              onComment={handleComment}
              onDelete={handleDelete}
              onMessage={onMessage}
            />
          ))}
          <div className="text-center py-6 text-xs text-muted-foreground flex items-center justify-center gap-2">
            <TrendingUp className="w-3.5 h-3.5" />
            You&apos;ve reached the end · add more connections for more posts.
          </div>
        </div>
      )}
    </div>
  )
}
