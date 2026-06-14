import { calculateOutputGeometry } from './preprocessing'
import type { ImagePreparationDto, PreprocessSettings } from './types/preprocessing'

type BrowserImportFile = {
  name: string
  type: string
}

const imageFilePattern = /\.(jpe?g|png|webp)$/i

export function createBrowserDatasetImages(
  files: Iterable<BrowserImportFile> | ArrayLike<BrowserImportFile>,
  createUrl: (file: BrowserImportFile) => string = (file) => URL.createObjectURL(file as File),
  createId: () => string = () => crypto.randomUUID(),
) {
  return Array.from(files).flatMap((file) => {
    if (!file.type.startsWith('image/') && !imageFilePattern.test(file.name)) return []
    const sourceUrl = createUrl(file)
    return [{
      id: createId(),
      name: file.name,
      url: sourceUrl,
      sourceUrl,
      tags: [],
      originalTags: [],
      selected: false,
      status: 'queued' as const,
    }]
  })
}

type BrowserImage = {
  id: string
  name: string
  url: string
  sourceUrl?: string
  status?: string
  preparation?: ImagePreparationDto
}

type BrowserProcessRequest = {
  imageId: string
  name: string
  sourceUrl: string
  settings: PreprocessSettings
}

type BrowserProcessResult = {
  imageId: string
  previewUrl: string
  preparation: ImagePreparationDto
}

type BrowserImageProcessor = (request: BrowserProcessRequest) => Promise<BrowserProcessResult>

export async function prepareBrowserProjectImages<T extends BrowserImage>(
  images: T[],
  settings: PreprocessSettings,
  processor: BrowserImageProcessor = processBrowserImage,
  onProgress?: (images: T[]) => void,
): Promise<T[]> {
  const results = new Map<string, BrowserProcessResult>()

  for (const image of images) {
    if (!image.sourceUrl) throw new Error(`${image.name} 没有可处理的原始图片`)
    results.set(image.id, await processor({
      imageId: image.id,
      name: image.name,
      sourceUrl: image.sourceUrl,
      settings,
    }))
    onProgress?.(applyBrowserProcessResults(images, results))
  }

  return applyBrowserProcessResults(images, results)
}

function applyBrowserProcessResults<T extends BrowserImage>(
  images: T[],
  results: Map<string, BrowserProcessResult>,
): T[] {
  return images.map((image) => {
    const result = results.get(image.id)
    if (!result) return image
    return {
      ...image,
      url: result.previewUrl,
      status: 'prepared',
      preparation: result.preparation,
    }
  })
}

export async function processBrowserImage(request: BrowserProcessRequest): Promise<BrowserProcessResult> {
  const response = await fetch(request.sourceUrl)
  if (!response.ok) throw new Error(`无法读取 ${request.name}`)
  const sourceBlob = await response.blob()
  const bitmap = await createImageBitmap(sourceBlob, { imageOrientation: 'from-image' })
  const originalDimensions = { width: bitmap.width, height: bitmap.height }
  const output = calculateOutputGeometry(originalDimensions.width, originalDimensions.height, request.settings)
  const canvas = document.createElement('canvas')
  canvas.width = output.width
  canvas.height = output.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('浏览器无法创建图片处理画布')
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, output.width, output.height)

  if (request.settings.mode === 'white-padding') {
    const scale = Math.min(output.width / bitmap.width, output.height / bitmap.height)
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    context.drawImage(bitmap, Math.floor((output.width - width) / 2), Math.floor((output.height - height) / 2), width, height)
  } else if (request.settings.mode === 'center-crop') {
    const scale = Math.max(output.width / bitmap.width, output.height / bitmap.height)
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    context.drawImage(bitmap, Math.floor((output.width - width) / 2), Math.floor((output.height - height) / 2), width, height)
  } else {
    context.drawImage(bitmap, 0, 0, output.width, output.height)
  }
  bitmap.close()

  const outputBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(`无法处理 ${request.name}`)), 'image/jpeg', 0.95)
  })

  return {
    imageId: request.imageId,
    previewUrl: URL.createObjectURL(outputBlob),
    preparation: {
      mode: request.settings.mode,
      originalDimensions,
      outputDimensions: output,
      outputFilename: request.name.replace(/\.[^.]+$/, '.jpg'),
      processedAt: new Date().toISOString(),
    },
  }
}
