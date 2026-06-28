import sharp from 'sharp'
import type { TextRegion } from '../../src/types/text-removal.js'

type DetectTextRegionsRequest = {
  imageId: string
  sourcePath: string
}

type PixelBuffer = {
  data: Buffer
  width: number
  height: number
}

type Component = {
  minX: number
  minY: number
  maxX: number
  maxY: number
  area: number
}

export async function detectTextRegionsInImage(request: DetectTextRegionsRequest): Promise<TextRegion[]> {
  const { data, info } = await sharp(request.sourcePath)
    .rotate()
    .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  const pixelBuffer: PixelBuffer = { data, width: info.width, height: info.height }
  const candidateMask = buildCandidateMask(pixelBuffer)
  const expandedMask = dilateMask(candidateMask, info.width, info.height, 3)
  const components = findComponents(expandedMask, info.width, info.height)
  const cornerWatermarks = detectCornerWatermarks(candidateMask, info.width, info.height, request.imageId)
  const componentRegions = components
    .map((component, index) => componentToRegion(request.imageId, component, info.width, info.height, index))
    .filter((region): region is TextRegion => Boolean(region))
  const legacyTopLeftRegions = keepClosestTopLeftRegion(componentRegions.filter(isLegacyTopLeftComponent))
  return [
    ...cornerWatermarks,
    ...legacyTopLeftRegions.filter((region) => (
      !cornerWatermarks.some((watermark) => boxesOverlap(region.box, watermark.box) || isSameCornerRegion(region, watermark))
    )),
  ].slice(0, 12)
}

function buildCandidateMask({ data, width, height }: PixelBuffer): Uint8Array {
  const mask = new Uint8Array(width * height)
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      if (!isEdgeSearchArea(x, y, width, height)) continue
      if (isCameraFrameEdge(x, y, width, height)) continue
      const brightness = getBrightness(data, width, x, y)
      const neighborContrast = Math.max(
        Math.abs(brightness - getBrightness(data, width, x - 1, y)),
        Math.abs(brightness - getBrightness(data, width, x + 1, y)),
        Math.abs(brightness - getBrightness(data, width, x, y - 1)),
        Math.abs(brightness - getBrightness(data, width, x, y + 1)),
      )
      const looksLikeDarkInk = brightness < 115 && neighborContrast > 18
      const looksLikeLightInk = brightness > 235 && neighborContrast > 22
      if (looksLikeDarkInk || looksLikeLightInk) mask[y * width + x] = 1
    }
  }
  return mask
}

function detectCornerWatermarks(mask: Uint8Array, width: number, height: number, imageId: string): TextRegion[] {
  const corners = [
    { id: 'top-left', minX: 0.025, maxX: 0.25, minY: 0.025, maxY: 0.2, allowFrameEdge: true },
    { id: 'top-right', minX: 0.75, maxX: 0.975, minY: 0.025, maxY: 0.2 },
    { id: 'bottom-right', minX: 0.75, maxX: 0.975, minY: 0.8, maxY: 0.975 },
  ]
  return corners
    .map((corner) => detectCornerWatermark(mask, width, height, imageId, corner))
    .filter((region): region is TextRegion => Boolean(region))
}

function detectCornerWatermark(
  mask: Uint8Array,
  width: number,
  height: number,
  imageId: string,
  corner: { id: string; minX: number; maxX: number; minY: number; maxY: number; allowFrameEdge?: boolean },
): TextRegion | null {
  let minX = width
  let minY = height
  let foundMaxX = 0
  let foundMaxY = 0
  let area = 0

  for (let y = Math.floor(height * corner.minY); y < Math.floor(height * corner.maxY); y += 1) {
    for (let x = Math.floor(width * corner.minX); x < Math.floor(width * corner.maxX); x += 1) {
      if (!mask[y * width + x]) continue
      area += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      foundMaxX = Math.max(foundMaxX, x)
      foundMaxY = Math.max(foundMaxY, y)
    }
  }

  if (area < 35 || minX === width) return null
  const padding = 5
  const x = Math.max(0, minX - padding)
  const y = Math.max(0, minY - padding)
  const boxWidth = Math.min(width, foundMaxX + padding) - x
  const boxHeight = Math.min(height, foundMaxY + padding) - y
  const box = {
    x: x / width,
    y: y / height,
    width: boxWidth / width,
    height: boxHeight / height,
  }
  const density = area / Math.max(1, boxWidth * boxHeight)
  if (box.width < 0.06 || box.height < 0.04 || box.width > 0.3 || box.height > 0.23 || density < 0.13) return null
  if (!corner.allowFrameEdge && hasCameraFrameEdge(mask, width, height, corner)) return null
  return {
    id: `${imageId}-auto-${corner.id}`,
    box,
    confidence: Math.min(0.95, Math.max(0.6, area / (width * height * 0.006))),
  }
}

function hasCameraFrameEdge(
  mask: Uint8Array,
  width: number,
  height: number,
  corner: { minX: number; maxX: number; minY: number; maxY: number },
) {
  const xStart = Math.floor(width * corner.minX)
  const xEnd = Math.floor(width * corner.maxX)
  const yStart = Math.floor(height * corner.minY)
  const yEnd = Math.floor(height * corner.maxY)
  const topLine = countMasked(mask, width, xStart, xEnd, yStart, Math.min(yEnd, yStart + 3))
  const bottomLine = countMasked(mask, width, xStart, xEnd, Math.max(yStart, yEnd - 3), yEnd)
  const leftLine = countMasked(mask, width, xStart, Math.min(xEnd, xStart + 3), yStart, yEnd)
  const rightLine = countMasked(mask, width, Math.max(xStart, xEnd - 3), xEnd, yStart, yEnd)
  const horizontalThreshold = (xEnd - xStart) * 1.3
  const verticalThreshold = (yEnd - yStart) * 1.3
  return topLine > horizontalThreshold || bottomLine > horizontalThreshold || leftLine > verticalThreshold || rightLine > verticalThreshold
}

function countMasked(mask: Uint8Array, width: number, xStart: number, xEnd: number, yStart: number, yEnd: number) {
  let count = 0
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) {
      if (mask[y * width + x]) count += 1
    }
  }
  return count
}

function boxesOverlap(a?: { x: number; y: number; width: number; height: number }, b?: { x: number; y: number; width: number; height: number }) {
  if (!a || !b) return false
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function isLegacyTopLeftComponent(region: TextRegion) {
  const box = region.box
  if (!box) return false
  return box.x < 0.34 && box.y < 0.3
}

function keepClosestTopLeftRegion(regions: TextRegion[]) {
  if (regions.length <= 1) return regions
  return [...regions]
    .sort((a, b) => topLeftDistance(a) - topLeftDistance(b))
    .slice(0, 1)
}

function topLeftDistance(region: TextRegion) {
  const box = region.box
  if (!box) return Number.POSITIVE_INFINITY
  return box.x + box.y + (box.width * box.height * 0.2)
}

function isSameCornerRegion(region: TextRegion, watermark: TextRegion) {
  const regionBox = region.box
  const watermarkBox = watermark.box
  if (!regionBox || !watermarkBox) return false
  const regionCenterX = regionBox.x + regionBox.width / 2
  const regionCenterY = regionBox.y + regionBox.height / 2
  const watermarkCenterX = watermarkBox.x + watermarkBox.width / 2
  const watermarkCenterY = watermarkBox.y + watermarkBox.height / 2
  return (
    regionCenterX < 0.34
    && regionCenterY < 0.3
    && watermarkCenterX < 0.34
    && watermarkCenterY < 0.3
  )
}

function isCameraFrameEdge(x: number, y: number, width: number, height: number) {
  return x < width * 0.025 || y < height * 0.025 || x > width * 0.975 || y > height * 0.975
}

function isEdgeSearchArea(x: number, y: number, width: number, height: number) {
  const left = x < width * 0.32
  const right = x > width * 0.68
  const top = y < height * 0.24
  const bottom = y > height * 0.78
  const nearVerticalEdge = x < width * 0.08 || x > width * 0.92
  const nearHorizontalEdge = y < height * 0.12 || y > height * 0.88
  return top || bottom || (nearVerticalEdge && nearHorizontalEdge) || ((left || right) && (top || bottom))
}

function getBrightness(data: Buffer, width: number, x: number, y: number) {
  const offset = (y * width + x) * 3
  return (data[offset] * 0.299) + (data[offset + 1] * 0.587) + (data[offset + 2] * 0.114)
}

function dilateMask(mask: Uint8Array, width: number, height: number, radius: number) {
  const expanded = new Uint8Array(mask.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!mask[y * width + x]) continue
      const minX = Math.max(0, x - radius)
      const maxX = Math.min(width - 1, x + radius)
      const minY = Math.max(0, y - radius)
      const maxY = Math.min(height - 1, y + radius)
      for (let yy = minY; yy <= maxY; yy += 1) {
        for (let xx = minX; xx <= maxX; xx += 1) expanded[yy * width + xx] = 1
      }
    }
  }
  return expanded
}

function findComponents(mask: Uint8Array, width: number, height: number) {
  const visited = new Uint8Array(mask.length)
  const components: Component[] = []
  const queue: number[] = []

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || visited[index]) continue
    visited[index] = 1
    queue.length = 0
    queue.push(index)
    const component: Component = {
      minX: index % width,
      minY: Math.floor(index / width),
      maxX: index % width,
      maxY: Math.floor(index / width),
      area: 0,
    }

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor]
      const x = current % width
      const y = Math.floor(current / width)
      component.area += 1
      component.minX = Math.min(component.minX, x)
      component.minY = Math.min(component.minY, y)
      component.maxX = Math.max(component.maxX, x)
      component.maxY = Math.max(component.maxY, y)
      for (const next of [current - 1, current + 1, current - width, current + width]) {
        if (next < 0 || next >= mask.length || visited[next] || !mask[next]) continue
        const nextX = next % width
        if (Math.abs(nextX - x) > 1) continue
        visited[next] = 1
        queue.push(next)
      }
    }

    components.push(component)
  }

  return components
    .filter((component) => {
      const boxWidth = component.maxX - component.minX + 1
      const boxHeight = component.maxY - component.minY + 1
      return component.area >= 45 && boxWidth >= 12 && boxHeight >= 10 && boxWidth * boxHeight < width * height * 0.18
    })
    .sort((a, b) => b.area - a.area)
}

function componentToRegion(imageId: string, component: Component, width: number, height: number, index: number): TextRegion | null {
  const padding = 4
  const x = Math.max(0, component.minX - padding)
  const y = Math.max(0, component.minY - padding)
  const boxWidth = Math.min(width, component.maxX + padding) - x
  const boxHeight = Math.min(height, component.maxY + padding) - y
  if (boxWidth <= 0 || boxHeight <= 0) return null
  const normalizedBox = {
    x: x / width,
    y: y / height,
    width: boxWidth / width,
    height: boxHeight / height,
  }
  if (!looksLikeWatermarkBox(normalizedBox)) return null
  if (looksLikeCameraChromeBox(normalizedBox)) return null

  return {
    id: `${imageId}-auto-${index}`,
    box: normalizedBox,
    confidence: Math.min(0.95, Math.max(0.55, component.area / (width * height * 0.015))),
  }
}

function looksLikeWatermarkBox(box: { x: number; y: number; width: number; height: number }) {
  const area = box.width * box.height
  const isTooLargeForTextMark = box.width > 0.34 || box.height > 0.22 || area > 0.055
  if (isTooLargeForTextMark) return false

  const inTopBand = box.y < 0.28
  const inBottomBand = box.y + box.height > 0.82
  const touchesLeftCorner = box.x < 0.18
  const touchesRightCorner = box.x + box.width > 0.82
  if (inTopBand) return touchesLeftCorner || touchesRightCorner
  if (inBottomBand) return (touchesLeftCorner || touchesRightCorner) && box.width < 0.24 && box.height < 0.16
  return false
}

function looksLikeCameraChromeBox(box: { x: number; y: number; width: number; height: number }) {
  const inTopLeft = box.x < 0.18 && box.y < 0.08
  const compactOverlayIcon = box.width < 0.18 && box.height < 0.1
  return inTopLeft && compactOverlayIcon
}
