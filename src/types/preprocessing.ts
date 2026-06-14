export type PreprocessMode = 'preserve-aspect' | 'white-padding' | 'center-crop'

export type PreprocessSettings = {
  mode: PreprocessMode
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
  processedAt: string
}
