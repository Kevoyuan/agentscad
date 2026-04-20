# Task 2-a: WebSocket + ViewerControls + Custom Scrollbar

## Agent: Fullstack Dev Agent
## Date: 2026-04-18

## Summary
Implemented WebSocket real-time updates, integrated ViewerControls into ThreeDViewer, and applied custom scrollbar globally.

## Work Completed

### 1. WebSocket Mini-Service
- Created `mini-services/ws-service/` with socket.io on port 3003
- Broadcast endpoint `POST /broadcast` for API routes to call
- Health check endpoint, welcome message on connection, graceful disconnect handling
- `bun run dev` starts with `bun index.ts`

### 2. API Route Broadcast Integration
- Created shared helper `src/lib/ws-broadcast.ts`
- Added `broadcastWs()` calls to 7 API routes after database operations
- All calls silently fail if ws-service is down

### 3. Frontend WebSocket + Polling Fallback
- Installed `socket.io-client`
- Connects to `/?XTransformPort=3003`
- On `job:update` event → `loadJobs()`
- Fallback: 5s polling when WS disconnects, stop polling on reconnect

### 4. ViewerControls Integration
- Imported ViewerControls + useViewerControls into three-d-viewer.tsx
- Wired all 9 controls: autoRotate, wireframe, showGrid, showAxes, darkBg, zoomIn, zoomOut, resetCamera, screenshot
- Added `preserveDrawingBuffer: true` for screenshot support
- Stored Three.js refs for real-time manipulation

### 5. Custom Scrollbar Global Application
- Added `CustomScrollbarStyle` component to layout.tsx
- Added `CUSTOM_SCROLLBAR_CLASS` to body element

## Lint Status
✅ PASS - 0 errors, 0 warnings
