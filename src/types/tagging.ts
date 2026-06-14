export type TaggerProviderId = 'local-wd14' | 'gemini' | 'openai' | 'claude'
export type TrainingType = 'character' | 'style' | 'concept'
export type BatchItemStatus = 'queued' | 'tagging' | 'ready' | 'failed'

export type BatchProgressEvent = {
  imageId: string
  status: BatchItemStatus
  completed: number
  total: number
  error?: string
}
