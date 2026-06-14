import type { DanbooruTag } from '../../src/danbooru.js'
import type { BatchItemStatus, TaggerProviderId, TrainingType } from '../../src/types/tagging.js'

export type TagRequest = {
  images: Array<{ id: string; processedPath: string }>
  trainingType: TrainingType
  threshold: number
}

export type TagResult = {
  imageId: string
  providerId: TaggerProviderId
  tags: DanbooruTag[]
  rawResponse: unknown
  error?: string
}

export type ProviderReadiness = {
  ready: boolean
  reason?: string
}

export type TaggerProgress = {
  imageId: string
  status: BatchItemStatus
}

export type ProgressCallback = (progress: TaggerProgress) => void

export interface TaggerAdapter {
  id: TaggerProviderId
  checkReady(): Promise<ProviderReadiness>
  tag(request: TagRequest, onProgress?: ProgressCallback): Promise<TagResult[]>
}
