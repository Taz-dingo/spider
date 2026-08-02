# 仿生步态沉淀

跳蛛步态从生物文献到可复用代码的映射。目标：换一个物种（六足昆虫、螳螂、螃蟹……）时，能复用本仓库的规划器结构，只改参数。

## 生物 → 代码映射

- **步态相位（Wilson 1966）**：同侧足交替成组。8 足 → 2 组 tetrapod（4-4 交替）；6 足昆虫 → 3-3 tripod；螃蟹 → 可能 4-4 或 metachronal。代码：`gaitOrder`（`src/gait.js`）+ 触发换步时整组同摆。
- **Metachronal wave（后→前传播）**：被拉伸的后腿优先复植，避免前腿先落把后腿挤进交叉。代码：组内 `gaitOrder` 按 rear-to-front 排列。
- **支撑扇区（stance sector）**：每条腿只在髋周一段扇形内支撑（对应真实关节的活动扇区）。超出即拒绝推进身体。代码：`leg.sector ± stepSector[pair]`。
- **落点-触发余量（reach guard）**：落点 reach 必须显著小于换步触发 reach，否则脚一落地就立刻重触发，整组高频空摆（步态"抽搐"的直接原因）。本仓库第二对足是经典陷阱：外展 58 + 前伸 36 使中性 reach 已 48，大步幅落点 reach 58.7，必须把触发电平提到 62 才有 3+ 余量。
- **支撑多边形**：前进前检查所有植地脚仍在支撑包络内（`supported`/`blocksHeading`），这是防"身体把腿拖出去"的硬约束。
- **速度脉冲**：摆动期身体限速、支撑期全速，两者差距过大 = 视觉抽搐。调 `advanceStep/advanceArc` 让脉冲平滑，而不是只调步幅。

## 可调参数（gaitTuning，src/gait.js）

| 参数 | 含义 | 换物种时先调谁 |
|---|---|---|
| `strideBase/strideGait` | 基础步幅 + 随速度的增量 | 腿长比例 |
| `swingBase/swingGait` | 摆动时长 | 步频特征 |
| `reachLand/reachTrigger` | 落点/触发的 reach 上限 | **先算每对腿的几何 reach，留 ≥3 余量** |
| `blockReach/supportReach` | 转身阻挡/前进支撑阈值 | 与 reachTrigger 联动，保持 block > support > trigger |
| `advanceStep/advanceArc` | 直行/弧线摆动期的前进上限 | 抽搐感来源 |

物种级参数（`app.js`）：`specimen.total/segments`（腿链长）、`roots`（髋位）、`footForward/footSpread`（落点分布）、`stepSector`（扇区宽）、`jointLimits`（关节角范围）、`boneRadius`（粗细）。

## 已验证的经验（避免重复实验）

- **大步幅方向正确，但落点必须留触发余量**：只放宽落点上限（reachLand 59.5）不放触发 → 落地即重触发，adversarial 退化。
- **第三对足落点前移（footForward -14→-6 或系数 .52→.70）都退化**：后腿过前会挤占相邻腿步幅，转向时交叉。
- **5 种调度级修法修不掉 3-4 对瞬时交叉**：前后序约束、相邻净空 14、低触发、批量同组、快速摆动——全部回退。交叉是相邻腿步幅耦合的几何问题，需要 planner 级（按对分配步幅，而不是逐腿试落点）才可能解决。
- **确定性验证**：`evaluateGaitCandidates`（同页面、关 rAF、5 路线一次跑完）两轮结果完全一致；真实 rAF 测量 adversarial 有 ±0.5s 噪声，不要用它做 A/B 裁决。

## 残余问题（2026-08-02）

1. 3-4 对足瞬时交叉：每路线 1-2 帧，`legCrossings` 门非绿，视觉几乎不可见，需 planner 级相邻步幅协调。
2. 转向 replant 期间身体暂停（advance=0）：adversarial twitch ~1.07s 主要来源，是"先站稳再转"的物理代价；可选优化是转向时允许小幅前进。
3. `gaitEfficiency`（footTravel/bodyTravel）随大步幅上升：物理必然（脚拖更远），是信息性指标。
4. `bodyPenetrations` 计数非零：信息性指标，与视觉无对应关系。
