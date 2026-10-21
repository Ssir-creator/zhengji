$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 24 LTS，然后重新双击开始游戏。' }
  node -e "if(Number(process.versions.node.split('.')[0])<22 || (Number(process.versions.node.split('.')[0])===22 && Number(process.versions.node.split('.')[1])<12))process.exit(1)"
  if ($LASTEXITCODE -ne 0) { throw '需要 Node.js 22.12+，推荐 24 LTS。' }
  if (-not (Test-Path node_modules/vite/bin/vite.js)) {
    npm.cmd ci
    if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，请检查网络后重试。' }
  }
  node scripts/start.mjs
  if ($LASTEXITCODE -ne 0) { throw '启动失败。请查看上方日志；5173 端口可能已被占用。' }
} catch { Write-Host $_ -ForegroundColor Red; if ($env:CHIXU_CHECKING -ne '1') { Read-Host '按回车关闭' }; exit 1 }
