/**
 * Broadcast an event to all connected WebSocket clients via the ws-service.
 * Silently fails if the ws-service is down.
 */
export async function broadcastWs(
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    await fetch("http://localhost:3003/broadcast?XTransformPort=3003", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data }),
    });
  } catch {
    // silently fail if ws-service is down
  }
}
