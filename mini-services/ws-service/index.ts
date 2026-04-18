import { createServer, IncomingMessage, ServerResponse } from "http";
import { Server as SocketIOServer } from "socket.io";

const PORT = 3003;

const connectedClients = new Set<string>();

const io = new SocketIOServer({
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const httpServer = createServer();

httpServer.on("request", (req: IncomingMessage, res: ServerResponse) => {
  try {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // Let socket.io handle its own paths
    if (req.url?.startsWith("/socket.io")) {
      return;
    }

    if (req.method === "POST" && req.url?.startsWith("/broadcast")) {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      req.on("end", () => {
        try {
          const body = Buffer.concat(chunks).toString();
          const parsed = JSON.parse(body);
          const { event, data } = parsed;
          if (event && data) {
            io.emit(event, data);
            console.log(`[ws-service] Broadcast: ${event} to ${connectedClients.size} clients`);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, clients: connectedClients.size }));
          } else {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Missing event or data" }));
          }
        } catch (e) {
          console.error("[ws-service] Parse error:", e);
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
        }
      });
      req.on("error", (e) => {
        console.error("[ws-service] Request error:", e);
      });
      return;
    }

    // Health check
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        service: "AgentSCAD WebSocket Service",
        status: "running",
        clients: connectedClients.size,
        timestamp: new Date().toISOString(),
      })
    );
  } catch (e) {
    console.error("[ws-service] Handler error:", e);
  }
});

io.attach(httpServer);

io.on("connection", (socket) => {
  connectedClients.add(socket.id);
  console.log(`[ws-service] Client connected: ${socket.id} (${connectedClients.size} total)`);

  socket.emit("welcome", {
    message: "Connected to AgentSCAD WebSocket service",
    timestamp: new Date().toISOString(),
    clientId: socket.id,
  });

  socket.on("disconnect", (reason) => {
    connectedClients.delete(socket.id);
    console.log(`[ws-service] Client disconnected: ${socket.id} (${connectedClients.size} remaining) - ${reason}`);
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`[ws-service] WebSocket service running on port ${PORT}`);
});

setInterval(() => {}, 30000);

process.on("uncaughtException", (err) => {
  console.error("[ws-service] Uncaught exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("[ws-service] Unhandled rejection:", err);
});
