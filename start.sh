#!/bin/bash

cd ~/CISO/CISODashboard/backend
nohup npm run dev > backend.log 2>&1 &

cd ~/CISO/CISODashboard/frontend
nohup npm run dev > frontend.log 2>&1 &

echo "Backend and frontend started in background."
echo "Backend log: ~/CISO/CISODashboard/backend/backend.log"
echo "Frontend log: ~/CISO/CISODashboard/frontend/frontend.log"