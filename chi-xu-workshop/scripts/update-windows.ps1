$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 24 LTS。' }
  node scripts/update.mjs
  if ($LASTEXITCODE -ne 0) { throw '更新未完成。请查看上方具体原因，旧文件备份不会自动删除。' }
  Read-Host '按回车关闭；然后双击开始游戏'
} catch { Write-Host $_ -ForegroundColor Red; Read-Host '按回车关闭'; exit 1 }
