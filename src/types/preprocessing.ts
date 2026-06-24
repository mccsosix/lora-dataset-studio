import type { TextRemovalResult, TextRemovalSettings } from './text-removal.js'

export type PreprocessMode = 'preserve-aspect' | 'white-padding' | 'center-crop'

export type PreprocessSettings = {
  mode: PreprocessMode
  imageIds?: string[]
  textRemoval?: TextRemovalSettings
  targetArea?: number
  bucketStep?: number
  minimumSide?: number
  maximumSide?: number
  allowUpscale?: boolean
  background?: { r: number; g: number; b: number }
}

export type ImageDimensions = {
  width: number
  height: number
}

export type ImagePreparationDto = {
  mode: PreprocessMode
  originalDimensions: ImageDimensions
  outputDimensions: ImageDimensions
  outputFilename: string
  textRemoval?: Omit<TextRemovalResult, 'sourcePath' | 'cleanedPath'>
  processedAt: string
}
