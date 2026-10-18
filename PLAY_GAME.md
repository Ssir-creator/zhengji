# 下载并试玩《齿序工坊》开发版

本分支包含独立游戏源码、用户提供的 28 个真实牙冠 STL、56 个显示 GLB 和实际运行截图。原始 `main` 分支保持不变。

## 在电脑上运行

1. 在本分支页面点击绿色 **Code → Download ZIP**，下载并解压。
2. 安装 **Node.js 24 LTS**：https://nodejs.org/
3. 打开解压后的 `chi-xu-workshop` 文件夹，在该文件夹打开 PowerShell 或终端。
4. 依次运行：

   ```powershell
   npm ci
   npm run dev
   ```

5. 在浏览器打开终端显示的本地地址。点击“开始新的挑战”或“进入自由练习”，会自动加载随工程附带的真实牙冠。

也可以将 `chi-xu-workshop` 文件夹中的全部内容复制到 `D:\正畸_严肃游戏`，再在该目录执行上述命令。

## 从旧开发版更新

1. 在旧终端按 **Ctrl+C** 停止服务。
2. 重新下载本分支 ZIP，解压后将其中 `chi-xu-workshop` 内的内容覆盖到你原来的游戏文件夹（即含 `package.json` 的那一层）。
3. 本次没有新增依赖；原来已成功安装的电脑，在原游戏目录运行 `npm.cmd run dev` 即可。
4. 继续用原来的 `http://localhost:5173/`。旧版进度格式和病例内容指纹未变，可以点“继续上次的挑战”。不要同时开两个服务，否则新服务可能改用5174，浏览器会将其视为另一份本地存档。

本次改版把坐标和误差收进“查看细节”，以任务标记、方向箭头和下一步动作来引导。原始牙模、三关参数和目标判定均保留。

## 看实际画面

- [第一关截图](chi-xu-workshop/docs/screenshots/player-redesign-stage1.png)
- [第二关截图](chi-xu-workshop/docs/screenshots/player-redesign-stage2.png)
- [第三关截图](chi-xu-workshop/docs/screenshots/player-redesign-stage3.png)
- [三关完成截图](chi-xu-workshop/docs/screenshots/player-redesign-complete.png)

## 当前状态

真实病例的连续三关、撤销重做、存档恢复、回放和隔离自由练习已通过程序检查。单位、牙位/上下颌、邻接、教学角色与正式使用范围仍待核对，目标设备性能尚未验收，当前属于开发版。

完整说明见 [游戏 README](chi-xu-workshop/README.md) 与 [验收记录](chi-xu-workshop/docs/VALIDATION.md)。
