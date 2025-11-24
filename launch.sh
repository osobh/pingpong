#!/bin/bash

# PingPong Launch Script
# Starts server and agents with validation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SERVER_PORT=8080
OLLAMA_HOST="${OLLAMA_HOST:-http://192.168.1.4:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-gpt-oss:20b}"
TOPIC="${1:-Should we use microservices or monolith?}"
AGENT_COUNT="${2:-3}"

# PID file locations
PID_DIR="./.pids"
SERVER_PID_FILE="$PID_DIR/server.pid"
AGENT_PIDS_FILE="$PID_DIR/agents.pids"

# Log file locations
LOG_DIR="./.logs"
SERVER_LOG="$LOG_DIR/server.log"
AGENT_LOG_PREFIX="$LOG_DIR/agent"

echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         PingPong Multi-Agent Launcher            ║${NC}"
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

# Function to check if port is in use
is_port_in_use() {
    local port=$1
    lsof -i ":$port" -sTCP:LISTEN -t >/dev/null 2>&1
}

# Function to get process using port
get_port_process() {
    local port=$1
    lsof -i ":$port" -sTCP:LISTEN -t 2>/dev/null
}

# Check for existing services
check_existing_services() {
    local found_running=false

    echo -e "${YELLOW}Checking for existing services...${NC}"

    # Check if PID files exist and processes are running
    if [ -f "$SERVER_PID_FILE" ]; then
        local server_pid=$(cat "$SERVER_PID_FILE")
        if is_process_running "$server_pid"; then
            echo -e "${YELLOW}  ⚠ Server (PID: $server_pid) is already running${NC}"
            found_running=true
        fi
    fi

    # Check if port is in use
    if is_port_in_use "$SERVER_PORT"; then
        local port_pid=$(get_port_process "$SERVER_PORT")
        echo -e "${YELLOW}  ⚠ Port $SERVER_PORT is already in use (PID: $port_pid)${NC}"
        found_running=true
    fi

    # Check for agent PIDs
    if [ -f "$AGENT_PIDS_FILE" ]; then
        while IFS= read -r agent_pid; do
            if is_process_running "$agent_pid"; then
                echo -e "${YELLOW}  ⚠ Agent (PID: $agent_pid) is already running${NC}"
                found_running=true
            fi
        done < "$AGENT_PIDS_FILE"
    fi

    if [ "$found_running" = true ]; then
        echo ""
        echo -e "${YELLOW}Existing services detected. What would you like to do?${NC}"
        echo "  1) Kill existing services and continue"
        echo "  2) Cancel and exit"
        echo ""
        read -p "Enter choice [1-2]: " choice

        case $choice in
            1)
                echo -e "${YELLOW}Stopping existing services...${NC}"
                ./stop.sh
                sleep 2
                ;;
            2)
                echo -e "${RED}Launch cancelled.${NC}"
                exit 0
                ;;
            *)
                echo -e "${RED}Invalid choice. Exiting.${NC}"
                exit 1
                ;;
        esac
    else
        echo -e "${GREEN}  ✓ No existing services found${NC}"
    fi
}

# Create directories
mkdir -p "$PID_DIR" "$LOG_DIR"

# Check for existing services
check_existing_services

echo ""
echo -e "${BLUE}Configuration:${NC}"
echo -e "  Topic: ${GREEN}$TOPIC${NC}"
echo -e "  Agents: ${GREEN}$AGENT_COUNT${NC}"
echo -e "  Ollama: ${GREEN}$OLLAMA_HOST ($OLLAMA_MODEL)${NC}"
echo -e "  Server Port: ${GREEN}$SERVER_PORT${NC}"
echo ""

# Check if build exists
if [ ! -d "dist" ]; then
    echo -e "${YELLOW}Build not found. Building project...${NC}"
    npm run build
    if [ $? -ne 0 ]; then
        echo -e "${RED}✗ Build failed${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Build complete${NC}"
    echo ""
fi

# Start server
echo -e "${BLUE}[1/4] Starting PingPong Server...${NC}"
node dist/server/index.js "$TOPIC" > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > "$SERVER_PID_FILE"

# Wait and validate server
sleep 2
if ! is_process_running "$SERVER_PID"; then
    echo -e "${RED}✗ Server failed to start${NC}"
    cat "$SERVER_LOG"
    exit 1
fi

if ! is_port_in_use "$SERVER_PORT"; then
    echo -e "${RED}✗ Server not listening on port $SERVER_PORT${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Server started (PID: $SERVER_PID)${NC}"
echo -e "  Listening on ws://localhost:$SERVER_PORT"

# Start agents
echo ""
echo -e "${BLUE}[2/4] Starting Agents...${NC}"

# Clear old agent PIDs
> "$AGENT_PIDS_FILE"

AGENT_CONFIGS=(
    "alice-1:Alice:architect"
    "bob-1:Bob:critic"
    "charlie-1:Charlie:pragmatist"
)

# Only use the number of agents requested
AGENTS_TO_START="${AGENT_CONFIGS[@]:0:$AGENT_COUNT}"

for config in $AGENTS_TO_START; do
    IFS=':' read -r agent_id agent_name role <<< "$config"

    echo -e "  Starting ${GREEN}$agent_name${NC} ($role)..."

    node dist/agent/index.js \
        --id "$agent_id" \
        --name "$agent_name" \
        --role "$role" \
        > "${AGENT_LOG_PREFIX}-${agent_id}.log" 2>&1 &

    AGENT_PID=$!
    echo "$AGENT_PID" >> "$AGENT_PIDS_FILE"

    # Wait and validate
    sleep 1
    if ! is_process_running "$AGENT_PID"; then
        echo -e "${RED}  ✗ $agent_name failed to start${NC}"
        cat "${AGENT_LOG_PREFIX}-${agent_id}.log"
        ./stop.sh
        exit 1
    fi

    echo -e "${GREEN}  ✓ $agent_name started (PID: $AGENT_PID)${NC}"
done

# Validate connections
echo ""
echo -e "${BLUE}[3/4] Validating Connections...${NC}"
sleep 3

# Check server log for connections
CONNECTION_COUNT=$(grep -c "New connection" "$SERVER_LOG" || true)
if [ "$CONNECTION_COUNT" -ge "$AGENT_COUNT" ]; then
    echo -e "${GREEN}✓ All agents connected ($CONNECTION_COUNT connections)${NC}"
else
    echo -e "${YELLOW}⚠ Expected $AGENT_COUNT connections, found $CONNECTION_COUNT${NC}"
fi

# Check if agents are sending messages
echo ""
echo -e "${BLUE}[4/4] Checking Agent Activity...${NC}"
sleep 5

ACTIVE_AGENTS=0
for config in $AGENTS_TO_START; do
    IFS=':' read -r agent_id agent_name role <<< "$config"

    if grep -q "Sent:" "${AGENT_LOG_PREFIX}-${agent_id}.log" 2>/dev/null; then
        echo -e "${GREEN}  ✓ $agent_name is active${NC}"
        ((ACTIVE_AGENTS++))
    else
        echo -e "${YELLOW}  ⚠ $agent_name has not sent messages yet${NC}"
    fi
done

# Final summary
echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              Launch Summary                       ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✓ Server:${NC} Running on ws://localhost:$SERVER_PORT (PID: $SERVER_PID)"
echo -e "${GREEN}✓ Agents:${NC} $AGENT_COUNT agents launched, $ACTIVE_AGENTS active"
echo -e "${GREEN}✓ Topic:${NC} $TOPIC"
echo ""
echo -e "${BLUE}Logs:${NC}"
echo -e "  Server: $SERVER_LOG"
echo -e "  Agents: ${AGENT_LOG_PREFIX}-*.log"
echo ""
echo -e "${BLUE}Commands:${NC}"
echo -e "  View logs:  ${YELLOW}tail -f $LOG_DIR/*.log${NC}"
echo -e "  Stop all:   ${YELLOW}./stop.sh${NC}"
echo ""
echo -e "${GREEN}PingPong is running! Press Ctrl+C to stop watching logs.${NC}"
echo ""

# Watch logs
tail -f "$LOG_DIR"/*.log
