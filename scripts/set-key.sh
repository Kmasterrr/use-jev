#!/usr/bin/env bash
# Saves your OpenRouter key to ~/.claude/secrets/openrouter.key with 0600 permissions.
# The key is typed hidden and never printed.
# macOS/Linux have no DPAPI equivalent; if you want stronger protection, export
# OPENROUTER_API_KEY from your own secret manager instead of using this script.
set -euo pipefail
dir="$HOME/.claude/secrets"
mkdir -p "$dir"
chmod 700 "$dir"
printf 'Paste your OpenRouter key (input hidden): '
read -rs key
printf '\n'
key="$(printf '%s' "$key" | tr -d '[:space:]')"
case "$key" in
  sk-or-*) ;;
  *) echo "That doesn't look like an OpenRouter key (expected 'sk-or-...'). Nothing saved."; exit 1 ;;
esac
if [ "${#key}" -lt 20 ]; then
  echo "Key is too short (${#key} characters). Nothing saved."; exit 1
fi
umask 077
printf '%s' "$key" > "$dir/openrouter.key"
chmod 600 "$dir/openrouter.key"
unset key
echo "Saved to $dir/openrouter.key (permissions 600)"
