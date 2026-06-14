import type { ImagePreparationDto } from './types/preprocessing'

export function countPreparedImages(images: Array<{ preparation?: ImagePreparationDto }>) {
  return images.reduce((count, image) => count + Number(Boolean(image.preparation)), 0)
}
