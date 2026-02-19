#!/bin/bash
# watchdog.sh — runs on Pi 2, monitors Pi 1
# Deploy to Pi 2 at ~/team-simonoto/watchdog/watchdog.sh

PI1_URL="${PI1_URL:-http://192.168.4.29:7070}"
CHECK_INTERVAL=60      # seconds between checks
FAIL_THRESHOLD=3       # consecutive failures before kill
LOG_FILE="$HOME/team-simonoto/watchdog/watchdog.log"

fail_count=0

log() {
  echo "$(date -Iseconds) $1" >> "$LOG_FILE"
}

kill_workflows() {
  log "EMERGENCY: Pi 1 unresponsive after $FAIL_THRESHOLD checks. Sending stop."
  curl -sf -X POST "$PI1_URL/pace" -H 'Content-Type: application/json' -d '{"pace":"stop"}' >> "$LOG_FILE" 2>&1 || true
  log "Kill signal sent (or Pi 1 unreachable). Manual intervention may be needed."
}

while true; do
  if curl -sf "$PI1_URL/heartbeat" > /dev/null 2>&1; then
    if [ $fail_count -gt 0 ]; then
      log "RECOVERED: Pi 1 responding again after $fail_count failures"
    fi
    fail_count=0
  else
    fail_count=$((fail_count + 1))
    log "WARNING: Pi 1 heartbeat failed ($fail_count/$FAIL_THRESHOLD)"
    if [ $fail_count -ge $FAIL_THRESHOLD ]; then
      kill_workflows
      fail_count=0
      sleep 300  # wait 5 min before rechecking after emergency
      continue
    fi
  fi
  sleep $CHECK_INTERVAL
done
