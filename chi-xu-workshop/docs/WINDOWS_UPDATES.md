# Windows 一键更新（包含 ZIP 解压版）

以后不用每次手动下载、找文件夹和重新解压：

1. 关闭游戏的黑色启动窗口。
2. 在原游戏文件夹或桌面双击“更新游戏”。
3. 看到“更新完成”后，双击“开始游戏”。继续使用原浏览器和原地址。

已经是最新版会提示“无需下载”。有新版时仍需联网传输新版文件，但由更新器自动完成。解压版不需要安装 Git；不是浏览器刷新自动同步远程代码。

## 给旧版安装一次更新器

在包含 `package.json`、`src` 和 `scripts` 的游戏文件夹中，点击资源管理器地址栏，输入 `powershell` 并回车。关闭旧游戏启动窗口后粘贴：

```powershell
$ErrorActionPreference = 'Stop'
if (!(Test-Path '.\scripts\start-windows.ps1')) { throw '请先进入 chi-xu-workshop 游戏文件夹。' }
Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/Ssir-creator/zhengji/chi-xu-workshop-dev/chi-xu-workshop/scripts/update.mjs' -OutFile '.\scripts\update.mjs'
node .\scripts\update.mjs
```

本次会把旧游戏更新到含新更新入口的版本。之后只需双击“更新游戏.cmd”。需要既有的 Node.js，推荐 24 LTS；不需要管理员权限。网页仍运行在原主机名和端口，更新器不操作浏览器数据库，不清除进度。

## 保留与失败处理

- 解压版：在相邻临时目录下载、安装和构建，成功后先完整备份原目录，再逐文件更新，原目录和快捷方式路径保持不变。不依赖重命名正在使用的 Windows 工作目录。
- 备份保留在 `chi-xu-workshop.backup-随机字符`，不会自动删除。支持的 `local-assets` 和 `*.local.json` 同时保留在活动目录；其他旧文件不主动删除，原件也在备份内。
- 下载或构建失败时不替换旧游戏；替换失败会尝试从备份恢复，并保留备份路径。突然断电或进程被强制终止时无法保证自动恢复；版本记录最后写入，可重试或用备份恢复。
- 检测到游戏仍运行、并行更新、无效包或本机配置冲突时停止并显示原因，不强制关闭其他进程。
- Git 版保留原分支检查：只允许 `chi-xu-workshop-dev` 的干净工作区、仅快进合并，不修改 main。
- 使用 GitHub codeload 的 HTTPS 和 ETag 识别资源版本，不依赖 GitHub API、不需要另配 token。检查和下载的 ETag 不一致时停止，避免记录错误版本。ETag 是版本标识，不宣称它是独立的制品签名。

## 本轮验证

- 37 项测试通过，其中 8 项覆盖更新成功、版本相同不下载、下载失败、构建失败、替换中断后的恢复、并发锁、Git 工作区保护和依赖相对链接。
- 构建通过；本轮未改变游戏画面、牙模、关卡参数和存档代码。
- Linux 中执行真实 HTTPS 下载、ZIP 解压、npm ci、生产构建、备份、原目录更新与重复检查；发布前测试将待发布的两个更新脚本注入旧远程包，其余使用真实流程。
- Windows PowerShell 原生解压、双击入口和本机文件占用仍须在 Windows 实机确认；此环境没有 Windows 桌面，不将跨平台逻辑测试称为 Windows 实机验收。

## 更新后检查实际电脑

关闭游戏启动窗口，双击新版的 `检查游戏.cmd`。检查器会验证实际启动入口和浏览器模型、绘图与存储，并将结果保存为 `本机检查结果.local.json`。没有执行过更新或不在 Windows 上运行时，相应项目会标为待确认。详见 [本机验收说明](LEARNING_AND_CHECKS.md)。
