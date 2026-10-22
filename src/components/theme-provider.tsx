'use client'

// Dark mode provider - class-based so it plays with the .dark variant in
// globals.css. v205: default flips to "dark" - the app now opens as the
// Quest Hub dark-purple reference the user asked for ('make the color from
// the green to this'); the toggle still flips light/dark and next-themes
// persists the choice in localStorage.
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import type { ComponentProps } from 'react'

export function ThemeProvider({ children, ...props }: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}
