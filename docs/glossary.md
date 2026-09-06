# Motion & animation glossary

A compact shared vocabulary for Spider. The goal is to keep discussions precise without assuming graphics/animation background.

- **Locomotion**：整体移动系统。包含身体如何平移/转向、什么时候迈腿、脚落哪里、如何保持连续运动。
- **Gait（步态）**：腿的协调节奏和顺序，例如哪些腿处于支撑、哪些腿正在摆动。它是 locomotion 的一部分，不等于整个移动系统。
- **Stance（支撑相）**：某条腿的脚已经落地、暂时承担“支撑”视觉角色的阶段。
- **Swing（摆动相）**：脚离地，从旧落点移动到新落点的阶段。
- **Foothold / foot target（落脚点）**：某条腿下一次计划踩到的世界坐标。
- **Foot locking（脚锁定）**：stance 期间把脚尖尽量固定在世界坐标里，身体从它上方移动，从而避免明显“滑步”。
- **IK / Inverse Kinematics（逆向运动学）**：已知“脚要在这里”，反算髋、膝等关节应该转多少。与之相对的 FK 是从关节角一路算出脚在哪里。
- **Skeleton / bones（骨骼）**：隐藏在模型内部的一组层级关节，是动画控制接口；它不决定动画必须是手做、程序算还是物理解。
- **Rig（绑定/骨骼系统）**：骨骼、控制器、约束以及模型蒙皮关系的整体。一个 rigged spider 可以同时接受程序化 IK 和手工动画。
- **Skinning / weights（蒙皮/权重）**：定义骨骼转动时模型表面的哪些顶点跟着哪根骨骼移动，以及影响比例。
- **Procedural animation（程序化动画）**：运行时根据目标和环境实时计算动作，例如实时落脚、转弯和 IK。适合连续、不可预先知道目标的动作。
- **Authored / baked animation（手工制作 / 烘焙动画）**：在 Blender 等工具里提前做好并保存的动画片段，例如威吓、清洁触肢、特殊 idle。这里的 “baked” 指动作结果已经记录成关键帧，不再运行时求解。
- **Animation blending（动画混合）**：在两个姿势/动画来源之间平滑过渡，例如 procedural walk 逐渐混到一段 grooming clip，再混回站立。
- **Kinematic motion（运动学控制）**：直接决定“身体应该到哪里、速度是多少”，再让腿和动画去匹配；不要求通过真实受力推导位移。
- **Dynamics / physics simulation（动力学/物理仿真）**：从力、质量、摩擦、碰撞等计算加速度和运动。Spider 只在视觉上值得的地方轻量使用，不以完整生物力学仿真为目标。
- **Motion controller（运动控制器）**：接收“去哪里/朝哪边/多快”的意图，输出连续的 body velocity、heading 和轨迹。
- **Planner（规划器）**：根据当前状态决定下一步动作，例如哪条腿该 replant、候选 foothold 在哪里。它可以是 gait 系统的一部分。
- **Body-authoritative**：身体轨迹是主要真相，腿负责解释并适应它；腿的约束通常做 correction，而不是轻易把身体速度打成 0。
- **Foot-authoritative**：腿/支撑约束先决定身体是否允许移动。Spider 当前 v0.1 更接近这一思路，v0.2 正准备迁移出去。
- **Secondary motion（次级运动）**：不是主要 locomotion、但增强生命感的细小动作，例如腹部轻摆、触肢探索、身体回弹。
- **Procedural model（程序化模型）**：代码直接生成几何体。当前蜘蛛属于这一类，适合调试 gait 和做确定性测试。
- **Rigged mesh（骨骼绑定模型）**：由建模工具制作的网格，通过 rig 变形。未来 production spider 可以用它，但 locomotion 仍然可以是程序化的。
- **Perceptual realism（感知真实）**：优先让人眼觉得符合重量、接触、惯性和生物直觉，而不是证明内部动力学完全等同真实蜘蛛。
