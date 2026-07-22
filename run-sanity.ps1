# Run the full Rail Europe MSC sanity check — standalone, no Claude Code needed.
# Double-click this file (or right-click -> Run with PowerShell), or run it from a terminal:
#   .\run-sanity.ps1
$ErrorActionPreference = "Stop"
$node = "C:\Users\PSalgaonkar\AppData\Local\nodejs-portable\node-v24.18.0-win-x64"
$env:Path = "$node;$env:Path"
Set-Location $PSScriptRoot
& "$node\npm.cmd" run sanity
Write-Host ""
Write-Host "Press Enter to close..." -NoNewline
Read-Host
