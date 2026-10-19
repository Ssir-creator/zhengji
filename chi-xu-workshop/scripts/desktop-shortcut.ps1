$ErrorActionPreference = 'Stop'
try {
  $root = Split-Path $PSScriptRoot -Parent
  $desktop = [Environment]::GetFolderPath('Desktop')
  $shell = New-Object -ComObject WScript.Shell
  foreach ($item in @(@('齿序工坊', '开始游戏.cmd'), @('更新齿序工坊', '更新游戏.cmd'))) {
    $shortcut = $shell.CreateShortcut((Join-Path $desktop ($item[0] + '.lnk')))
    $shortcut.TargetPath = Join-Path $root $item[1]
    $shortcut.WorkingDirectory = $root
    $shortcut.Save()
  }
  Write-Host '桌面启动和更新入口已创建。移动工程后，请重新运行本脚本。'
  Read-Host '按回车关闭'
} catch { Write-Host $_ -ForegroundColor Red; Read-Host '按回车关闭'; exit 1 }
