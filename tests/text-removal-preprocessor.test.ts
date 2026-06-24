import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { createManualRegionMask, TextRemovalPreprocessor } from '../electron/services/text-removal-preprocessor'
import { AutoInpainter, createInpainterSpawnOptions, getTextRemovalEngineStatus, IopaintInpainter, resolveIopaintCommand, type CommandRunner, type ImageInpainter } from '../electron/services/image-inpainter'

describe('createManualRegionMask', () => {
  it('creates a source-sized mask from normalized manual rectangles', async () => {
    const mask = await createManualRegionMask({
      width: 100,
      height: 50,
      regions: [
        { id: 'subtitle', box: { x: 0.1, y: 0.6, width: 0.5, height: 0.2 } },
      ],
      padding: 2,
    })

    const { data, info } = await sharp(mask).raw().toBuffer({ resolveWithObject: true })
    const inside = data[((32 * info.width) + 12) * info.channels]
    const outside = data[((8 * info.width) + 8) * info.channels]

    expect(inside).toBe(255)
    expect(outside).toBe(0)
  })

  it('keeps multiple separated manual rectangles in the same mask', async () => {
    const mask = await createManualRegionMask({
      width: 100,
      height: 80,
      regions: [
        { id: 'left', box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } },
        { id: 'right', box: { x: 0.7, y: 0.5, width: 0.2, height: 0.2 } },
      ],
      padding: 0,
    })

    const { data, info } = await sharp(mask).greyscale().raw().toBuffer({ resolveWithObject: true })
    const left = data[(12 * info.width) + 12]
    const right = data[(44 * info.width) + 72]
    const middle = data[(35 * info.width) + 50]

    expect(left).toBe(255)
    expect(right).toBe(255)
    expect(middle).toBe(0)
  })
})

describe('TextRemovalPreprocessor', () => {
  it('writes a cleaned intermediate without changing the source image', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lora-text-removal-'))
    const sourcePath = join(root, 'poster.png')
    const outputDirectory = join(root, 'cleaned')
    await sharp({
      create: {
        width: 120,
        height: 80,
        channels: 3,
        background: { r: 20, g: 40, b: 60 },
      },
    }).png().toFile(sourcePath)
    const before = await readFile(sourcePath)

    const inpainter: ImageInpainter = {
      id: 'fake-local',
      async inpaint(request) {
        await sharp(request.sourcePath).jpeg().toFile(request.outputPath)
        return {
          outputPath: request.outputPath,
          adapterId: 'fake-local',
          processedAt: '2026-06-19T00:00:00.000Z',
        }
      },
    }
    const preprocessor = new TextRemovalPreprocessor(inpainter)
    const result = await preprocessor.removeManualRegions({
      imageId: 'image-1',
      sourcePath,
      outputDirectory,
      settings: {
        mode: 'manual',
        maskPadding: 4,
        manualRegions: [{ id: 'mark', box: { x: 0.2, y: 0.2, width: 0.3, height: 0.2 } }],
      },
    })

    expect(await readFile(sourcePath)).toEqual(before)
    expect(result.cleanedPath).not.toBe(sourcePath)
    expect(result.cleanedFilename).toBe('poster.cleaned.jpg')
    await expect(stat(result.cleanedPath)).resolves.toMatchObject({ size: expect.any(Number) })
  })

  it('uses a fresh cleaned filename when a previous cleaned image already exists', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lora-text-removal-existing-'))
    const sourcePath = join(root, 'poster.png')
    const outputDirectory = join(root, 'cleaned')
    await mkdir(outputDirectory, { recursive: true })
    await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: '#445566',
      },
    }).png().toFile(sourcePath)
    await writeFile(join(outputDirectory, 'poster.cleaned.jpg'), 'already open elsewhere')

    const inpainter: ImageInpainter = {
      id: 'fake-local',
      async inpaint(request) {
        await sharp(request.sourcePath).jpeg().toFile(request.outputPath)
        return {
          outputPath: request.outputPath,
          adapterId: 'fake-local',
          processedAt: '2026-06-19T00:00:00.000Z',
        }
      },
    }

    const result = await new TextRemovalPreprocessor(inpainter).removeManualRegions({
      imageId: 'image-1',
      sourcePath,
      outputDirectory,
      settings: {
        mode: 'manual',
        manualRegions: [{ id: 'mark', box: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 } }],
      },
    })

    expect(result.cleanedFilename).toBe('poster.cleaned.1.jpg')
    expect(result.cleanedPath).toBe(join(outputDirectory, 'poster.cleaned.1.jpg'))
    await expect(stat(result.cleanedPath)).resolves.toMatchObject({ size: expect.any(Number) })
  })
})

describe('IopaintInpainter', () => {
  it('spawns IOPaint without shell parsing so paths with spaces stay intact', () => {
    expect(createInpainterSpawnOptions({ cwd: 'C:\\Users\\Moc\\AppData\\Roaming\\LoRA Dataset Studio' })).toEqual({
      cwd: 'C:\\Users\\Moc\\AppData\\Roaming\\LoRA Dataset Studio',
      windowsHide: true,
      shell: false,
    })
  })

  it('resolves a project-local IOPaint executable when no environment override is set', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lora-iopaint-command-'))
    const commandPath = join(root, '.venv-text-removal', 'Scripts', 'iopaint.exe')
    await mkdir(join(root, '.venv-text-removal', 'Scripts'), { recursive: true })
    await writeFile(commandPath, '')

    expect(await resolveIopaintCommand(root, undefined)).toBe(commandPath)
  })

  it('reports LaMA as ready when project-local IOPaint is installed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lora-iopaint-status-'))
    const commandPath = join(root, '.venv-text-removal', 'Scripts', 'iopaint.exe')
    await mkdir(join(root, '.venv-text-removal', 'Scripts'), { recursive: true })
    await writeFile(commandPath, '')

    await expect(getTextRemovalEngineStatus(root, undefined)).resolves.toMatchObject({
      state: 'ready',
      adapterId: 'iopaint-lama',
      command: commandPath,
    })
  })

  it('calls IOPaint LaMA with image, mask, and output paths', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lora-iopaint-'))
    const sourcePath = join(root, 'source.png')
    const outputPath = join(root, 'output.jpg')
    await sharp({ create: { width: 16, height: 16, channels: 3, background: '#dddddd' } }).png().toFile(sourcePath)
    const calls: Array<{ command: string; args: string[] }> = []
    const runner: CommandRunner = async (command, args) => {
      calls.push({ command, args })
      const outputDirectory = args[args.indexOf('--output') + 1]
      await sharp(sourcePath).png().toFile(join(outputDirectory, basename(sourcePath)))
      return { stdout: '', stderr: '' }
    }

    const inpainter = new IopaintInpainter({ runner, command: 'iopaint-test' })
    const result = await inpainter.inpaint({
      sourcePath,
      mask: await sharp({ create: { width: 16, height: 16, channels: 3, background: '#ffffff' } }).png().toBuffer(),
      outputPath,
    })

    expect(result.adapterId).toBe('iopaint-lama')
    expect(calls[0].command).toBe('iopaint-test')
    expect(calls[0].args).toEqual(expect.arrayContaining([
      'run',
      '--model=lama',
      '--device=cpu',
      '--image',
      sourcePath,
    ]))
    expect(calls[0].args[calls[0].args.indexOf('--output') + 1]).not.toBe(outputPath)
    expect(calls[0].args).toContain('--mask')
  })

  it('falls back to the older --input argument when installed IOPaint does not support --image', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lora-iopaint-input-'))
    const sourcePath = join(root, 'source.png')
    const outputPath = join(root, 'output.jpg')
    await sharp({ create: { width: 16, height: 16, channels: 3, background: '#dddddd' } }).png().toFile(sourcePath)
    const calls: string[][] = []
    const runner: CommandRunner = async (_command, args) => {
      calls.push(args)
      if (args.includes('--image')) {
        throw new Error('unrecognized arguments: --image')
      }
      const outputDirectory = args[args.indexOf('--output') + 1]
      await sharp(sourcePath).png().toFile(join(outputDirectory, basename(sourcePath)))
      return { stdout: '', stderr: '' }
    }

    const inpainter = new IopaintInpainter({ runner })
    await inpainter.inpaint({
      sourcePath,
      mask: await sharp({ create: { width: 16, height: 16, channels: 3, background: '#ffffff' } }).png().toBuffer(),
      outputPath,
    })

    expect(calls).toHaveLength(2)
    expect(calls[1]).toEqual(expect.arrayContaining(['--input', sourcePath]))
  })

  it('AutoInpainter reports IOPaint failures instead of silently blurring by default', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lora-iopaint-no-fallback-'))
    const sourcePath = join(root, 'source.png')
    const outputPath = join(root, 'output.jpg')
    await sharp({ create: { width: 16, height: 16, channels: 3, background: '#dddddd' } }).png().toFile(sourcePath)
    const unavailable: ImageInpainter = {
      id: 'iopaint-lama',
      async inpaint() {
        throw new Error('iopaint is not installed')
      },
    }
    const fallback: ImageInpainter = {
      id: 'test-fallback',
      async inpaint(request) {
        await sharp(request.sourcePath).jpeg().toFile(request.outputPath)
        return { outputPath: request.outputPath, adapterId: 'test-fallback', processedAt: '2026-06-20T00:00:00.000Z' }
      },
    }

    await expect(new AutoInpainter(unavailable, fallback).inpaint({
      sourcePath,
      mask: await sharp({ create: { width: 16, height: 16, channels: 3, background: '#ffffff' } }).png().toBuffer(),
      outputPath,
    })).rejects.toThrow('LaMA 去水印没有成功启动：iopaint is not installed')
  })

  it('AutoInpainter uses the fallback adapter only when low-quality fallback is allowed', async () => {
    const root = await mkdtemp(join(tmpdir(), 'lora-iopaint-fallback-'))
    const sourcePath = join(root, 'source.png')
    const outputPath = join(root, 'output.jpg')
    await sharp({ create: { width: 16, height: 16, channels: 3, background: '#dddddd' } }).png().toFile(sourcePath)
    const unavailable: ImageInpainter = {
      id: 'iopaint-lama',
      async inpaint() {
        throw new Error('iopaint is not installed')
      },
    }
    const fallback: ImageInpainter = {
      id: 'test-fallback',
      async inpaint(request) {
        await sharp(request.sourcePath).jpeg().toFile(request.outputPath)
        return { outputPath: request.outputPath, adapterId: 'test-fallback', processedAt: '2026-06-20T00:00:00.000Z' }
      },
    }

    const result = await new AutoInpainter(unavailable, fallback, { allowFallback: true }).inpaint({
      sourcePath,
      mask: await sharp({ create: { width: 16, height: 16, channels: 3, background: '#ffffff' } }).png().toBuffer(),
      outputPath,
    })

    expect(result.adapterId).toBe('test-fallback')
    expect(result.fallbackReason).toContain('iopaint is not installed')
  })
})
