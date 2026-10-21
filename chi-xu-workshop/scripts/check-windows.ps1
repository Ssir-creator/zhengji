$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
try {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 24 LTS。' }
  node scripts/check.mjs
  $checkExit = $LASTEXITCODE
  if ($checkExit -ne 0) { Write-Host '有检查未通过，请查看上方结果。' -ForegroundColor Yellow }
  Read-Host '检查结束。按回车关闭；双击开始游戏可以继续玩'
  exit $checkExit
} catch { Write-Host $_ -ForegroundColor Red; Read-Host '按回车关闭'; exit 1 }
