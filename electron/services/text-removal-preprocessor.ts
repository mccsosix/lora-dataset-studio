import { access, mkdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import sharp from 'sharp'
import type { TextRegion, TextRemovalResult, TextRemovalSettings } from '../../src/types/text-removal.js'
import type { ImageInpainter } from './image-inpainter.js'
import { AutoInpainter } from './image-inpainter.js'

export type ManualMaskRequest = {
  width: number
  height: number
  regions: TextRegion[]
  padding?: number
}

export type TextRemovalPreprocessRequest = {
  imageId: string
  sourcePath: string
  outputDirectory: string
  settings: TextRemovalSettings
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function normalizeRegion(region: TextRegion, width: number, height: number, padding: number) {
  const box = region.box
  if (!box) return null
  const left = Math.floor(clamp(box.x * width, 0, width))
  const top = Math.floor(clamp(box.y * height, 0, height))
  const right = Math.ceil(clamp((box.x + box.width) * width, 0, width))
  const bottom = Math.ceil(clamp((box.y + box.height) * height, 0, height))
  return {
    left: clamp(left - padding, 0, width),
    top: clamp(top - padding, 0, height),
    width: clamp(right - left + (padding * 2), 1, width),
    height: clamp(bottom - top + (padding * 2), 1, height),
  }
}

async function pathExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function createFreshCleanedOutputPath(outputDirectory: string, sourcePath: string) {
  const sourceName = basename(sourcePath, extname(sourcePath))
  for (let index = 0; index < 1000; index += 1) {
    const suffix = index === 0 ? '' : `.${index}`
    const cleanedFilename = `${sourceName}.cleaned${suffix}.jpg`
    const cleanedPath = join(outputDirectory, cleanedFilename)
    if (!(await pathExists(cleanedPath))) return { cleanedFilename, cleanedPath }
  }
  throw new Error(`Unable to allocate cleaned output filename for ${basename(sourcePath)}`)
}

export async function createManualRegionMask(request: ManualMaskRequest): Promise<Buffer> {
  const mask = sharp({
    create: {
      width: request.width,
      height: request.height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })

  const overlays = []
  for (const region of request.regions) {
    const box = normalizeRegion(region, request.width, request.height, request.padding ?? 0)
    if (!box) continue
    const overlay = await sharp({
      create: {
        width: box.width,
        height: box.height,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    }).png().toBuffer()
    overlays.push({ input: overlay, left: box.left, top: box.top })
  }

  return mask.composite(overlays).png().toBuffer()
}

export class TextRemovalPreprocessor {
  constructor(private readonly inpainter: ImageInpainter = new AutoInpainter()) {}

  async removeManualRegions(request: TextRemovalPreprocessRequest): Promise<TextRemovalResult | null> {
    if (request.settings.mode !== 'manual' || !request.settings.manualRegions?.length) return null

    const metadata = await sharp(request.sourcePath).metadata()
    const width = metadata.autoOrient?.width ?? metadata.width
    const height = metadata.autoOrient?.height ?? metadata.height
    if (!width || !height) throw new Error(`Unable to read image dimensions: ${basename(request.sourcePath)}`)

    await mkdir(request.outputDirectory, { recursive: true })
    const { cleanedFilename, cleanedPath } = await createFreshCleanedOutputPath(
      request.outputDirectory,
      request.sourcePath,
    )
    const mask = await createManualRegionMask({
      width,
      height,
      regions: request.settings.manualRegions,
      padding: request.settings.maskPadding ?? 8,
    })
    const result = await this.inpainter.inpaint({
      sourcePath: request.sourcePath,
      mask,
      outputPath: cleanedPath,
    })

    return {
      imageId: request.imageId,
      cleanedPath: result.outputPath,
      cleanedFilename,
      sourcePath: request.sourcePath,
      regionCount: request.settings.manualRegions.length,
      adapterId: result.adapterId,
      fallbackReason: result.fallbackReason,
      processedAt: result.processedAt,
    }
  }
}
