'use client'

import { ThemeProvider } from 'next-themes'
import { CustomScrollbarStyle } from '@/components/cad/custom-scrollbar'
import { Toaster } from '@/components/ui/toaster'

const CUSTOM_SCROLLBAR_CLASS = 'cad-custom-scrollbar'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <CustomScrollbarStyle />
      {children}
      <Toaster />
    </ThemeProvider>
  )
}
