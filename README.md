# 跳蛛 · Playful Jumper

一个无构建步骤的 Three.js 跳蛛实验：鼠标引导行走，点击跳扑，空格威吓，`M` 在真实骨骼模型和程序化模型之间切换。

## 运行

真实 GLB 通过网络请求加载，因此从项目根目录启动本地服务器：

```sh
python3 -m http.server 4173
```

打开 [http://127.0.0.1:4173](http://127.0.0.1:4173)。直接双击 `index.html` 仍可运行程序化版本，但浏览器会阻止真实模型加载。

## 代码地图

- `app.js`：场景、程序化身体、渲染与交互基础。
- `src/gait.js`：落脚规划、转向和防交叉约束。
- `src/self-test.js`：确定性的路线评测。
- `src/rigged-spider.js`：GLB 加载与骨骼 IK 适配。
- `src/bootstrap.js`：事件绑定与启动副作用。

更多约定见 [docs/architecture.md](docs/architecture.md) 和 [AGENTS.md](AGENTS.md)。
