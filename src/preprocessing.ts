import type { ImageDimensions, ImagePreparationDto, PreprocessSettings } from './types/preprocessing.js'

const defaultGeometrySettings = {
  targetArea: 1024 * 1024,
  bucketStep: 64,
  minimumSide: 256,
  maximumSide: 2048,
  allowUpscale: false,
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

  const options = { ...defaultGeometrySettings, ...settings }
  let scale = Math.sqrt(options.targetArea / (originalWidth * originalHeight))
  if (!options.allowUpscale) scale = Math.min(scale, 1)
  scale = Math.min(scale, options.maximumSide / Math.max(originalWidth, originalHeight))

  return {
    width: align(originalWidth * scale, options.bucketStep, options.minimumSide, options.maximumSide),
    height: align(originalHeight * scale, options.bucketStep, options.minimumSide, options.maximumSide),
  }
}

export function countPreparedImages(images: Array<{ preparation?: ImagePreparationDto }>) {
  return images.reduce((count, image) => count + Number(Boolean(image.preparation)), 0)
}
