---
Task ID: 1
Agent: Main Agent
Task: Fix frontend not loading - dev server crashes on JS chunk compilation

Work Log:
- Diagnosed issue: Next.js dev server crashes when compiling client-side JS chunks concurrently
- Root cause: Turbopack dev server uses ~1.8GB memory for page compilation; concurrent chunk compilation pushes it over available memory
- Applied lazy loading for heavy components using `next/dynamic` with `ssr: false`:
  - ThreeDViewer (three.js - largest dependency)
  - ScadViewer
  - ChatPanel
  - StatsDashboard
  - JobCompare
  - JobStatusPage
  - ResearchPanel
  - TimelinePanel
  - NotesPanel
- Created start-dev.sh startup script with sequential pre-compilation step
- Changed package.json dev script from `next dev -p 3000 2>&1 | tee dev.log` to `next dev -p 3000` (removed tee pipe that was interfering)
- Verified frontend loads correctly with 9 jobs, pipeline visualization, and all UI elements

Stage Summary:
- Frontend now loads and displays correctly in browser
- Server stability achieved through: lazy loading + sequential pre-compilation + process isolation (setsid)
- Initial "Failed to load jobs" error is a timing issue during first page load - resolves after server is fully ready
- Server needs pre-compilation warmup before browser access to avoid OOM on concurrent compilation

---
Task ID: 2
Agent: Main Agent
Task: Set up cron job for periodic QA review

Work Log:
- Creating cron job with webDevReview kind for every 15 minutes

Stage Summary:
- Pending creation
