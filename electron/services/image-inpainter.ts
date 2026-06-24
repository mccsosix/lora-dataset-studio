import { access, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join, basename } from 'node:path'
import { spawn } from 'node:child_process'
import sharp from 'sharp'
import type { TextRemovalEngineStatus } from '../../src/types/text-removal.js'

export type InpaintImageRequest = {
  sourcePath: string
  mask: Buffer
  outputPath: string
}

export type InpaintImageResult = {
  outputPath: string
  adapterId: string
  processedAt: string
  fallbackReason?: string
}

export interface ImageInpainter {
  id: string
  inpaint(request: InpaintImageRequest): Promise<InpaintImageResult>
}

async function pathExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function resolveIopaintCommand(projectRoot = process.cwd(), override = process.env.LORA_IOPAINT_COMMAND) {
  if (override) return override
  const localCommand = process.platform === 'win32'
    ? join(projectRoot, '.venv-text-removal', 'Scripts', 'iopaint.exe')
    : join(projectRoot, '.venv-text-removal', 'bin', 'iopaint')
  return await pathExists(localCommand) ? localCommand : 'iopaint'
}

export async function getTextRemovalEngineStatus(
  projectRoot = process.cwd(),
  override = process.env.LORA_IOPAINT_COMMAND,
): Promise<TextRemovalEngineStatus> {
  const command = await resolveIopaintCommand(projectRoot, override)
  if (command !== 'iopaint' || override) {
    return {
      state: 'ready',
      adapterId: 'iopaint-lama',
      label: 'LaMA 修复可用',
      detail: override ? '使用自定义 IOPaint 命令。' : '已找到项目本地 IOPaint 环境。',
      command,
    }
  }
  return {
    state: 'fallback',
    adapterId: 'local-sharp-inpaint',
    label: '快速修复',
    detail: '未找到 IOPaint，将使用低质量快速修复。',
    command,
  }
}

export type CommandRunner = (
  command: string,
  args: string[],
  options?: { cwd?: string }
) => Promise<{ stdout: string; stderr: string }>

export function createInpainterSpawnOptions(options?: { cwd?: string }) {
  return {
    cwd: options?.cwd,
    windowsHide: true,
    shell: false,
  } as const
}

const defaultCommandRunner: CommandRunner = (command, args, options) => new Promise((resolve, reject) => {
  const child = spawn(command, args, createInpainterSpawnOptions(options))
  const stdout: Buffer[] = []
  const stderr: Buffer[] = []
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)))
  child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)))
  child.on('error', reject)
  child.on('close', (code) => {
    const out = Buffer.concat(stdout).toString('utf8')
    const err = Buffer.concat(stderr).toString('utf8')
    if (code === 0) {
      resolve({ stdout: out, stderr: err })
      return
    }
    reject(new Error(err.trim() || out.trim() || `${command} exited with code ${code}`))
  })
})

export class IopaintInpainter implements ImageInpainter {
  readonly id = 'iopaint-lama'
  private readonly command?: string
  private readonly model: string
  private readonly device: string
  private readonly runner: CommandRunner

  constructor(options: {
    command?: string
    model?: string
    device?: string
    runner?: CommandRunner
  } = {}) {
    this.command = options.command ?? process.env.LORA_IOPAINT_COMMAND
    this.model = options.model ?? process.env.LORA_IOPAINT_MODEL ?? 'lama'
    this.device = options.device ?? process.env.LORA_IOPAINT_DEVICE ?? 'cpu'
    this.runner = options.runner ?? defaultCommandRunner
  }

  async inpaint(request: InpaintImageRequest): Promise<InpaintImageResult> {
    const command = await resolveIopaintCommand(process.cwd(), this.command)
    await mkdir(dirname(request.outputPath), { recursive: true })
    const iopaintOutputDirectory = join(
      dirname(request.outputPath),
      `${basename(request.outputPath, extname(request.outputPath))}.iopaint-output`,
    )
    await mkdir(iopaintOutputDirectory, { recursive: true })
    const maskPath = join(
      dirname(request.outputPath),
      `${basename(request.outputPath, extname(request.outputPath))}.mask.png`,
    )
    await writeFile(maskPath, request.mask)

    const commonArgs = [
      'run',
      `--model=${this.model}`,
      `--device=${this.device}`,
      '--mask',
      maskPath,
      '--output',
      iopaintOutputDirectory,
    ]
    try {
      await this.runner(command, [...commonArgs, '--image', request.sourcePath], { cwd: dirname(request.outputPath) })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('--image') && !message.includes('unrecognized')) throw error
      await this.runner(command, [...commonArgs, '--input', request.sourcePath], { cwd: dirname(request.outputPath) })
    }

    await this.copyIopaintOutput(iopaintOutputDirectory, request)
    return {
      outputPath: request.outputPath,
      adapterId: this.id,
      processedAt: new Date().toISOString(),
    }
  }

  private async copyIopaintOutput(outputDirectory: string, request: InpaintImageRequest) {
    const expectedName = basename(request.sourcePath)
    const files = await readdir(outputDirectory)
    const outputName = files.includes(expectedName) ? expectedName : files.find((name) => /\.(png|jpe?g|webp)$/i.test(name))
    if (!outputName) throw new Error('IOPaint did not produce an output image.')
    const generatedPath = join(outputDirectory, outputName)
    await sharp(generatedPath)
      .rotate()
      .toColourspace('srgb')
      .jpeg({ quality: 95 })
      .toFile(request.outputPath)
    await stat(request.outputPath)
  }
}

export class AutoInpainter implements ImageInpainter {
  readonly id = 'auto-inpaint'

  constructor(
    private readonly preferred: ImageInpainter = new IopaintInpainter(),
    private readonly fallback: ImageInpainter = new LocalSharpInpainter(),
    private readonly options: { allowFallback?: boolean } = {},
  ) {}

  async inpaint(request: InpaintImageRequest): Promise<InpaintImageResult> {
    try {
      return await this.preferred.inpaint(request)
    } catch (error) {
      if (!this.options.allowFallback) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`LaMA 去水印没有成功启动：${message}`)
      }
      const result = await this.fallback.inpaint(request)
      return {
        ...result,
        fallbackReason: error instanceof Error ? error.message : String(error),
      }
    }
  }
}

export class LocalSharpInpainter implements ImageInpainter {
  readonly id = 'local-sharp-inpaint'

  async inpaint(request: InpaintImageRequest): Promise<InpaintImageResult> {
    const base = sharp(request.sourcePath).rotate().toColourspace('srgb')
    const alpha = await sharp(request.mask)
      .greyscale()
      .raw()
      .toBuffer()
    const metadata = await sharp(request.mask).metadata()
    const blurredRgb = await sharp(request.sourcePath)
      .rotate()
      .toColourspace('srgb')
      .blur(18)
      .removeAlpha()
      .raw()
      .toBuffer()
    const blurred = await sharp(blurredRgb, {
      raw: {
        width: metadata.width ?? 1,
        height: metadata.height ?? 1,
        channels: 3,
      },
    }).joinChannel(alpha, {
      raw: {
        width: metadata.width ?? 1,
        height: metadata.height ?? 1,
        channels: 1,
      },
    }).png().toBuffer()

    await base
      .composite([{ input: blurred, blend: 'over' }])
      .jpeg({ quality: 95 })
      .toFile(request.outputPath)

    return {
      outputPath: request.outputPath,
      adapterId: this.id,
      processedAt: new Date().toISOString(),
    }
  }
}
