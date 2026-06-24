export type TextRemovalMode = 'off' | 'auto' | 'manual'

export type Point = {
  x: number
  y: number
}

export type TextRegionBox = {
  x: number
  y: number
  width: number
  height: number
}

export type TextRegion = {
  id: string
  polygon?: Point[]
  box?: TextRegionBox
  confidence?: number
  text?: string
}

export type TextRemovalSettings = {
  mode: TextRemovalMode
  confidenceThreshold?: number
  maskPadding?: number
  manualRegions?: TextRegion[]
  manualRegionsByImageId?: Record<string, TextRegion[]>
}

export type TextRemovalResult = {
  imageId: string
  cleanedPath: string
  cleanedFilename: string
  sourcePath: string
  regionCount: number
  adapterId: string
  fallbackReason?: string
  processedAt: string
}

export type TextRemovalEngineStatus = {
  state: 'ready' | 'fallback'
  adapterId: 'iopaint-lama' | 'local-sharp-inpaint'
  label: string
  detail: string
  command?: string
}
