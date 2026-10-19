$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
try {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw '请先安装 Git for Windows。ZIP 下载版请改用 Git 克隆开发分支后更新。' }
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 24 LTS。' }
  $branch = git branch --show-current
  if ($LASTEXITCODE -ne 0 -or $branch -ne 'chi-xu-workshop-dev') { throw '只允许在 chi-xu-workshop-dev 分支更新，不会切换或修改 main。' }
  $changes = git status --porcelain
  if ($LASTEXITCODE -ne 0 -or $changes) { throw '存在本地修改，请先保存或提交后再更新；不会覆盖文件。' }
  git fetch origin refs/heads/chi-xu-workshop-dev
  if ($LASTEXITCODE -ne 0) { throw '读取远程开发分支失败。' }
  git merge --ff-only FETCH_HEAD
  if ($LASTEXITCODE -ne 0) { throw '分支无法直接快进，请联系开发者处理；不会强制重置。' }
  npm.cmd ci
  if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，可联网后重新运行更新。' }
  npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw '构建失败，请保留上方日志。' }
  Write-Host '更新完成。请双击开始游戏。浏览器进度未清除。' -ForegroundColor Green
  Read-Host '按回车关闭'
} catch { Write-Host $_ -ForegroundColor Red; Read-Host '按回车关闭'; exit 1 }
