# Desktop Dual-Tagger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert LoRA Dataset Studio into a Windows Electron application that preprocesses SDXL images and tags them with either a downloadable local WD14 model or Gemini, OpenAI, or Claude.

**Architecture:** The existing React/Vite workspace becomes an Electron renderer behind a context-isolated preload bridge. Electron main-process services own filesystem access, preprocessing, model management, credentials, tagger adapters, batch persistence, and export. All taggers return one normalized `TagResult` shape.

**Tech Stack:** Electron, React 19, TypeScript, Vite, Vitest, electron-builder, sharp, onnxruntime-node, keytar, Node `fetch`, JSZip.

---

### Task 1: Establish Desktop Build And Test Foundation

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `tsconfig.electron.json`
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `src/desktop-api.ts`
- Create: `tests/desktop-api.test.ts`

- [x] Add Electron, builder, Vitest, sharp, onnxruntime-node, and keytar dependencies plus `dev`, `test`, `build`, and `dist:win` scripts.
- [x] Write a failing test asserting the browser fallback implements the same safe `DesktopApi` methods as the preload bridge without exposing Node primitives.
- [x] Run `npm test -- tests/desktop-api.test.ts` and verify the missing bridge contract fails.
- [x] Define typed DTOs and expose a minimal `window.loraStudio` bridge through `contextBridge`.
- [x] Implement an Electron main window with `contextIsolation: true`, `nodeIntegration: false`, and a strict preload path.
- [x] Run the desktop API test, `npm run build`, and a packaged-main TypeScript build.

### Task 2: Add Native Project And Image Selection

**Files:**
- Create: `electron/ipc/project.ts`
- Create: `electron/services/project-store.ts`
- Create: `src/types/project.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Modify: `src/App.tsx`
- Test: `tests/project-store.test.ts`

- [x] Write failing tests that a created project stores image metadata without modifying source images and strips unrestricted paths from renderer DTOs.
- [x] Implement native folder selection and project-state persistence under Electron `userData`.
- [x] Add preload methods `selectImageFolder`, `loadProject`, and `saveProject`.
- [x] Replace Vite-only local-folder APIs in the renderer with the desktop API while retaining a development fallback.
- [x] Verify reopening the application restores image list and editing state.

### Task 3: Implement Image Preprocessing Modes

**Files:**
- Create: `electron/services/image-preprocessor.ts`
- Create: `src/types/preprocessing.ts`
- Create: `src/components/PreprocessStep.tsx`
- Modify: `src/App.tsx`
- Test: `tests/image-preprocessor.test.ts`

- [ ] Write failing geometry tests for 1024-square-area bucket sizing with 64-pixel alignment and 256/2048 side limits, `1024x1024` white padding, and `1024x1024` center crop using portrait, landscape, square, extreme-aspect, and small inputs.
- [ ] Implement EXIF orientation, sRGB conversion, Lanczos resizing, transparency flattening, and JPEG quality 95 with `sharp`.
- [ ] Preserve original base filenames, write `.jpg` files into a project processed-images directory, and record dimensions and mode.
- [ ] Build the beginner-facing preprocessing step with preserve-aspect selected by default and warnings for padding and crop.
- [ ] Verify originals remain byte-identical and all processed images are readable JPEGs.

### Task 4: Create Tagger Adapter Contract And Batch Runner

**Files:**
- Create: `electron/taggers/types.ts`
- Create: `electron/services/batch-runner.ts`
- Create: `electron/services/tag-normalizer.ts`
- Create: `src/types/tagging.ts`
- Test: `tests/tag-normalizer.test.ts`
- Test: `tests/batch-runner.test.ts`

- [ ] Write failing tests for normalization, deduplication, category fallback, per-image failure, cancel, resume, and retry.
- [ ] Define `TaggerAdapter`, `TagRequest`, `TagResult`, readiness, and progress event contracts.
- [ ] Implement a batch runner that persists image-level progress and never aborts completed items after one failure.
- [ ] Add IPC progress events and renderer subscriptions.
- [ ] Verify restart restores completed and failed states and retry targets only failures.

### Task 5: Implement Recommended WD14 Model Manager

**Files:**
- Create: `resources/models/wd14-manifest.json`
- Create: `electron/services/model-manager.ts`
- Create: `src/components/ModelSetupPanel.tsx`
- Test: `tests/model-manager.test.ts`

- [ ] Write failing tests for absent, partial, ready, corrupt, upgrade-available, and upgrade-failed model states.
- [ ] Define a pinned manifest containing model version, source URLs, license URL, sizes, and SHA-256 checksums.
- [ ] Implement streamed downloads to a partial directory, checksum verification, atomic activation, retry, deletion, and old-version fallback.
- [ ] Build the local-model setup UI showing size, license, progress, version, retry, and remove actions.
- [ ] Verify a failed or corrupt download never replaces a working installed model.

### Task 6: Implement Local WD14 Adapter

**Files:**
- Create: `electron/taggers/local-wd14.ts`
- Create: `electron/services/wd14-image.ts`
- Test: `tests/local-wd14.test.ts`

- [ ] Write a failing fixture test asserting known tags are returned from a small test model fixture or mocked ONNX session boundary.
- [ ] Implement WD14 preprocessing and inference with `onnxruntime-node`.
- [ ] Read categories from `selected_tags.csv`, apply threshold, and return normalized structured tags.
- [ ] Connect the adapter to the batch runner and model readiness state.
- [ ] Verify local tagging works in a packaged-style environment without Python or personal absolute paths.

### Task 7: Implement Secure Credential Service

**Files:**
- Create: `electron/services/credential-store.ts`
- Create: `electron/ipc/credentials.ts`
- Create: `src/components/ProviderCredentialPanel.tsx`
- Test: `tests/credential-store.test.ts`
- Test: `tests/credential-ipc.test.ts`

- [ ] Write failing tests that credentials can be saved, tested, and deleted while no IPC response returns a secret value.
- [ ] Implement provider-key storage using `keytar`.
- [ ] Expose only `hasCredential`, `saveCredential`, `testCredential`, and `deleteCredential`.
- [ ] Redact key-shaped strings from service errors and logs.
- [ ] Build provider credential UI with plain-language privacy and billing notices.

### Task 8: Implement Gemini, OpenAI, And Claude Vision Adapters

**Files:**
- Create: `electron/taggers/ai-prompt.ts`
- Create: `electron/taggers/gemini.ts`
- Create: `electron/taggers/openai.ts`
- Create: `electron/taggers/claude.ts`
- Test: `tests/ai-prompt.test.ts`
- Test: `tests/ai-adapters.test.ts`

- [ ] Write failing tests for request construction, JSON response parsing, provider errors, rate limits, malformed output, and tag normalization.
- [ ] Define one training-type-aware prompt requiring JSON tags and no prose.
- [ ] Implement each provider with its official image input and structured output format.
- [ ] Fetch keys only inside the main process and keep raw provider responses in project state.
- [ ] Verify each adapter produces the common `TagResult` contract and a rate limit pauses rather than loses the batch.

### Task 9: Build Engine Selection And Readiness UX

**Files:**
- Create: `src/components/EngineSetupCard.tsx`
- Create: `src/components/EnginePicker.tsx`
- Modify: `src/App.tsx`
- Modify: `src/style.css`
- Test: `tests/engine-picker.test.tsx`

- [ ] Write failing UI tests for the confirmed light first-use recommendation, active engine indicator, unavailable local model, missing AI credential, and switching engines.
- [ ] Implement the light recommendation card without blocking workspace entry.
- [ ] Keep the active engine and readiness visible beside the generate action.
- [ ] Add explicit confirmation before the first AI batch states provider and image count.
- [ ] Verify no local and AI result merging exists in the first release.

### Task 10: Implement Dataset Export And Processing Report

**Files:**
- Create: `electron/services/exporter.ts`
- Modify: `src/App.tsx`
- Test: `tests/exporter.test.ts`

- [ ] Write failing tests for processed JPGs, same-base-name TXT captions, settings, processing report, and secret/path absence.
- [ ] Implement directory and ZIP export from the main process.
- [ ] Include preprocessing mode, dimensions, provider, model ID, and per-image result in `processing-report.json`.
- [ ] Ensure captions serialize as comma-and-space separated normalized Danbooru tags.
- [ ] Verify exports contain no API keys or unrestricted original paths.

### Task 11: Package, Document, And Release On GitHub

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `README.md`
- Modify: `.gitignore`
- Modify: `package.json`
- Create: `docs/privacy.md`
- Create: `docs/model-licenses.md`

- [ ] Configure electron-builder for a Windows installer and application data directories.
- [ ] Add a tagged-release GitHub Actions workflow that builds and uploads installer artifacts.
- [ ] Replace personal machine paths and Vite middleware dependencies with desktop services.
- [ ] Document installation, preprocessing modes, local model download, AI costs/privacy, credentials, model licenses, and contributor setup.
- [ ] Run `npm test`, `npm run build`, `npm run dist:win`, install the generated artifact in a clean Windows user profile, and execute the complete acceptance flow.
