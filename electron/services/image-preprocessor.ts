import { mkdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import sharp from 'sharp'
import type {
  ImageDimensions,
  ImagePreparationDto,
  PreprocessSettings,
} from '../../src/types/preprocessing.js'

const defaultSettings = {
  targetArea: 1024 * 1024,
  bucketStep: 64,
  minimumSide: 256,
  maximumSide: 2048,
  allowUpscale: false,
  background: { r: 255, g: 255, b: 255 },
} satisfies Required<Omit<PreprocessSettings, 'mode'>>

export type PreprocessImageRequest = {
  imageId: string
  sourcePath: string
  outputDirectory: string
  settings: PreprocessSettings
}

export type PreprocessImageResult = ImagePreparationDto & {
  imageId: string
  outputPath: string
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value))
}

function align(value: number, step: number, minimum: number, maximum: number) {
  return clamp(Math.round(value / step) * step, minimum, maximum)
}

export function calculateOutputGeometry(
  originalWidth: number,
  originalHeight: number,
  settings: PreprocessSettings,
): ImageDimensions {
  if (settings.mode !== 'preserve-aspect') return { width: 1024, height: 1024 }

  const options = { ...defaultSettings, ...settings }
  let scale = Math.sqrt(options.targetArea / (originalWidth * originalHeight))
  if (!options.allowUpscale) scale = Math.min(scale, 1)
  scale = Math.min(scale, options.maximumSide / Math.max(originalWidth, originalHeight))

  return {
    width: align(originalWidth * scale, options.bucketStep, options.minimumSide, options.maximumSide),
    height: align(originalHeight * scale, options.bucketStep, options.minimumSide, options.maximumSide),
  }
}

export async function preprocessImage(request: PreprocessImageRequest): Promise<PreprocessImageResult> {
  const options = { ...defaultSettings, ...request.settings }
  const metadata = await sharp(request.sourcePath).metadata()
  const originalWidth = metadata.autoOrient?.width ?? metadata.width
  const originalHeight = metadata.autoOrient?.height ?? metadata.height
  if (!originalWidth || !originalHeight) throw new Error(`Unable to read image dimensions: ${basename(request.sourcePath)}`)

  const outputDimensions = calculateOutputGeometry(originalWidth, originalHeight, request.settings)
  const outputFilename = `${basename(request.sourcePath, extname(request.sourcePath))}.jpg`
  const outputPath = join(request.outputDirectory, outputFilename)
  await mkdir(request.outputDirectory, { recursive: true })

  const image = sharp(request.sourcePath)
    .rotate()
    .flatten({ background: options.background })
    .toColourspace('srgb')

  if (request.settings.mode === 'white-padding') {
    image.resize(1024, 1024, {
      fit: 'contain',
      background: options.background,
      kernel: sharp.kernel.lanczos3,
    })
  } else if (request.settings.mode === 'center-crop') {
    image.resize(1024, 1024, {
      fit: 'cover',
      position: 'centre',
      kernel: sharp.kernel.lanczos3,
    })
  } else {
    image.resize(outputDimensions.width, outputDimensions.height, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
    })
  }

  await image.jpeg({ quality: 95 }).toFile(outputPath)

  return {
    imageId: request.imageId,
    mode: request.settings.mode,
    originalDimensions: { width: originalWidth, height: originalHeight },
    outputDimensions,
    outputFilename,
    outputPath,
    processedAt: new Date().toISOString(),
  }
}
