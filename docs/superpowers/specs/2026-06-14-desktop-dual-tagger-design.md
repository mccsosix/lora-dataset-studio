# Desktop Dual-Tagger Design

## Summary

LoRA Dataset Studio will become a Windows-first Electron desktop application that prepares images for SDXL LoRA training and generates Danbooru-format tags.

The beginner flow is:

1. Select original images.
2. Prepare image dimensions.
3. Choose one tagging engine.
4. Review and edit tags.
5. Export processed images, same-name caption files, and a processing report.

The first release supports two independent tagging paths:

- Local WD14 tagging.
- Visual AI tagging through Gemini, OpenAI, or Claude using the user's own API key.

Local and AI results are not merged in the first release.

## Product Principles

- Local-first by default.
- Beginner-friendly language and progressive disclosure.
- Never overwrite original images.
- Preserve raw model output separately from edited tags.
- Keep API keys out of renderer code, logs, project files, and exported datasets.
- State clearly when images will leave the computer.
- A failed image must not stop the rest of a batch.

## Desktop Architecture

### Electron Renderer

The existing React/Vite darkroom and light-table workspace remains the renderer UI.

It is responsible for:

- Showing images and processing status.
- Letting users choose preprocessing mode and tagging engine.
- Editing structured Danbooru tags.
- Showing download, connection, batch, and export progress.

The renderer receives only safe DTOs through a narrow preload API. It never receives API keys or unrestricted filesystem paths.

### Electron Main Process

The Electron main process owns privileged operations:

- Native folder and file selection.
- Image preprocessing.
- Local model installation and deletion.
- ONNX inference.
- Visual AI network requests.
- API key storage through the operating system credential vault.
- Dataset export.

Context isolation remains enabled. Node integration remains disabled in the renderer.

### Adapter Boundary

Every tagging engine implements one interface:

```ts
type TaggerProviderId = 'local-wd14' | 'gemini' | 'openai' | 'claude'

type TagRequest = {
  images: Array<{ id: string; processedPath: string }>
  trainingType: 'character' | 'style' | 'concept'
  threshold: number
}

type TagResult = {
  imageId: string
  providerId: TaggerProviderId
  tags: DanbooruTag[]
  rawResponse: unknown
  error?: string
}

interface TaggerAdapter {
  id: TaggerProviderId
  checkReady(): Promise<ProviderReadiness>
  tag(request: TagRequest, onProgress: ProgressCallback): Promise<TagResult[]>
}
```

AI adapters use a shared prompt contract requiring JSON output. Returned names are normalized and deduplicated before reaching the renderer.

## Image Preparation

Image preparation always runs before tagging so tags describe the actual training images.

Original files remain untouched. Processed images are written to a new project output directory with original base names and `.jpg` extensions.

All modes:

- Apply EXIF orientation.
- Flatten transparency against a configurable background.
- Convert to sRGB JPEG.
- Use high-quality Lanczos resizing.
- Save JPEG at quality 95.
- Preserve the original base filename.
- Record original and output dimensions in a processing report.

### Default: Preserve Aspect Ratio

This is the recommended SDXL mode.

- Preserve the original aspect ratio.
- Resize toward a default target area of `1024 * 1024` pixels while preserving aspect ratio.
- Do not add borders.
- Do not crop.
- Export bucket-compatible dimensions rounded to a configurable step, default 64.
- Enforce a configurable minimum bucket side, default 256, and maximum side, default 2048.
- Do not upscale images unless the user enables upscaling in advanced settings.

This mode is intended for training with aspect-ratio bucketing.

### Optional: White Padding

This compatibility mode outputs exactly `1024x1024`.

```text
ratio = min(1024 / originalWidth, 1024 / originalHeight)
scaledWidth = round(originalWidth * ratio)
scaledHeight = round(originalHeight * ratio)
xOffset = floor((1024 - scaledWidth) / 2)
yOffset = floor((1024 - scaledHeight) / 2)
```

The resized image is centered on a white `1024x1024` canvas.

The UI warns that repeated white borders can be learned by a LoRA.

### Optional: Center Crop

This mode fills and center-crops to exactly `1024x1024`.

The UI warns that important content may be removed.

## Local WD14 Model Management

The application ships without a large model.

On first local-tagging use:

1. Show the recommended model name, download size, license link, and storage location.
2. Download the pinned recommended model manifest.
3. Stream progress to the renderer.
4. Download into a temporary partial directory.
5. Verify file size and SHA-256 checksums.
6. Atomically activate the verified version.

The model manifest pins a known-compatible model instead of blindly downloading upstream latest files.

The application may check for a newer recommended manifest and offer an upgrade. Failed upgrades keep the existing model usable.

Users can:

- See installed and recommended versions.
- Retry downloads.
- Remove downloaded models.
- Select a custom compatible model directory from advanced settings.

## Visual AI Providers

The first release supports:

- Gemini.
- OpenAI.
- Claude.

Each adapter:

- Accepts image inputs supported by its provider.
- Uses the user's own API key.
- Requests structured JSON Danbooru tags.
- Applies the selected training-type instructions.
- Normalizes, validates, and deduplicates tags.
- Stores the raw provider response separately from edited tags.
- Reports provider errors per image.

Before the first batch for a provider, the UI states:

- Which provider will receive images.
- How many images will be sent.
- That provider billing and privacy terms apply.

DeepSeek is not a visual provider and is not included in the visual tagging list.

Provider model IDs are stored in a release-managed manifest so the application can update supported defaults without exposing arbitrary model selection to beginners.

## Credential Security

- API keys are stored using an OS credential vault library from the Electron main process.
- The preload API exposes `hasCredential`, `saveCredential`, `testCredential`, and `deleteCredential`, never `readCredential`.
- Keys are redacted from errors and logs.
- Renderer state and local project files never contain API keys.
- Users can clear each provider key from settings.

## User Experience

The confirmed engine-selection pattern is:

- A light first-use recommendation card.
- The user may enter the workspace without completing provider setup.
- The workspace always shows the active engine and readiness state.
- The engine can be changed at any time.

The default recommendation is local WD14 because it is free and private.

States use beginner-facing language:

- `本地模型尚未下载`
- `下载推荐模型`
- `本地打标已就绪`
- `连接视觉 AI`
- `图片将发送到 Gemini`
- `重试失败的 2 张`

Provider, download, and preprocessing details live in a dedicated setup panel. Expert options remain collapsed.

## Batch Processing And Recovery

Every image progresses independently through:

```text
queued -> preparing -> prepared -> tagging -> ready
                                  \-> failed
```

- Batch progress persists to a local project-state file.
- Restarting the application restores completed and failed states.
- Retrying targets only failed images.
- AI rate limits pause the queue and show a clear reason.
- Cancelling stops new work without discarding completed results.

## Export

Export creates a new dataset directory or ZIP containing:

- Processed `.jpg` images.
- Same-base-name `.txt` Danbooru caption files.
- `dataset-settings.json`.
- `processing-report.json`.

The report records:

- Original filename and dimensions.
- Output filename and dimensions.
- Preprocessing mode.
- Tagging provider and model identifier.
- Success or failure information.

No API keys or unrestricted original paths are exported.

## Packaging And GitHub Release

- Electron packages a Windows installer.
- GitHub Actions builds installer artifacts for tagged releases.
- Large WD14 model files are downloaded after installation and are not committed to Git.
- README explains local and AI modes, privacy, costs, and model licenses.
- The repository includes a contributor setup path that does not rely on the author's personal machine paths.

## Testing And Acceptance

Automated tests cover:

- Aspect-preserving, padding, and crop image geometry.
- JPEG output and filename preservation.
- Manifest validation and checksum failure behavior.
- Adapter normalization and error mapping.
- Credential IPC never returning secret values.
- Batch resume, cancel, and retry.
- Export structure and absence of secrets.

Acceptance requires:

1. A new Windows user can install and open the application without Node or Python.
2. The user can select images and preprocess them without changing originals.
3. The user can download the recommended WD14 model and tag images locally.
4. The user can configure and use Gemini, OpenAI, or Claude independently.
5. The user can edit tags and export an SDXL-ready Danbooru dataset.
6. Failures are recoverable and do not discard completed work.

## Explicitly Deferred

- Hybrid local-plus-AI tagging.
- A hosted proxy or subscription service.
- Cloud synchronization.
- Automatic LoRA training.
- macOS and Linux installers.
