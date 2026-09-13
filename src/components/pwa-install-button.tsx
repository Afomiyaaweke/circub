'use client'

import { useEffect, useState } from 'react'
import { MoreVertical, Share, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * "Get the mobile app" button for the landing page.
 *
 * - Android/Chrome desktop: captures `beforeinstallprompt` and triggers the
 *   real one-tap install dialog (app lands on the home screen / desktop).
 * - iOS or browsers without the prompt: opens step-by-step install
 *   instructions (Add to Home Screen), highlighting the user's platform.
 * - Hidden entirely when the app is already running installed (standalone).
 */
export function PwaInstallButton({ className }: { className?: string }) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [open, setOpen] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean }
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
    if (standalone) {
      setInstalled(true)
      return
    }

    setIsIos(/iphone|ipad|ipod/i.test(window.navigator.userAgent))

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPromptEvent(e as InstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setPromptEvent(null)
      toast({
        title: 'circub installed',
        description: 'Look for the green C icon on your home screen.',
      })
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [toast])

  const handleClick = async () => {
    if (promptEvent) {
      try {
        await promptEvent.prompt()
        const choice = await promptEvent.userChoice
        if (choice.outcome === 'accepted') {
          toast({
            title: 'Installing circub…',
            description: 'It will appear on your home screen in seconds.',
          })
        }
        setPromptEvent(null)
      } catch {
        setOpen(true)
      }
    } else {
      setOpen(true)
    }
  }

  if (installed) return null

  return (
    <>
      <Button
        onClick={handleClick}
        size="lg"
        variant="outline"
        className={cn(
          'h-12 px-6 gap-2 border-foreground/15 bg-foreground/5 text-foreground hover:border-foreground hover:bg-foreground hover:text-background',
          className
        )}
      >
        <Smartphone className="w-4 h-4" />
        Get the mobile app
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-primary" />
              Install the circub app
            </DialogTitle>
            <DialogDescription>
              Free, takes seconds · full-screen app with its own icon on your home screen.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            <div
              className={cn(
                'rounded-lg border p-3 space-y-1.5',
                !isIos ? 'border-primary/40 bg-primary/5' : ''
              )}
            >
              <p className="font-medium text-foreground">Android · Chrome</p>
              <ol className="list-decimal list-inside text-muted-foreground space-y-1">
                <li>
                  Tap the <MoreVertical className="inline w-3.5 h-3.5 -mt-0.5" /> menu at the
                  top right
                </li>
                <li>
                  Tap{' '}
                  <span className="font-medium text-foreground">
                    Add to Home screen
                  </span>{' '}
                  or <span className="font-medium text-foreground">Install app</span>
                </li>
              </ol>
            </div>

            <div
              className={cn(
                'rounded-lg border p-3 space-y-1.5',
                isIos ? 'border-primary/40 bg-primary/5' : ''
              )}
            >
              <p className="font-medium text-foreground">iPhone · Safari</p>
              <ol className="list-decimal list-inside text-muted-foreground space-y-1">
                <li>
                  Tap the <Share className="inline w-3.5 h-3.5 -mt-0.5" /> share button at
                  the bottom
                </li>
                <li>
                  Scroll and tap{' '}
                  <span className="font-medium text-foreground">Add to Home Screen</span>
                </li>
              </ol>
            </div>

            <p className="text-xs text-muted-foreground">
              Tip: some browsers also show an “Install” option directly in the address bar.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
