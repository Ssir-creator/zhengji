# 真实牙模首页与 Windows 入口

2026-10-19，本工作区开始时仅有 main 对应的 README，工作区干净，旧对话未提交修改没有保留。以远程 `chi-xu-workshop-dev` 的 `a7f3cfc` 为基础重新实施；未修改 main 或工程外文件。

## 实现

- 首页通过 `studio.ts` 直接加载校验过的真实病例，用与游戏相同的 `WorkshopScene` 渲染。可以旋转和缩放，不使用概念图替代运行画面。
- 首页场景独立管理生命周期，离开后释放渲染器及自有预览资源；不写挑战存档，不复用可编辑挑战位姿。
- 工作台增加冷色轮廓光和补光，调整主光、自然牙白及透明涂层质感，并调整垫板、桌面与接缝布景。保留原始网格和坐标。
- 新增开始游戏、更新游戏、创建桌面快捷方式三个 CMD 入口。PowerShell 脚本使用 UTF-8 BOM，支持 Windows PowerShell 5.1 的中文字符串。
- Node 启动器自动等候 HTTP 就绪后打开浏览器，端口占用时明确失败，不改端口。更新只允许开发分支的干净工作区并执行快进合并、安装和构建，不清理浏览器记录。
- 真实牙模、派生模型、病例清单、关卡参数、核心规则及进度键和格式均保持原样。原始科研网站未触及。

## 验证

- `npm ci --cache /workspace/.npm-cache` 成功，锁文件未改动。
- `npm run build` 成功（TypeScript + Vite）。仍有 Three.js 主包超过 500 kB 的提示，不影响构建。
- `npm test`：3 文件、29 项全部通过，包括原始 STL 哈希与 LOD 顶点来源校验。
- 浏览器测试共 11 项均有通过记录：完整真实病例三关、LOD、刷新恢复、自由练习隔离、回放；旧 schema1 恢复；存档失败保护；射线拾取和取消拖动；首页真实场景、存档隔离和窄屏布局。
- 首轮 10/11 通过，一项测试因开发期间热重载回首页而失败。停止修改后相关界面测试通过。
- 后续 10 项复测中 9 项通过，一项现有射线测试在首次点选时偶发失败；该测试未更改断言，单独 `--repeat-each=2` 复测 2/2 通过。完整真实病例测试已独立通过；没有跳过或禁用用例。
- 实际截图检查发现首页说明条被旧 CSS 顶部定位拉高，已修正 `top:auto` 并新增高度断言；重跑首页两项测试通过，重新生成并目视检查桌面、窄屏和练习截图。
- `node --check scripts/launch.mjs` 通过；实际运行启动器后 HTTP 返回游戏页面；重复启动报端口占用并以 1 退出；SIGTERM 可停止本次启动的服务。

截图：

- [真实模型首页](screenshots/title-studio-1440.png)
- [窄屏首页](screenshots/title-studio-mobile.png)
- [自由练习](screenshots/studio-practice-1440.png)
- [第一关](screenshots/player-redesign-stage1.png)
- [第二关](screenshots/player-redesign-stage2.png)
- [第三关](screenshots/player-redesign-stage3.png)
- [完成](screenshots/player-redesign-complete.png)

## 验证边界

Linux + Chromium 软件 WebGL 验证，不代表目标 Windows GPU 的帧率验收。此环境没有 Windows 桌面或 PowerShell，不能宣称 CMD 双击、桌面快捷方式和 Windows 默认浏览器打开已做原生实机测试；这些入口需要在 Windows 安装 Node.js 24 LTS（更新另需 Git for Windows）后做一次实机验收。

浏览器本地存档按地址和浏览器配置隔离。旧记录所在的 `localhost:5173` 与 `127.0.0.1:5173` 不能互相读取；旧玩家应继续使用原地址。更新不删除记录，移动浏览器或电脑前应先导出。未改动病例元数据待审核等原有限制。
