# Text Removal IOPaint Setup

The text-removal workflow now prefers IOPaint / LaMA for natural inpainting.
If IOPaint is unavailable or fails, the app falls back to the lightweight Sharp
blur adapter and records the fallback in image preparation metadata.

## Windows Local Setup

Install IOPaint in a separate Python environment instead of adding it to the
normal npm dependency path:

```powershell
python -m venv .venv-text-removal
.\.venv-text-removal\Scripts\python -m pip install --upgrade pip
.\.venv-text-removal\Scripts\pip install iopaint
```

The app automatically checks the project-local executable first:

- Windows: `.venv-text-removal\Scripts\iopaint.exe`
- macOS/Linux: `.venv-text-removal/bin/iopaint`

Start the desktop app normally:

```powershell
npm run dev:desktop
```

Optional environment variables:

- `LORA_IOPAINT_COMMAND`: executable command or absolute path. When unset, the
  app tries the project-local `.venv-text-removal` executable, then falls back to
  `iopaint` on PATH.
- `LORA_IOPAINT_MODEL`: model name passed to IOPaint. Defaults to `lama`.
- `LORA_IOPAINT_DEVICE`: device passed to IOPaint. Defaults to `cpu`.

## Runtime Behavior

For each manually selected text/watermark region:

1. The app creates a source-sized mask from the selected boxes.
2. `IopaintInpainter` calls:

```powershell
iopaint run --model=lama --device=cpu --mask <mask.png> --output <temp-output-dir> --image <source>
```

3. If the installed CLI uses the older argument name, the adapter retries with
   `--input <source>`.
4. The adapter normalizes IOPaint's generated file into the app's expected
   `.cleaned.jpg` intermediate path.
5. If IOPaint is missing or fails, `AutoInpainter` falls back to the local Sharp
   adapter so the batch can still finish.

Prepared image metadata records the adapter id and fallback reason when fallback
was needed.
