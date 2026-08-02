# 跳蛛 · Playful Jumper

一个无构建步骤的 Three.js 跳蛛实验：鼠标引导行走，点击跳扑，空格威吓。纯程序化模型，无外部资产。

## 运行

直接双击 `index.html` 即可，零资产、无服务器依赖。确定性路线自检需要本地服务器，见 [docs/verification.md](docs/verification.md)。

## 桌面宠

```sh
./desktop/run.sh
```

透明置顶、点击穿透的桌宠壳（Swift + WKWebView，零权限依赖）：蜘蛛跟随全局鼠标，光标进入任意桌面窗口时投影到窗口边缘，蜘蛛会爬过去沿窗框走。

## 代码地图

- `app.js`：场景、程序化身体、渲染与交互基础。
- `src/gait.js`：落脚规划、转向和防交叉约束。
- `src/self-test.js`：确定性的路线评测。
- `src/bootstrap.js`：事件绑定与启动副作用。
- `desktop/SpiderPet.swift`：桌宠壳（窗口、鼠标、窗框注入）。

更多约定见 [docs/architecture.md](docs/architecture.md) 和 [AGENTS.md](AGENTS.md)。
