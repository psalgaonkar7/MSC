# Refresh the B2B login session — standalone, no Claude Code needed.
# Opens a real browser: sign in with your own Rail Europe credentials.
# Your password is never typed into or stored by any script.
#   .\run-auth.ps1
$ErrorActionPreference = "Stop"
$node = "C:\Users\PSalgaonkar\AppData\Local\nodejs-portable\node-v24.18.0-win-x64"
$env:Path = "$node;$env:Path"
Set-Location $PSScriptRoot
& "$node\npm.cmd" run auth
Write-Host ""
Write-Host "Press Enter to close..." -NoNewline
Read-Host
