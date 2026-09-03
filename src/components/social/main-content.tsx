'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Search,
  Plus,
  Globe,
  Sparkles,
  Filter,
  PackageOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { AddProductModal } from './add-product-modal'
import { ProductCard } from './product-card'
import type { Product, User, TabKey } from '@/lib/types'

interface MainContentProps {
  user: User | null
  activeTab: TabKey
  refreshSignal: number
  onUserChanged: () => void
  onRefreshAll: () => void
}

export function MainContent({
  user,
  activeTab,
  refreshSignal,
  onUserChanged,
  onRefreshAll,
}: MainContentProps) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All categories')
  const [personFilter, setPersonFilter] = useState('All people')
  const [people, setPeople] = useState<{ id: string; name: string }[]>([])
  const [modalOpen, setModalOpen] = useState(false)

  const { toast } = useToast()

  const TAB_TITLES: Record<string, { title: string; subtitle: string; icon: typeof Globe }> = {
    feed: {
      title: 'Country Product Prices',
      subtitle: 'See fresh listings from your network and the wider world.',
      icon: Globe,
    },
    local: {
      title: 'Discover Local Prices',
      subtitle: 'Explore trending product prices from across the world.',
      icon: Sparkles,
    },
    network: {
      title: 'Country Product Prices',
      subtitle: "Set and track your country's product pricing for the world to see.",
      icon: Globe,
    },
    bookmark: {
      title: 'Saved Product Prices',
      subtitle: 'Products you have bookmarked for later.',
      icon: Globe,
    },
  }

  const tabMeta = TAB_TITLES[activeTab]

  // Load people list for filter
  useEffect(() => {
    let mounted = true
    fetch('/api/users')
      .then((r) => r.json())
      .then((data) => {
        if (!mounted) return
        const list = (data.users as any[]).map((u) => ({ id: u.id, name: u.name }))
        setPeople(list)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [refreshSignal])

  // Load products with filters
  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('search', search.trim())
      if (category && category !== 'All categories') params.set('category', category)

      // For "Network" tab: show my own products
      // For "Feed" / "Discover": show all
      // For "Bookmark": show all (simulated saved state)
      let authorId = ''
      if (activeTab === 'network' && user) {
        authorId = user.id
      } else if (activeTab === 'feed' && personFilter !== 'All people') {
        const found = people.find((p) => p.name === personFilter)
        if (found) authorId = found.id
      }
      if (authorId) params.set('authorId', authorId)

      const res = await fetch(`/api/products?${params.toString()}`)
      const data = await res.json()
      setProducts(data.products || [])
    } catch {
      setProducts([])
    } finally {
      setLoading(false)
    }
  }, [search, category, personFilter, activeTab, user, people, refreshSignal])

  useEffect(() => {
    const t = setTimeout(fetchProducts, 250) // debounce search
    return () => clearTimeout(t)
  }, [fetchProducts])

  const handleCreated = () => {
    fetchProducts()
    onUserChanged()
    onRefreshAll()
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Failed to delete')
      }
      toast({ title: 'Product deleted' })
      fetchProducts()
      onUserChanged()
      onRefreshAll()
    } catch (e) {
      toast({
        title: 'Delete failed',
        description: (e as Error).message,
        variant: 'destructive',
      })
    }
  }

  const handleLike = async (id: string) => {
    try {
      await fetch(`/api/products/${id}/like`, { method: 'POST' })
      fetchProducts()
    } catch {
      /* ignore */
    }
  }

  const showAddButton = activeTab === 'network' || activeTab === 'feed'

  return (
    <main className="flex-1 min-w-0">
      {/* Panel header */}
      <Card className="p-5 shadow-sm mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <tabMeta.icon className="w-5 h-5 text-primary shrink-0" />
              <h2 className="text-lg font-bold text-foreground truncate">
                {tabMeta.title}
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
              {tabMeta.subtitle}
            </p>
          </div>

          {showAddButton && (
            <Button
              onClick={() => setModalOpen(true)}
              className="bg-primary hover:bg-primary/90 gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Product Price
            </Button>
          )}
        </div>
      </Card>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search products, places..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-card"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-[150px] sm:w-[170px] bg-card">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All categories">All categories</SelectItem>
            <SelectItem value="Beverages">Beverages</SelectItem>
            <SelectItem value="Spices">Spices</SelectItem>
            <SelectItem value="Seafood">Seafood</SelectItem>
            <SelectItem value="Textiles">Textiles</SelectItem>
            <SelectItem value="Electronics">Electronics</SelectItem>
            <SelectItem value="Handicrafts">Handicrafts</SelectItem>
            <SelectItem value="Agriculture">Agriculture</SelectItem>
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
        {activeTab === 'feed' && (
          <Select value={personFilter} onValueChange={setPersonFilter}>
            <SelectTrigger className="w-[140px] sm:w-[160px] bg-card">
              <SelectValue placeholder="By Person" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All people">All people</SelectItem>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.name}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Products list / empty state */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-4 h-32 animate-pulse bg-accent/30" />
          ))}
        </div>
      ) : products.length === 0 ? (
        <Card className="p-10 text-center shadow-sm">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-accent mb-4">
            <PackageOpen className="w-7 h-7 text-primary" />
          </div>
          <h3 className="font-bold text-foreground text-lg">
            No product listing yet
          </h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            {activeTab === 'network'
              ? "Be the first to post your country's product price for the world to see!"
              : 'No products match your filters. Try adjusting search or filter criteria.'}
          </p>
          {showAddButton && (
            <Button
              onClick={() => setModalOpen(true)}
              className="mt-5 bg-primary hover:bg-primary/90 gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Add Product Price
            </Button>
          )}
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground px-1">
            {products.length} product{products.length !== 1 && 's'} found
          </p>
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              canDelete={user ? p.author.id === user.id : false}
              onLike={handleLike}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <AddProductModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onCreated={handleCreated}
      />
    </main>
  )
}
