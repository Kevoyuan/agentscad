"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "group toast group-[.toaster]:bg-[var(--app-surface-raised)] group-[.toaster]:text-[var(--app-text-primary)] group-[.toaster]:border-[color:var(--app-border)] group-[.toaster]:shadow-2xl group-[.toaster]:rounded-xl group-[.toaster]:font-sans group-[.toaster]:backdrop-blur-md",
          description: "group-[.toast]:text-[var(--app-text-muted)] group-[.toast]:text-xs",
          actionButton: "group-[.toast]:bg-[var(--app-accent)] group-[.toast]:text-white",
          cancelButton: "group-[.toast]:bg-[var(--app-surface)] group-[.toast]:text-[var(--app-text-secondary)]",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
