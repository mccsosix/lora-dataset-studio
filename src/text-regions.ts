import type { TextRegion } from './types/text-removal'

const CLICK_REGION_WIDTH = 0.18
const CLICK_REGION_HEIGHT = 0.12
const MIN_DRAG_REGION_SIZE = 0.01

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const roundRegionUnit = (value: number) => Math.round(value * 10000) / 10000

export function createClickTextRegion(
  _imageId: string,
  x: number,
  y: number,
  id: string,
  width = CLICK_REGION_WIDTH,
  height = CLICK_REGION_HEIGHT,
): TextRegion {
  return {
    id,
    confidence: 1,
    box: {
      x: roundRegionUnit(clamp(x - width / 2, 0, 1 - width)),
      y: roundRegionUnit(clamp(y - height / 2, 0, 1 - height)),
      width,
      height,
    },
  }
}

export function finalizeDraftTextRegion(
  imageId: string,
  draftRegion: TextRegion,
  clickRegionId: string,
): TextRegion | null {
  if (!draftRegion.box) return null
  if (draftRegion.box.width < MIN_DRAG_REGION_SIZE || draftRegion.box.height < MIN_DRAG_REGION_SIZE) {
    return createClickTextRegion(imageId, draftRegion.box.x, draftRegion.box.y, clickRegionId)
  }
  return draftRegion
}

export function pickTextRegionsForImages(
  regionsByImageId: Record<string, TextRegion[]>,
  imageIds: string[],
): Record<string, TextRegion[]> {
  return Object.fromEntries(
    imageIds
      .map((imageId) => [imageId, regionsByImageId[imageId] ?? []] as const)
      .filter(([, regions]) => regions.length > 0),
  )
}

export function countTextRegionsForImages(
  regionsByImageId: Record<string, TextRegion[]>,
  imageIds: string[],
): number {
  return imageIds.reduce((count, imageId) => count + (regionsByImageId[imageId]?.length ?? 0), 0)
}

export function isAutoTextRegion(region: TextRegion): boolean {
  return region.id.includes('-auto-')
}

export function countAutoTextRegionsForImages(
  regionsByImageId: Record<string, TextRegion[]>,
  imageIds: string[],
): number {
  return imageIds.reduce(
    (count, imageId) => count + (regionsByImageId[imageId] ?? []).filter(isAutoTextRegion).length,
    0,
  )
}

export function clearAutoTextRegionsForImages(
  regionsByImageId: Record<string, TextRegion[]>,
  imageIds: string[],
): Record<string, TextRegion[]> {
  const next = { ...regionsByImageId }
  for (const imageId of imageIds) {
    const manualRegions = (next[imageId] ?? []).filter((region) => !isAutoTextRegion(region))
    if (manualRegions.length > 0) {
      next[imageId] = manualRegions
    } else {
      delete next[imageId]
    }
  }
  return next
}

export function cloneTextRegionsForImages(
  sourceRegions: TextRegion[],
  imageIds: string[],
  stamp: string,
): Record<string, TextRegion[]> {
  return Object.fromEntries(
    imageIds.map((imageId) => [
      imageId,
      sourceRegions.map((region, index) => ({
        ...region,
        id: `${imageId}-bulk-${stamp}-${index}`,
        box: region.box ? { ...region.box } : undefined,
        polygon: region.polygon?.map((point) => ({ ...point })),
      })),
    ]),
  )
}
