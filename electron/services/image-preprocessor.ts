import { mkdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import sharp from 'sharp'
import { calculateOutputGeometry } from '../../src/preprocessing.js'
import type {
  ImagePreparationDto,
  PreprocessSettings,
} from '../../src/types/preprocessing.js'
import type { TextRemovalResult } from '../../src/types/text-removal.js'

const defaultSettings = {
  targetArea: 1024 * 1024,
  bucketStep: 64,
  minimumSide: 256,
  maximumSide: 2048,
  allowUpscale: false,
  background: { r: 255, g: 255, b: 255 },
} satisfies Required<Omit<PreprocessSettings, 'mode' | 'textRemoval' | 'imageIds'>>

export type PreprocessImageRequest = {
  imageId: string
  sourcePath: string
  workingSourcePath?: string
  textRemovalResult?: TextRemovalResult
  outputDirectory: string
  settings: PreprocessSettings
}

export type PreprocessImageResult = ImagePreparationDto & {
  imageId: string
  outputPath: string
}

export type PreprocessImageFailure = {
  imageId: string
  error: string
}

export async function preprocessImage(request: PreprocessImageRequest): Promise<PreprocessImageResult> {
  const options = { ...defaultSettings, ...request.settings }
  const inputPath = request.workingSourcePath ?? request.sourcePath
  const metadata = await sharp(inputPath).metadata()
  const originalWidth = metadata.autoOrient?.width ?? metadata.width
  const originalHeight = metadata.autoOrient?.height ?? metadata.height
  if (!originalWidth || !originalHeight) throw new Error(`Unable to read image dimensions: ${basename(inputPath)}`)

  const outputDimensions = calculateOutputGeometry(originalWidth, originalHeight, request.settings)
  const outputFilename = `${basename(request.sourcePath, extname(request.sourcePath))}.jpg`
  const outputPath = join(request.outputDirectory, outputFilename)
  await mkdir(request.outputDirectory, { recursive: true })

  const image = sharp(inputPath)
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
    textRemoval: request.textRemovalResult ? {
      imageId: request.textRemovalResult.imageId,
      cleanedFilename: request.textRemovalResult.cleanedFilename,
      regionCount: request.textRemovalResult.regionCount,
      adapterId: request.textRemovalResult.adapterId,
      fallbackReason: request.textRemovalResult.fallbackReason,
      processedAt: request.textRemovalResult.processedAt,
    } : undefined,
    outputPath,
    processedAt: new Date().toISOString(),
  }
}
