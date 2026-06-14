# LoRA Dataset Studio AI 交接文档

更新时间：2026-06-14

## 交接目标

继续把当前可运行的网页原型，完成为面向新手的 Windows 桌面应用：

1. 导入 LoRA 训练图片。
2. 在打标前统一处理图片尺寸。
3. 选择本地 WD14 或视觉 AI 进行 Danbooru 格式打标。
4. 可视化检查、添加、删除和整理标签。
5. 导出处理后的 JPG、同名 TXT 标签和处理报告。

产品强调新手友好、本地优先、不会覆盖原图。首个正式版本不做 LoRA 训练，也不混合本地与 AI 的打标结果。

## 项目与 Git

- 本地目录：`D:\codeX\lora-dataset-studio`
- GitHub：`https://github.com/mccsosix/lora-dataset-studio`
- 默认分支：`main`
- 当前基线提交：`a5344b9 feat: initialize LoRA Dataset Studio`
- 当前技术栈：React 19、TypeScript、Vite、JSZip、Python WD14 辅助脚本

当前电脑直连 GitHub 的 HTTPS 可能失败。推送时可临时使用系统代理：

```powershell
git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 push
```

不要把代理地址写入项目或全局 Git 配置。

## 新 AI 首先阅读

按顺序阅读：

1. `docs/AI-HANDOFF.md`：当前状态与交接入口。
2. `docs/superpowers/specs/2026-06-14-desktop-dual-tagger-design.md`：已经确认的完整产品设计。
3. `docs/superpowers/plans/2026-06-14-desktop-dual-tagger-implementation.md`：11 个阶段的正式实施计划。
4. `docs/interactive-3d-workspace-design-guide.md`：暗房、灯箱和交互动效规范。
5. `src/App.tsx` 与 `src/style.css`：当前全部主要 UI 和交互。
6. `vite.config.ts` 与 `scripts/wd14_tagger.py`：当前本机图片读取和 WD14 打标原型。

实施时优先遵循设计文档和实施计划，不要仅根据当前原型结构继续堆功能。

## 当前已经完成

### 视觉与交互原型

- 暗房入口场景。
- 灯箱从桌面立起并靠近用户的入场动效。
- 暗房灯光和背景氛围。
- 可开关的 Web Audio 环境白噪音。
- 灯箱工作台界面。
- 图片网格、选中状态和大图预览。
- 面向新手的中文提示和折叠高级选项。

### 标签工作流原型

- Danbooru 标签数据结构。
- 标签名称规范化、去重和序列化。
- 按人物、画风、概念选择训练类型。
- 自动加入对应触发词。
- 添加和删除标签。
- 根据阈值清理低置信度标签。
- 搜索图片名称或标签。
- 只对选中图片运行打标。

### 本机 WD14 原型

- Vite 开发服务器读取指定本地图片文件夹。
- Python、Pillow、NumPy、ONNX Runtime 调用已有 WD14 模型。
- 返回真实 WD14 Danbooru 标签和置信度。
- 对浏览器不易预览的图片生成本地预览缓存。

### 导出原型

- 浏览器内生成 ZIP。
- ZIP 当前包含同名 TXT 标签文件和 `dataset-settings.json`。

### Git 与验证

- Git 仓库已初始化并推送到公开 GitHub 仓库。
- `npm run build` 当前通过。
- `.env.local`、模型、缓存、`node_modules` 和 `dist` 已被忽略。

## 当前运行方式

```powershell
cd D:\codeX\lora-dataset-studio
npm install
npm run dev -- --host 127.0.0.1
```

生产前端构建：

```powershell
npm run build
```

当前本机原型依赖 `.env.local` 中的配置。参考 `.env.local.example`：

- `LORA_IMAGE_FOLDER`
- `WD14_PYTHON`
- `WD14_MODEL_DIR`

## 尚未完成的核心部分

### P0：桌面应用基础

- [ ] 将项目转换为 Electron Windows 桌面应用。
- [ ] 启用 `contextIsolation: true`，禁用 renderer 的 Node integration。
- [ ] 建立受限、类型安全的 preload API。
- [ ] 使用原生文件夹选择器替代固定目录。
- [ ] 将项目状态保存到 Electron `userData` 并支持重启恢复。
- [ ] 添加 Vitest 测试基础。

### P0：打标前图片预处理

- [ ] 默认模式：保持宽高比并输出适合 SDXL bucket 的尺寸。
- [ ] 可选模式：等比例缩放后白边填充到 `1024x1024`。
- [ ] 可选模式：居中裁剪到 `1024x1024`。
- [ ] 使用 EXIF 方向、sRGB、Lanczos、JPEG 质量 95。
- [ ] 保留原始基础文件名，统一输出 `.jpg`。
- [ ] 永不覆盖或修改原图。
- [ ] 在 UI 中把白边可能被 LoRA 学习、裁剪可能丢失内容讲清楚。

### P0：正式本地 WD14

- [ ] 移除对作者电脑 Python 和绝对模型路径的依赖。
- [ ] 使用 `onnxruntime-node` 在 Electron 主进程完成推理。
- [ ] 创建固定兼容版本的模型 manifest。
- [ ] 支持下载进度、断点失败处理、SHA-256 校验和原子安装。
- [ ] 支持模型状态查看、重试、更新和删除。
- [ ] 确保打包应用在没有 Python 的新电脑上也能本地打标。

### P0：批处理与恢复

- [ ] 定义统一的 `TaggerAdapter`、`TagRequest` 和 `TagResult`。
- [ ] 每张图片独立处理，单张失败不能终止整批。
- [ ] 支持暂停、取消、失败项重试和重启恢复。
- [ ] 原始模型输出与用户编辑后的标签分开保存。

### P1：视觉 AI 打标

- [ ] 支持 Gemini、OpenAI 和 Claude，用户自带 API Key。
- [ ] API Key 仅存储在 Electron 主进程的系统凭据库中。
- [ ] renderer、项目状态、日志和导出文件不得出现 API Key。
- [ ] 所有提供商使用统一提示词，返回结构化 Danbooru JSON 标签。
- [ ] 根据人物、画风、概念调整提示词。
- [ ] 第一次发送图片前，明确提示提供商、图片数量、隐私和计费。
- [ ] AI 限流时暂停队列，而不是丢失任务。

DeepSeek 当前不支持直接视觉图片输入，不应加入视觉打标提供商列表。

### P1：引擎选择与新手体验

- [ ] 首次使用时轻量推荐本地 WD14，但不阻止进入工作台。
- [ ] 工作台始终显示当前引擎和是否可用。
- [ ] 用户可随时在本地 WD14 与视觉 AI 之间切换。
- [ ] 首版不合并本地与 AI 标签。
- [ ] 保留现有暗房和灯箱的核心动效体验。
- [ ] 继续使用普通用户能理解的语言，专业参数默认折叠。

### P1：正式导出

- [ ] 导出处理后的 JPG 图片。
- [ ] 导出同名 TXT，内容为逗号加空格分隔的 Danbooru 标签。
- [ ] 导出 `dataset-settings.json`。
- [ ] 导出 `processing-report.json`。
- [ ] 报告记录尺寸处理方式、原始与输出尺寸、引擎、模型 ID 和单图结果。
- [ ] 导出内容不得包含 API Key 或不受限制的原始绝对路径。

### P2：打包、文档和发布

- [ ] 使用 electron-builder 构建 Windows 安装包。
- [ ] 添加 GitHub Actions tagged release 工作流。
- [ ] 补充安装、隐私、AI 费用、模型许可证和贡献文档。
- [ ] 在干净 Windows 用户环境中完成安装验收。

## 推荐的下一步实施顺序

严格按以下顺序推进，每个阶段都应有测试并单独提交：

1. 执行正式计划 Task 1：Electron、preload bridge、Vitest 基础。
2. 执行 Task 2：原生文件夹选择与项目持久化。
3. 执行 Task 3：三种图片预处理模式。
4. 执行 Task 4：统一 tagger adapter 和可恢复批处理。
5. 执行 Task 5 与 Task 6：模型下载管理和无 Python 的 WD14。
6. 执行 Task 7 与 Task 8：安全密钥与三家视觉 AI。
7. 执行 Task 9 与 Task 10：引擎 UX 和正式导出。
8. 执行 Task 11：打包、文档与 GitHub Release。

第一个可靠里程碑应是：

> Electron 应用可选择图片文件夹，以三种模式之一生成不修改原图的处理后 JPG，并能在重启后恢复项目。

不要先接视觉 AI。先解决桌面架构、图片安全和项目持久化，否则后续功能会继续依赖 Vite 临时中间件并产生返工。

## 当前已知技术债与风险

### 必须尽快替换

- `vite.config.ts` 目前承担本地文件系统与打标后端职责，只适合开发原型。
- `vite.config.ts` 和 `scripts/wd14_tagger.py` 包含作者电脑的默认绝对路径。
- Python WD14 依赖作者已有 Forge 环境，不能用于公开发布。
- `src/App.tsx` 约四百多行，包含场景、音频、图片管理、打标和导出，后续需要按职责拆分。
- 当前没有自动化测试。
- 当前没有 Electron、模型管理、凭据管理和可恢复队列。

### 当前导出限制

- ZIP 不包含原图或处理后的 JPG。
- 没有 `processing-report.json`。
- 没有逐图失败与来源信息。
- 浏览器导出方式不适合作为最终桌面应用实现。

### 数据和安全要求

- 绝不覆盖原始图片。
- 绝不把 API Key 传给 renderer。
- 绝不把 API Key、个人绝对路径、模型文件或缓存提交到 Git。
- 任何发送到第三方视觉 AI 的操作，都要在首次批处理前明确告知用户。
- 批处理中单张失败不能清除其他图片的已完成结果。

## 关键类型与架构约束

每个打标引擎最终必须实现统一接口，具体定义以设计文档为准：

```ts
type TaggerProviderId = 'local-wd14' | 'gemini' | 'openai' | 'claude'

interface TaggerAdapter {
  id: TaggerProviderId
  checkReady(): Promise<ProviderReadiness>
  tag(request: TagRequest, onProgress: ProgressCallback): Promise<TagResult[]>
}
```

桌面架构边界：

- React renderer：只负责 UI、选择、编辑与展示安全 DTO。
- preload：只暴露明确允许的方法。
- Electron main：文件系统、预处理、模型、ONNX、API 请求、凭据和导出。
- 原始模型输出与编辑后的标签分开保存。

## 不在首版范围

- 本地 WD14 与视觉 AI 混合打标。
- 自动 LoRA 训练。
- 托管代理或订阅服务。
- 云同步。
- macOS 和 Linux 安装包。

## 每阶段完成标准

在宣称完成前至少运行：

```powershell
npm test
npm run build
```

桌面化后还需要运行：

```powershell
npm run dist:win
```

并检查：

- 工作区无意外未提交文件。
- 没有提交模型、缓存、密钥或个人绝对路径。
- 原图字节未发生变化。
- 导出数据不含密钥和不受限制的绝对路径。
- 新增行为有自动化测试。

## 给接手 AI 的建议

当前 UI 原型已经表达了产品气质，不建议推倒重做视觉层。应优先把它迁移到可靠的 Electron 架构，再逐步拆分组件。

遇到实现决策冲突时，优先级为：

1. 不损坏用户原图和密钥安全。
2. 新手可理解、可恢复。
3. 本地 WD14 免费且私密的默认体验。
4. 保留暗房和灯箱的动效特色。
5. 最后才是专家参数和扩展能力。
