#!/usr/bin/env bash
# Check (and optionally install) what Ant needs on this machine.
# Usage: scripts/install-deps.sh [--yes]   (--yes runs the package manager command with sudo)
set -euo pipefail

need=()
have() { command -v "$1" >/dev/null 2>&1; }
check() { # name, binary, arch pkg, debian pkg, fedora pkg
  if have "$2"; then printf '  ✓ %s\n' "$1"; else printf '  ✗ %s\n' "$1"; need+=("$3|$4|$5"); fi
}

echo "Ant dependencies:"
if have node && [[ $(node -p 'process.versions.node.split(".")[0]') -ge 26 ]]; then echo "  ✓ Node $(node -v)"; else echo "  ✗ Node 26+ (install from nodejs.org or your version manager)"; fi
if have claude; then echo "  ✓ Claude Code $(claude --version 2>/dev/null | head -1)"; else echo "  ✗ Claude Code — install: curl -fsSL https://claude.ai/install.sh | bash"; fi
check "bubblewrap (sandbox)" bwrap bubblewrap bubblewrap bubblewrap
check "socat (sandbox network proxy)" socat socat socat socat
if have chromium || have chromium-browser || have google-chrome-stable || have google-chrome; then echo "  ✓ Chromium (ant browsers)"; else echo "  ✗ Chromium (ant browsers)"; need+=("chromium|chromium|chromium"); fi
check "notify-send (desktop notifications, optional)" notify-send libnotify libnotify-bin libnotify
check "secret-tool (keyring for secrets, optional)" secret-tool libsecret libsecret-tools libsecret

if have claude && ! claude auth status >/dev/null 2>&1; then echo; echo "Claude Code isn't signed in. Run: claude   then /login"; fi

[[ ${#need[@]} -eq 0 ]] && { echo; echo "All set."; exit 0; }

pick() { local i=$1; printf '%s\n' "${need[@]}" | cut -d'|' -f"$i" | tr '\n' ' '; }
if have pacman; then cmd="pacman -S --needed $(pick 1)"
elif have apt-get; then cmd="apt-get install -y $(pick 2)"
elif have dnf; then cmd="dnf install -y $(pick 3)"
else echo; echo "Install these with your package manager: $(pick 1)"; exit 1; fi

echo
if [[ "${1:-}" == "--yes" ]]; then sudo $cmd; else echo "Run: sudo $cmd   (or re-run with --yes)"; fi
