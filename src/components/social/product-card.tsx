'use client'

import { Heart, MapPin, Tag, Trash2, User as UserIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Product } from '@/lib/types'

interface ProductCardProps {
  product: Product
  canDelete?: boolean
  onLike?: (productId: string) => void
  onDelete?: (productId: string) => void
}

export function ProductCard({
  product,
  canDelete = false,
  onLike,
  onDelete,
}: ProductCardProps) {
  const likesCount = product.likes?.length ?? 0
  const isLiked = product.likes?.some((l) => l.userId === product.author.id) ?? false

  return (
    <Card className="overflow-hidden p-0 shadow-sm hover:shadow-md transition-shadow group">
      <div className="flex flex-col sm:flex-row">
        {/* Image / placeholder */}
        <div className="relative w-full sm:w-32 h-32 sm:h-auto shrink-0 bg-accent/40 flex items-center justify-center">
          {product.imageUrl ? (
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="text-3xl font-bold text-primary/40">
              {product.name.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/95 text-[10px] font-medium text-foreground shadow-sm">
            <Tag className="w-3 h-3 text-primary" />
            {product.category}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 p-4 flex flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate">
                {product.name}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {product.country}
                {product.quantity && (
                  <span className="ml-2 text-muted-foreground/70">
                    • {product.quantity}
                  </span>
                )}
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="text-lg font-bold text-primary">
                {product.currency} {product.price.toFixed(2)}
              </div>
              {product.unit && (
                <div className="text-[10px] text-muted-foreground">
                  {product.unit}
                </div>
              )}
            </div>
          </div>

          {product.description && (
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2 flex-1">
              {product.description}
            </p>
          )}

          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <div className="w-5 h-5 rounded-full bg-primary/15 text-primary flex items-center justify-center text-[10px] font-semibold">
                  {product.author.name.charAt(0).toUpperCase()}
                </div>
                <span>{product.author.name}</span>
              </div>
              {product.gender && (
                <span className="text-xs text-muted-foreground">
                  For: {product.gender}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onLike?.(product.id)}
                className={cn(
                  'h-8 px-2 text-xs gap-1',
                  isLiked
                    ? 'text-primary hover:text-primary'
                    : 'text-muted-foreground hover:text-primary'
                )}
              >
                <Heart
                  className={cn('w-4 h-4', isLiked && 'fill-primary')}
                />
                <span>{likesCount}</span>
              </Button>

              {canDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete?.(product.id)}
                  className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
