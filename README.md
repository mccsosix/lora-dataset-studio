# LoRA Dataset Studio

一个面向新手的本地 LoRA 图片整理与 Danbooru 标签工具。

## 当前可用流程

1. 运行 `npm run dev -- --host 127.0.0.1`
2. 点击暗房下方灯箱进入工作台
3. 工作台自动读取 `C:\Users\Moc\Pictures\yj`
4. 选择图片后点击“生成标签”
5. 检查、删除或添加 Danbooru 标签
6. 导出 ZIP 训练数据集

真实图片打标由本机已有的 `wd14-vit-v2-git` 模型完成。DeepSeek 当前官方 API 只接受文本，不能直接读取图片，因此没有用于视觉打标。

## 本机配置

复制 `.env.local.example` 为 `.env.local` 后，可以修改：

- `LORA_IMAGE_FOLDER`: 默认图片文件夹
- `WD14_PYTHON`: 带有 ONNX Runtime、Pillow 和 NumPy 的 Python
- `WD14_MODEL_DIR`: WD14 模型与 `selected_tags.csv` 所在目录

`.env.local` 与本地预览缓存不会进入版本控制。
