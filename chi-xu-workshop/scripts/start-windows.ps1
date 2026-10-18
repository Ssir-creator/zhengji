$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 22.12+ 或 24 LTS。' }
if (-not (Test-Path node_modules)) { npm ci; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
npm run dev -- --host 127.0.0.1
exit $LASTEXITCODE
