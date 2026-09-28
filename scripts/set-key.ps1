# Saves your OpenRouter key encrypted with Windows DPAPI:
# only your Windows user, on this PC, can decrypt it.
# The key is typed hidden, never printed, and stored outside any project or repo.
$dir = Join-Path $env:USERPROFILE ".claude\secrets"
New-Item -ItemType Directory -Force $dir | Out-Null
$secure = Read-Host "Paste your OpenRouter key (input hidden)" -AsSecureString
$plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
if ($plain.Length -lt 20 -or -not $plain.StartsWith("sk-or-")) {
  Write-Host "That doesn't look like an OpenRouter key (got $($plain.Length) characters; expected 'sk-or-...'). Nothing saved. Try again."
  exit 1
}
$secure = ConvertTo-SecureString $plain -AsPlainText -Force
$plain = $null
$secure | ConvertFrom-SecureString | Set-Content -Path (Join-Path $dir "openrouter.dpapi") -Encoding ascii
Write-Host "Saved (encrypted) to $dir\openrouter.dpapi"
