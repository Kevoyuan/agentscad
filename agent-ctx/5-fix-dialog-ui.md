# Task 5: Fix New CAD Job Dialog UI Issues

**Agent:** Code Agent
**Status:** Completed
**Date:** 2025-03-05

## Summary

Fixed 10 UI issues in the "New CAD Job" dialog identified by VLM analysis, focusing on text contrast, spacing consistency, and visual prominence.

## Changes Made

### `/home/z/my-project/src/app/page.tsx` (Dialog code ~lines 1375-1487)
- Dialog background: `bg-[var(--app-surface-95)]` → `bg-[var(--app-dialog-bg)]`
- Gradient separator: `<div className="gradient-divider" />` → `<Separator />`
- Section labels: All unified to `text-[10px]` + `text-[var(--app-text-secondary)]`
- Recent Requests: Better text contrast, hover states, increased max height, proper spacing
- Textarea counter/hint: `text-[9px] text-[var(--app-text-dim)]` → `text-[10px] text-[var(--app-text-muted)]`
- Priority labels: `text-[8px] text-[var(--app-text-dim)]` → `text-[9px] text-[var(--app-text-muted)]`
- Tags placeholder: Shortened to "enclosure, prototype, urgent"
- Create Job button: Added `text-white font-medium`

### `/home/z/my-project/src/components/cad/job-templates.tsx`
- Templates label: `text-[var(--app-text-muted)]` → `text-[var(--app-text-secondary)]`
- Description: `text-[8px] opacity-60` → `text-[9px] opacity-70`
- Grid gap: `gap-2` → `gap-2.5`
- Item gap: `gap-2` → `gap-2.5`

## Verification
- `bun run lint` — passed, no errors
- Dev server — running successfully on port 3000
