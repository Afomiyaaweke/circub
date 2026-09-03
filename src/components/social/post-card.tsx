'use client'

import { useState } from 'react'
import { Heart, MessageSquare, Repeat2, Send, MoreHorizontal, Trash2, Globe, Image as ImageIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import type { Post, Comment } from '@/lib/types'

interface PostCardProps {
  post: Post
  currentUserId?: string
  onLike: (postId: string) => void
  onComment: (postId: string, comment: Comment) => void
  onDelete: (postId: string) => void
  onMessage?: (userId: string) => void
}

function timeAgo(dateStr: string) {
  const date = new Date(dateStr)
  const now = Date.now()
  const diff = Math.floor((now - date.getTime()) / 1000)
  if (diff < 60) return `${diff}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d`
  return date.toLocaleDateString()
}

export function PostCard({
  post,
  currentUserId,
  onLike,
  onComment,
  onDelete,
  onMessage,
}: PostCardProps) {
  const [showComments, setShowComments] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const { toast } = useToast()

  const isLiked = post.likes.some((l) => l.userId === currentUserId)
  const isOwn = post.authorId === currentUserId

  const handleSubmitComment = async () => {
    if (!commentText.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/posts/${post.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: commentText }),
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Failed')
      }
      const data = await res.json()
      onComment(post.id, data.comment)
      setCommentText('')
      setShowComments(true)
      toast({ title: 'Comment added' })
    } catch (e) {
      toast({
        title: 'Failed to comment',
        description: (e as Error).message,
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <article className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
      {/* Header: avatar, name, headline, time, menu */}
      <div className="p-4 flex items-start gap-3">
        <Avatar className="w-12 h-12 border-2 border-accent">
          <AvatarFallback className="bg-primary/15 text-primary font-semibold">
            {post.author.name.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate">
                {post.author.name}
              </h3>
              {post.author.headline && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {post.author.headline}
                </p>
              )}
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                {timeAgo(post.createdAt)} • <Globe className="w-3 h-3" />
              </p>
            </div>

            <div className="relative shrink-0">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1.5 rounded-full hover:bg-accent text-muted-foreground transition-colors"
                aria-label="More options"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
              {showMenu && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowMenu(false)}
                  />
                  <div className="absolute right-0 top-8 z-20 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[180px]">
                    {isOwn ? (
                      <button
                        onClick={() => {
                          setShowMenu(false)
                          onDelete(post.id)
                        }}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-accent text-destructive flex items-center gap-2"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete post
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setShowMenu(false)
                            onMessage?.(post.author.id)
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-accent text-foreground flex items-center gap-2"
                        >
                          <Send className="w-4 h-4" />
                          Send message
                        </button>
                        <button
                          onClick={() => {
                            setShowMenu(false)
                            toast({ title: 'Post saved to bookmarks' })
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-accent text-foreground"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setShowMenu(false)
                            toast({ title: 'Reported — thanks for letting us know' })
                          }}
                          className="w-full text-left px-4 py-2 text-sm hover:bg-accent text-foreground"
                        >
                          Report post
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {post.content && (
        <div className="px-4 pb-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
          {post.content}
        </div>
      )}

      {/* Image */}
      {post.imageUrl && (
        <div className="border-t border-border bg-accent/20">
          <img
            src={post.imageUrl}
            alt="Post image"
            className="w-full max-h-[480px] object-cover"
          />
        </div>
      )}

      {/* Likes + comments count summary */}
      {(post.likes.length > 0 || post.comments.length > 0) && (
        <div className="px-4 py-2.5 flex items-center justify-between text-xs text-muted-foreground border-b border-border">
          {post.likes.length > 0 ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary">
                <Heart className="w-2.5 h-2.5 text-white fill-white" />
              </span>
              {post.likes.length}
            </span>
          ) : (
            <span />
          )}
          {post.comments.length > 0 && (
            <button
              onClick={() => setShowComments(!showComments)}
              className="hover:underline hover:text-foreground"
            >
              {post.comments.length} comment{post.comments.length !== 1 && 's'}
            </button>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="px-2 py-1 flex items-center justify-between border-b border-border">
        <button
          onClick={() => onLike(post.id)}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md text-sm font-medium hover:bg-accent transition-colors',
            isLiked ? 'text-primary' : 'text-muted-foreground hover:text-primary'
          )}
        >
          <Heart className={cn('w-4 h-4', isLiked && 'fill-primary')} />
          <span className="hidden sm:inline">Like</span>
        </button>

        <button
          onClick={() => setShowComments(!showComments)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <MessageSquare className="w-4 h-4" />
          <span className="hidden sm:inline">Comment</span>
        </button>

        <button
          onClick={() =>
            toast({
              title: 'Reposted!',
              description: `"${post.content.slice(0, 50)}..." shared to your network.`,
            })
          }
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Repeat2 className="w-4 h-4" />
          <span className="hidden sm:inline">Repost</span>
        </button>

        <button
          onClick={() => onMessage?.(post.author.id)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-md text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline">Send</span>
        </button>
      </div>

      {/* Comments section */}
      {showComments && (
        <div className="bg-accent/10 px-4 py-3">
          {/* Existing comments */}
          {post.comments.length > 0 && (
            <div className="space-y-3 mb-3">
              {post.comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2">
                  <Avatar className="w-8 h-8 border border-accent">
                    <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                      {c.author.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="bg-card rounded-2xl px-3 py-2 inline-block">
                      <p className="text-sm font-semibold text-foreground">
                        {c.author.name}
                      </p>
                      <p className="text-sm text-foreground mt-0.5 whitespace-pre-wrap break-words">
                        {c.content}
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1 ml-2">
                      {timeAgo(c.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add comment */}
          <div className="flex items-start gap-2">
            <Avatar className="w-8 h-8 border border-accent">
              <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                M
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 flex items-end gap-2">
              <Textarea
                placeholder="Add a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="min-h-[40px] resize-none rounded-2xl bg-card border-border text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    handleSubmitComment()
                  }
                }}
              />
              <Button
                size="sm"
                onClick={handleSubmitComment}
                disabled={submitting || !commentText.trim()}
                className="bg-primary hover:bg-primary/90 h-9 px-3"
              >
                Post
              </Button>
            </div>
          </div>
        </div>
      )}
    </article>
  )
}
