#!/bin/bash
# AgentSCAD Dev Server Startup Script
# Starts the Next.js dev server and pre-compiles all routes/chunks

cd /home/z/my-project

# Kill any existing server
fuser -k 3000/tcp 2>/dev/null
sleep 2

# Clear stale cache if needed
# rm -rf .next

# Start the dev server with process isolation
NODE_OPTIONS="--max-old-space-size=4096" setsid npx next dev -p 3000 &>/tmp/next-dev-server.log &

# Wait for server to be ready
echo "Waiting for server to start..."
for i in $(seq 1 30); do
  if ss -tlnp | grep -q 3000; then
    echo "Server is listening!"
    break
  fi
  sleep 1
done

if ! ss -tlnp | grep -q 3000; then
  echo "ERROR: Server failed to start!"
  exit 1
fi

# Pre-compile the page
echo "Pre-compiling page..."
PAGE_HTML=$(curl -m 120 -s http://127.0.0.1:3000/ 2>/dev/null)
if [ -z "$PAGE_HTML" ]; then
  echo "WARNING: Page compilation may have failed"
fi
sleep 5

# Pre-compile API routes
echo "Pre-compiling API routes..."
curl -m 60 -s http://127.0.0.1:3000/api/jobs?limit=1 > /dev/null 2>&1
sleep 3

# Pre-compile all JS chunks sequentially
CHUNKS=$(echo "$PAGE_HTML" | grep -oP '/_next/static/chunks/[^"]+' | grep -E '\.js' | sort -u)
CHUNK_COUNT=$(echo "$CHUNKS" | wc -l)
echo "Pre-compiling $CHUNK_COUNT JS chunks..."

for chunk in $CHUNKS; do
  curl -m 60 -s -o /dev/null "http://127.0.0.1:3000$chunk" 2>&1
  sleep 1
done

echo "Pre-compilation complete!"
echo "Server is ready at http://localhost:3000"
ss -tlnp | grep 3000 && echo "Server is running" || echo "Server may have crashed"
