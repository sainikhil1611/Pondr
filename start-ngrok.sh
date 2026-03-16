#!/usr/bin/env bash
# Start ngrok tunnel with traffic policies for pondr API
# Usage: ./start-ngrok.sh
#
# Prerequisites:
# 1. Install ngrok: https://ngrok.com/download
# 2. Set your authtoken: ngrok config add-authtoken <token>
# 3. Make sure backend is running on port 8000

set -e

echo "Starting ngrok tunnel for pondr API (port 8000)..."
echo "Traffic policies: 30 req/min rate limit, 5MB body limit, GET/POST/PATCH/OPTIONS only"
echo ""

ngrok start --config ngrok.yml pondr
