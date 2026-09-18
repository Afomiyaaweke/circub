'use client'

// Dark mode provider - class-based so it plays with the .dark variant in
// globals.css. Default stays "light" so existing users keep the current look;
// the toggle flips light/dark and next-themes persists it in localStorage.
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ComponentProps } from 'react'

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
