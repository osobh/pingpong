#!/bin/bash

# PingPong Stop Script
# Gracefully stops all running services

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PID_DIR="./.pids"
SERVER_PID_FILE="$PID_DIR/server.pid"
AGENT_PIDS_FILE="$PID_DIR/agents.pids"

echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Stopping PingPong Services              ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

# Function to check if a process is running
is_process_running() {
    local pid=$1
    if [ -z "$pid" ]; then
        return 1
    fi
    kill -0 "$pid" 2>/dev/null
}

# Function to stop a process
stop_process() {
    local pid=$1
    local name=$2
    local timeout=5

    if ! is_process_running "$pid"; then
        echo -e "${YELLOW}  ⚠ $name (PID: $pid) is not running${NC}"
        return 0
    fi

    echo -e "  Stopping $name (PID: $pid)..."

    # Send SIGTERM
    kill -TERM "$pid" 2>/dev/null

    # Wait for graceful shutdown
    local count=0
    while is_process_running "$pid" && [ $count -lt $timeout ]; do
        sleep 1
        ((count++))
    done

    # Force kill if still running
    if is_process_running "$pid"; then
        echo -e "${YELLOW}  Force killing $name...${NC}"
        kill -KILL "$pid" 2>/dev/null
        sleep 1
    fi

    if ! is_process_running "$pid"; then
        echo -e "${GREEN}  ✓ $name stopped${NC}"
        return 0
    else
        echo -e "${RED}  ✗ Failed to stop $name${NC}"
        return 1
    fi
}

STOPPED_COUNT=0
FAILED_COUNT=0

# Stop agents first
if [ -f "$AGENT_PIDS_FILE" ]; then
    echo -e "${BLUE}Stopping agents...${NC}"

    while IFS= read -r agent_pid; do
        if [ -n "$agent_pid" ]; then
            if stop_process "$agent_pid" "Agent"; then
                ((STOPPED_COUNT++))
            else
                ((FAILED_COUNT++))
            fi
        fi
    done < "$AGENT_PIDS_FILE"

    rm -f "$AGENT_PIDS_FILE"
else
    echo -e "${YELLOW}No agent PID file found${NC}"
fi

echo ""

# Stop server
if [ -f "$SERVER_PID_FILE" ]; then
    echo -e "${BLUE}Stopping server...${NC}"

    SERVER_PID=$(cat "$SERVER_PID_FILE")
    if stop_process "$SERVER_PID" "Server"; then
        ((STOPPED_COUNT++))
    else
        ((FAILED_COUNT++))
    fi

    rm -f "$SERVER_PID_FILE"
else
    echo -e "${YELLOW}No server PID file found${NC}"
fi

# Check for orphaned processes on port 8080
if lsof -i :8080 -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo ""
    echo -e "${YELLOW}Port 8080 is still in use. Cleaning up...${NC}"

    PORT_PID=$(lsof -i :8080 -sTCP:LISTEN -t 2>/dev/null)
    if [ -n "$PORT_PID" ]; then
        if stop_process "$PORT_PID" "Process on port 8080"; then
            ((STOPPED_COUNT++))
        fi
    fi
fi

# Clean up PID directory if empty
if [ -d "$PID_DIR" ]; then
    rmdir "$PID_DIR" 2>/dev/null || true
fi

# Summary
echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              Stop Summary                         ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

if [ $STOPPED_COUNT -gt 0 ]; then
    echo -e "${GREEN}✓ Stopped: $STOPPED_COUNT process(es)${NC}"
fi

if [ $FAILED_COUNT -gt 0 ]; then
    echo -e "${RED}✗ Failed: $FAILED_COUNT process(es)${NC}"
    exit 1
fi

if [ $STOPPED_COUNT -eq 0 ] && [ $FAILED_COUNT -eq 0 ]; then
    echo -e "${YELLOW}No running services found${NC}"
fi

echo ""
echo -e "${GREEN}All PingPong services stopped.${NC}"
