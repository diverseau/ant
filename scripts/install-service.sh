#!/usr/bin/env bash
# Install Ant as a systemd user service: antd serves the built web app at http://127.0.0.1:7420
# and starts on login. Undo with: scripts/install-service.sh --uninstall
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
unit="$HOME/.config/systemd/user/ant.service"

if [[ "${1:-}" == "--uninstall" ]]; then
  systemctl --user disable --now ant.service 2>/dev/null || true
  rm -f "$unit"
  systemctl --user daemon-reload
  echo "Ant service removed."
  exit 0
fi

node=$(command -v node)
claude=$(command -v claude || true)
[[ -n "$claude" ]] || { echo "claude not found on PATH" >&2; exit 1; }

echo "Building the web app…"
(cd "$root" && npm run -s build >/dev/null)

mkdir -p "$(dirname "$unit")"
cat > "$unit" <<UNIT
[Unit]
Description=Ant (antd) — persistent Claude agents
After=network-online.target

[Service]
WorkingDirectory=$root/server
ExecStart=$node src/main.ts
Restart=on-failure
RestartSec=3
Environment=PATH=$(dirname "$claude"):$(dirname "$node"):/usr/local/bin:/usr/bin:/bin
Environment=ANT_CLAUDE_BIN=$claude
# Ants run as you; DISPLAY/DBUS let desktop notifications through.
PassEnvironment=DISPLAY WAYLAND_DISPLAY DBUS_SESSION_BUS_ADDRESS XDG_RUNTIME_DIR

[Install]
WantedBy=default.target
UNIT

systemctl --user daemon-reload
systemctl --user enable --now ant.service
echo "Ant is running at http://127.0.0.1:7420 and will start on login."
echo "Logs: journalctl --user -u ant -f"
