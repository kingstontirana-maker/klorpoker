#!/usr/bin/env bash
# Safe update of the live server (klorpoker.com).
# Keeps the live accounts and balances (data/state.json), takes the newest code
# from GitHub and restarts the game. Run on the server:  bash deploy.sh
set -euo pipefail
cd "$(dirname "$0")"

STAMP=$(date +%Y%m%d-%H%M%S)
BACKUPS="$(pwd)/../klorpoker-backups"
mkdir -p "$BACKUPS"

# 1. Stop the game so nothing is written while updating (pm2 or systemd).
if command -v pm2 >/dev/null 2>&1 && pm2 jlist 2>/dev/null | grep -q "server.js\|klor"; then MANAGER=pm2; pm2 stop all >/dev/null
elif systemctl list-units --type=service 2>/dev/null | grep -qi klor; then MANAGER=systemd; SERVICE=$(systemctl list-units --type=service --no-legend | grep -i klor | awk '{print $1}' | head -1); sudo systemctl stop "$SERVICE"
else MANAGER=manual; echo "⚠ Ndalo serverin e lojës (Ctrl+C) para se të vazhdosh, pastaj shtyp Enter."; read -r; fi

# 2. Back up the live data.
if [ -f data/state.json ]; then cp data/state.json "$BACKUPS/state-$STAMP.json"; echo "✓ Kopje e të dhënave: $BACKUPS/state-$STAMP.json"; fi

# 3. Take the newest code exactly as it is on GitHub.
git fetch origin
git reset --hard origin/main

# 4. Put the live data back.
mkdir -p data
if [ -f "$BACKUPS/state-$STAMP.json" ]; then cp "$BACKUPS/state-$STAMP.json" data/state.json; echo "✓ Llogaritë dhe balancat u rikthyen."; fi

# 5. Start the game again.
case "$MANAGER" in
  pm2) pm2 restart all --update-env >/dev/null; echo "✓ Loja u rinis me pm2." ;;
  systemd) sudo systemctl start "$SERVICE"; echo "✓ Loja u rinis ($SERVICE)." ;;
  *) echo "→ Nise lojën përsëri: npm start" ;;
esac
echo "✓ Versioni: $(git log -1 --format='%h %s (%ad)' --date=format:'%d.%m %H:%M')"
