# 沉浸式 3D 工作台网页设计规范

> 参考研究对象：[Henry Heffernan Portfolio 2022](https://henryheffernan.com/)  
> 用途：为后续前端网页、LoRA Dataset Studio 品牌页和产品体验提供设计方向。  
> 原则：借鉴交互结构与设计思想，不复制原站场景、模型、文案或品牌资产。

## 1. 核心设计判断

参考网站不是传统的纵向滚动作品集，而是一个可以进入的数字空间。

它的核心公式是：

```text
熟悉的现实场景
+ 带年代感的视觉语言
+ 有目的的探索交互
+ 对应现实物件的声音反馈
= 具有记忆点的网页体验
```

最值得复用的不是“复古电脑”本身，而是以下三点：

1. **界面属于场景，而不是漂浮在场景上。**  
   内容主要存在于电脑显示器内，显示器是信息入口，也是视觉焦点。
2. **交互承担叙事。**  
   启动、靠近显示器、点击鼠标和键盘都有过程，让用户感觉自己正在使用一件物品。
3. **视觉、动效与声音遵循同一世界观。**  
   BIOS 字体、CRT 抖动、启动音、键盘音、低保真 3D 模型共同建立一致体验。

## 2. 页面体验流程

### 2.1 启动阶段

页面先展示全屏黑色 BIOS / 终端式加载界面：

- 资源加载信息逐行出现。
- 使用等宽字体、绿色和白色文本。
- 加载完成后出现明确的 `START` 按钮。
- 点击开始后播放启动音并进入 3D 场景。
- 首次体验存在仪式感，同时解决浏览器需要用户交互后才能播放声音的问题。

### 2.2 场景探索阶段

进入由 WebGL 渲染的低保真 3D 办公桌：

- 桌面和显示器位于画面中心。
- 文件、键盘、鼠标、椅子、植物等物件建立真实尺度。
- 相机可以拖拽旋转、滚轮缩放，但限制移动范围，避免用户迷失。
- 显示器始终是最高视觉优先级。
- 微弱环境动画持续运行，例如咖啡蒸汽、屏幕影像和轻微画面抖动。

### 2.3 内容交互阶段

用户靠近或点击显示器后：

- 相机平滑过渡到显示器正面。
- 场景中的显示器承载真实网页界面，而不是只播放一段视频。
- 鼠标、键盘事件被映射到显示器中的网页。
- 用户离开显示器后，相机平滑返回场景。

## 3. 交互逻辑拆解

| 用户行为 | 系统响应 | 设计目的 |
|---|---|---|
| 打开页面 | 显示 BIOS 加载界面和资源进度 | 建立世界观，掩盖 3D 资源加载 |
| 点击 START | 淡出加载层，播放启动音，相机进入主场景 | 给体验一个明确起点 |
| 移动鼠标 | 场景产生轻微响应或显示操作提示 | 告诉用户页面可探索 |
| 拖拽场景 | 围绕桌面焦点旋转相机 | 提供空间感 |
| 滚轮 / 双指 | 在受限范围内缩放相机 | 探索细节但不迷路 |
| 点击显示器 | 相机过渡到屏幕，启用屏幕内交互 | 从空间探索切换到内容阅读 |
| 屏幕内点击和输入 | 播放鼠标、键盘声音并操作嵌入网页 | 增强物理反馈 |
| 离开显示器 | 恢复场景相机和场景控制 | 回到空间探索 |

### 关键交互原则

- 每个可点击区域必须通过光标、轻微高亮或操作提示说明。
- 相机动画必须有清晰终点，不使用无限自由飞行。
- 同一时刻只允许一种主要交互模式：探索场景或操作屏幕。
- 用户随时可以退出沉浸体验或返回默认视角。
- 为 `prefers-reduced-motion` 提供减少动画模式。

## 4. 动效系统

### 4.1 宏观动效

**相机过渡**

- 使用关键帧在默认视角、显示器视角和自由查看视角之间切换。
- 推荐时长：`1.2s–2.5s`。
- 推荐缓动：`expo.out`、`cubic-bezier(0.16, 1, 0.3, 1)`。
- 进入显示器时轻微加速，接近终点时明显减速。

**启动过渡**

- 黑色加载层淡出时可略微放大，模拟进入场景。
- 内容分两阶段出现：场景先稳定，操作提示后出现。

### 4.2 微观动效

- BIOS 加载点使用阶梯帧动画，而不是平滑动画。
- 光标以约 `650ms` 周期闪烁。
- CRT / 复古显示效果使用极轻微随机位移，不影响阅读。
- 可交互提示从左侧滑入并淡入。
- 咖啡蒸汽等环境物件持续缓慢运动。
- 点击、键盘输入、启动动作均有对应声音反馈。

### 动效约束

- 一次只突出一个主要动效。
- 环境动效必须低对比、低振幅。
- 不使用与空间叙事无关的随机漂浮元素。
- 动画不能阻止基本内容访问。

## 5. 排版与布局

### 5.1 画面构图

- 全屏固定画布，页面主体不依赖传统滚动。
- 使用中央透视构图，桌面水平线稳定画面。
- 显示器占据视觉中心，周围物品形成不完全对称的平衡。
- 大面积灰色墙面作为负空间，让中心物件更突出。
- 近景椅背遮挡部分桌面，增强空间深度。

### 5.2 UI 排版

- 场景外 UI 极少，仅提供必要操作提示。
- BIOS 和系统信息使用等宽字体。
- 显示器内网页可以使用另一套更具品牌性的排版。
- 文本保持短句，优先使用操作动词。
- 在复古语境中使用像素感或低分辨率处理，但正文仍需清晰。

### 5.3 响应式策略

- 桌面端提供完整 3D 探索。
- 移动端降低模型复杂度、关闭部分阴影和环境效果。
- 移动端可以直接进入显示器内容或提供简化场景。
- 操作提示需同时覆盖鼠标、触摸和键盘。

## 6. 画面风格与素材

### 风格关键词

```text
低保真 3D、千禧年前后办公空间、CRT 显示器、BIOS 启动界面、
柔和灰色环境、烘焙光照、轻微噪点、有限色彩、安静、怀旧、可探索
```

### 色彩建议

| 角色 | 建议颜色 |
|---|---|
| 环境背景 | 冷灰 `#A6A5AD` |
| 桌面与深色物件 | 炭黑 `#252429` |
| 显示器与键盘 | 暖灰白 `#D7D4CC` |
| 植物强调色 | 柔和绿 `#6DBB79` |
| BIOS 背景 | 黑 `#000000` |
| BIOS 文本 | 白 `#FFFFFF`、终端绿 `#65D48A` |
| 少量行动强调 | 红橙 `#E35C56` |

### 图片和 3D 元素

- 使用 Blender 等工具建立简化低多边形场景。
- 将复杂光照烘焙进贴图，减少实时渲染压力。
- 重点模型：显示器、主机、键盘、鼠标、桌面、椅子。
- 辅助模型：文件盒、纸张、杯子、植物。
- 显示器表面叠加阴影和污渍纹理，避免过于数字化。
- 屏幕内容可以使用 iframe、CSS 3D 对象或视频纹理。

## 7. 技术栈拆解

### 可从公开构建资源验证

- **React / React DOM**：负责加载界面、提示 UI 和状态切换。
- **Three.js**：负责 WebGL 3D 场景、相机、材质与渲染。
- **Three.js GLTFLoader**：加载 `.glb` 场景模型。
- **Three.js DRACOLoader**：支持压缩 3D 模型。
- **Three.js OrbitControls**：提供受限旋转和缩放。
- **Three.js CSS3DRenderer / CSS3DObject**：将 HTML 内容放入 3D 场景。
- **Framer Motion**：负责 React UI 的淡入、滑入和状态动画。
- **Web Audio / Three.js Audio**：播放启动、键盘、鼠标和空间环境声音。
- **iframe**：显示器中嵌入独立网页 `os.henryheffernan.com`。
- **GLB + 烘焙 JPG 纹理**：分别加载电脑、装饰和环境模型。
- **MP4 视频纹理**：为显示器或场景提供动态画面。

### 实现结构建议

```text
React application
├── Loading experience
├── Instruction overlay
├── Three.js application
│   ├── Scene and baked models
│   ├── Camera state machine
│   ├── Orbit controls
│   ├── Interactive monitor
│   ├── Ambient animation
│   └── Spatial audio
└── Embedded product/content UI
```

## 8. 用于 LoRA Dataset Studio 的转译

不要直接复制复古办公室。对我们的产品，更合适的转译是：

### 推荐概念：创作者的数字暗房

- 将数据集工作区表现为一张安静的“数字灯箱桌面”。
- 图片像底片或拍立得一样排列，但保持现代、清晰、易操作。
- 自动打标时，图片依次亮起并浮现标签，形成一次有节奏的主动画。
- 标签编辑器像一张附在图片旁的注释卡。
- 高级设置继续隐藏，避免破坏新手流程。
- 可以加入非常轻的胶片颗粒、扫描线或光桌纹理，但不影响可读性。

### 应保留

- 单一且明确的视觉世界观。
- 有意义的启动或导入仪式。
- 一个主要的标志性交互动效。
- 低干扰的环境反馈。
- 场景化但易理解的操作语言。

### 应避免

- 为了炫技而让用户在 3D 场景中寻找功能。
- 长时间不可跳过的加载动画。
- 过多声音或默认高音量。
- 低对比度复古滤镜影响标签阅读。
- 将核心生产力操作藏在装饰性物件后。

## 9. 中文前端生成提示词

### 通用沉浸式作品页

```text
设计并实现一个沉浸式、可探索的单页网页体验。页面不是传统纵向滚动布局，而是一个全屏数字空间。使用低保真 3D 场景作为主要画面，中央放置一个明确的信息入口，例如显示器、灯箱或控制台。用户首先看到简短的系统启动界面，点击开始后平滑进入主场景。

视觉风格安静、克制、略带千禧年前后的数字怀旧感：柔和冷灰环境、炭黑家具、暖灰设备、少量绿色或紫色强调色。使用烘焙光照、轻微噪点和低幅度环境动画，避免霓虹赛博朋克和过度装饰。

交互包括：受限的拖拽查看、滚轮缩放、点击主要入口后相机平滑靠近，以及进入内容模式后禁用场景控制。提供明确的操作提示和随时退出内容模式的方式。加入启动音、轻微点击声和环境声，但默认音量克制，并支持静音。

技术使用 React、TypeScript、Three.js、React Three Fiber 或原生 Three.js、Framer Motion。模型使用 GLB 和烘焙纹理。确保支持键盘操作、prefers-reduced-motion、移动端降级和快速加载。

页面必须围绕一个独特主题建立一致世界观。所有动效、文案、声音和视觉元素都服务于该主题。不要复制任何现有网站的模型、布局细节、品牌或文案。
```

### LoRA Dataset Studio 定向提示词

```text
为一个新人友好的 LoRA 图片自动打标工具设计前端体验，概念为“创作者的数字暗房”。不要使用复杂专业仪表盘，也不要让 3D 装饰妨碍操作。

页面使用现代的两栏生产力布局：左侧是宽阔的图片灯箱和数据集流程，右侧是当前图片与标签编辑卡。整体色彩采用柔和冷灰、温暖白色和克制的淡紫强调色。图片像放在灯箱上的底片或拍立得，但保持整洁、现代且高可读。

新手流程只有三步：选择训练内容、导入图片、检查并导出。自动打标是页面唯一的标志性交互动效：开始后图片按顺序柔和亮起，标签像注释纸条一样逐个出现。动效结束后，界面明确提示用户检查不准确标签。专业参数和 Danbooru 细节默认收进“高级设置”。

使用清晰的中文文案、至少 14px 的正文、宽松留白、大点击区域和明确状态。不要默认展示置信度、模型参数、标签类别或复杂统计。保持标签编辑、批量选择、搜索和导出操作快速直接。

使用 React、TypeScript 和 Framer Motion 实现。支持键盘焦点、减少动画模式、空状态、错误状态和移动端布局。视觉可以带少量胶片颗粒或扫描感，但不得影响图片和标签阅读。
```

## 10. English Frontend Generation Prompts

### General Immersive Experience

```text
Design and build an immersive, explorable single-page web experience instead of a conventional vertically scrolling landing page. Use a full-screen low-fidelity 3D environment as the primary composition, with one obvious information gateway at the center, such as a monitor, light table, or console. Begin with a short system startup screen, then smoothly transition into the main environment after the user clicks Start.

The visual direction should feel quiet, restrained, and subtly inspired by turn-of-the-millennium digital nostalgia: soft cool-gray surroundings, charcoal furniture, warm off-white hardware, and one restrained green or violet accent. Use baked lighting, subtle texture noise, and low-amplitude ambient motion. Avoid neon cyberpunk styling and decorative visual clutter.

Interactions should include constrained drag-to-orbit, wheel-to-zoom, a smooth camera transition toward the primary gateway, and a dedicated content mode that temporarily disables scene controls. Provide obvious interaction hints and an easy way to leave content mode. Add restrained startup, click, typing, and ambient sounds with a clear mute control.

Use React, TypeScript, Three.js or React Three Fiber, and Framer Motion. Load GLB models with baked textures. Support keyboard navigation, prefers-reduced-motion, mobile fallbacks, and fast loading.

Build one coherent visual world. Every animation, sound, line of copy, and visual element must reinforce the chosen subject. Do not copy the assets, exact layout, branding, or copy of any existing website.
```

### LoRA Dataset Studio Prompt

```text
Design a beginner-friendly frontend for a LoRA image auto-tagging tool using the concept of a “digital darkroom for creators.” Do not build a dense professional dashboard, and do not let decorative 3D elements interfere with productivity.

Use a modern two-column workspace: a spacious image light table and dataset workflow on the left, and a focused image-and-tag editing card on the right. Use soft cool grays, warm whites, and a restrained pale-violet accent. Images may feel like film frames or instant photos placed on a light table, while remaining clean, modern, and highly readable.

The beginner workflow has only three steps: choose what to train, import images, then review and export. Auto-tagging should be the single signature interaction: after it starts, images softly illuminate in sequence and tags appear like annotation slips. When the animation finishes, clearly invite the user to remove inaccurate tags. Hide model parameters, Danbooru internals, confidence values, and expert controls inside a collapsed Advanced Settings section.

Use plain-language Chinese UI copy, body text of at least 14px, generous spacing, large click targets, and clear states. Keep tag editing, batch selection, search, and export direct and fast. Do not show complex analytics or technical metadata by default.

Implement with React, TypeScript, and Framer Motion. Include keyboard focus states, reduced-motion support, empty states, error states, and a responsive mobile layout. A very subtle film-grain or scanning texture is acceptable, but it must never reduce image or tag readability.
```

## 11. 后续项目设计检查清单

- 页面是否能在 5 秒内让新人理解下一步？
- 是否只有一个主要视觉焦点和一个主要行动按钮？
- 动效是否帮助用户理解状态，而不是展示技术？
- 专业设置是否默认隐藏？
- 正文是否至少 14px，并具有足够对比度？
- 图片与标签是否始终比装饰元素更清晰？
- 没有声音时，交互是否仍然完整？
- 减少动画模式下，页面是否仍然可用？
- 移动端是否提供简化但完整的流程？
- 是否建立了自己的主题，而非复制参考网站？

## 12. 研究证据与不确定性

### 已验证

- 页面 HTML 包含独立的 `webgl`、`css`、`ui` 与交互层。
- 页面锁定浏览器滚动，以全屏场景作为主体。
- 构建文件包含 React、Three.js、GLTFLoader、DRACOLoader、OrbitControls、CSS3D 对象和 Framer Motion 相关实现。
- 场景加载三个 GLB 模型及对应烘焙纹理：电脑、装饰、环境。
- 页面加载鼠标、键盘、启动与办公室环境声音。
- 显示器嵌入 `https://os.henryheffernan.com/`，并转发鼠标与键盘事件。
- 相机使用关键帧过渡，并提供受限 OrbitControls。
- CSS 中包含 CRT 抖动、加载点和闪烁光标动画。

### 推断

- 部分具体交互触发区域、移动端完整体验和所有相机路径来自构建代码与公开截图推断；由于当前环境无法直接操作该站点，未逐项手动验证。

