#!/usr/bin/env bash
# Installs the use-jev skill into ~/.claude/skills/use-jev (macOS/Linux).
# Run from the repo root:  bash scripts/install.sh
set -euo pipefail
src="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="$HOME/.claude/skills/use-jev"
mkdir -p "$dest"
cp "$src/SKILL.md" "$dest/"
cp -R "$src/scripts" "$dest/"
cp -R "$src/examples" "$dest/"
chmod +x "$dest/scripts/set-key.sh" "$dest/scripts/install.sh" 2>/dev/null || true
echo "Installed to $dest"
echo "Next: save a key with"
echo "  bash \"$dest/scripts/set-key.sh\""
echo "Then restart Claude Code and ask it to 'use Jev' on something."
