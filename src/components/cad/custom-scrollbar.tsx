'use client'

import React from 'react'

// ─── Custom Scrollbar Styles ────────────────────────────────────────────────
// Thin scrollbar (4px), dark track (zinc-900), violet thumb on hover,
// rounded thumb, smooth scrolling, both vertical and horizontal.

/**
 * CSS class name that applies custom scrollbar styling.
 * Apply this to any scrollable container element.
 *
 * Features:
 * - Thin 4px scrollbar
 * - Dark zinc-900 track
 * - Violet thumb on hover
 * - Rounded thumb
 * - Smooth scrolling
 * - Both vertical and horizontal scrollbars
 */
export const CUSTOM_SCROLLBAR_CLASS = 'cad-custom-scrollbar'

/**
 * Inject the custom scrollbar styles into the document head.
 * Call this once at app initialization, or use the `CustomScrollbarStyle`
 * component instead for automatic injection.
 */
export function injectCustomScrollbarStyles() {
  if (typeof document === 'undefined') return

  const id = 'cad-custom-scrollbar-styles'
  if (document.getElementById(id)) return

  const style = document.createElement('style')
  style.id = id
  style.textContent = `
    .cad-custom-scrollbar {
      scrollbar-width: thin;
      scrollbar-color: rgba(63, 63, 70, 0.5) rgba(24, 24, 27, 0.8);
      scroll-behavior: smooth;
    }

    .cad-custom-scrollbar::-webkit-scrollbar {
      width: 4px;
      height: 4px;
    }

    .cad-custom-scrollbar::-webkit-scrollbar-track {
      background: rgba(24, 24, 27, 0.8);
      border-radius: 4px;
    }

    .cad-custom-scrollbar::-webkit-scrollbar-thumb {
      background: rgba(63, 63, 70, 0.5);
      border-radius: 4px;
      transition: background-color 0.2s ease;
    }

    .cad-custom-scrollbar::-webkit-scrollbar-thumb:hover {
      background: rgba(139, 92, 246, 0.5);
    }

    .cad-custom-scrollbar::-webkit-scrollbar-thumb:active {
      background: rgba(139, 92, 246, 0.7);
    }

    .cad-custom-scrollbar::-webkit-scrollbar-corner {
      background: transparent;
    }
  `
  document.head.appendChild(style)
}

/**
 * A style injector component that adds custom scrollbar CSS to the document.
 * Place this once in your app layout or root component.
 * It renders nothing to the DOM.
 */
export function CustomScrollbarStyle() {
  React.useEffect(() => {
    injectCustomScrollbarStyles()
  }, [])
  return null
}

/**
 * Wrapper component that applies custom scrollbar styling to its scrollable content.
 *
 * Usage:
 * ```tsx
 * <CustomScrollbar className="h-96">
 *   {longContent}
 * </CustomScrollbar>
 * ```
 */
export function CustomScrollbar({
  children,
  className = '',
  ...props
}: {
  children: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <>
      <CustomScrollbarStyle />
      <div
        className={`cad-custom-scrollbar overflow-auto ${className}`}
        {...props}
      >
        {children}
      </div>
    </>
  )
}
