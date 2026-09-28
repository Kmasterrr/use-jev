# Installs the use-jev skill into ~/.claude/skills/use-jev (Windows).
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File scripts\install.ps1
$ErrorActionPreference = "Stop"
$src = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $env:USERPROFILE ".claude\skills\use-jev"
New-Item -ItemType Directory -Force $dest | Out-Null
Copy-Item (Join-Path $src "SKILL.md") $dest -Force
Copy-Item (Join-Path $src "scripts") $dest -Recurse -Force
Copy-Item (Join-Path $src "examples") $dest -Recurse -Force
Write-Host "Installed to $dest"
Write-Host "Next: save a key with"
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$dest\scripts\set-key.ps1`""
Write-Host "Then restart Claude Code and ask it to 'use Jev' on something."
