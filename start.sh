#!/bin/bash

BASE_DIR=~/CISO/CISODashboard
BACKEND_PORT=3000
FRONTEND_PORT=5173

# Kill anything on the backend and frontend ports
echo "Stopping old processes..."
fuser -k ${BACKEND_PORT}/tcp ${FRONTEND_PORT}/tcp 2>/dev/null
pkill -f nodemon 2>/dev/null
pkill -f vite 2>/dev/null

# Wait until both ports are actually free (max ~10 seconds)
for i in {1..10}; do
  if ! ss -tln | grep -qE ":(${BACKEND_PORT}|${FRONTEND_PORT})\b"; then
    break
  fi
  sleep 1
done

# Start backend on 3000
cd $BASE_DIR/backend
PORT=$BACKEND_PORT nohup npm run dev > backend.log 2>&1 &

# Start frontend on 5173 only
cd $BASE_DIR/frontend
nohup npm run dev -- --port $FRONTEND_PORT --strictPort > frontend.log 2>&1 &

echo "Backend running on port $BACKEND_PORT"
echo "Frontend running on port $FRONTEND_PORT"
echo "Backend log: $BASE_DIR/backend/backend.log"
echo "Frontend log: $BASE_DIR/frontend/frontend.log"