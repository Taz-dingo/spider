# 跳蛛 · Playful Jumper

一个无构建步骤的 Three.js 跳蛛实验：鼠标引导行走，点击跳扑，空格威吓。当前运行时仍是纯程序化模型、无外部资产；项目正在进入 **v0.2 Natural Motion**，目标是先把自然 locomotion、真实多屏映射和基础自主行为做可信。

## 运行

直接双击 `index.html` 即可，零资产、无服务器依赖。确定性路线自检需要本地服务器，见 [docs/verification.md](docs/verification.md)。

## 桌面宠

```sh
./desktop/run.sh
```

透明置顶、点击穿透的桌宠壳（Swift + WKWebView，零权限依赖）。当前版本已具备全局鼠标跟随和跨屏实验能力，但任意多屏布局、连续多次跨屏与鼠标坐标映射仍属于 v0.2 要重新验证的问题，不能仅凭 synthetic tests 视为完全解决。

## 代码地图

- `app.js`：场景、程序化身体、渲染与交互基础。
- `src/gait.js`：当前步态/落脚规划；v0.2 将迁移到 body-authoritative locomotion。
- `src/self-test.js`：确定性的路线评测。
- `src/bootstrap.js`：事件绑定与启动副作用。
- `desktop/SpiderPet.swift`：桌宠壳（窗口、屏幕拓扑、全局鼠标注入）。

## 项目文档

- [docs/current.md](docs/current.md)：**当前版本、优先级和未解决问题；开始工作先看这里。**
- [docs/architecture.md](docs/architecture.md)：现状与 v0.2 目标架构。
- [docs/verification.md](docs/verification.md)：自动化和真实 host 验证。
- [docs/glossary.md](docs/glossary.md)：gait、IK、rig、baked animation 等术语解释。
- [docs/agent-workflow.md](docs/agent-workflow.md)：Coding Agent 的 evidence-first 工作流。
- [AGENTS.md](AGENTS.md)：仓库级 Agent 约束。

`progress.md` 只保存历史实验轨迹，不代表当前 TODO。
