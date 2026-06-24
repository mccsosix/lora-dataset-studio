export type TaggerProviderId = 'local-wd14' | 'gemini' | 'openai' | 'claude'
export type TrainingType = 'character' | 'style' | 'concept'
export type BatchItemStatus = 'queued' | 'tagging' | 'ready' | 'failed'

export type BatchProgressPhase = 'tagging' | 'detect-text' | 'prepare'

export type BatchProgressEvent = {
  imageId: string
  status: BatchItemStatus | 'preparing'
  completed: number
  total: number
  phase?: BatchProgressPhase
  fileName?: string
  error?: string
}
