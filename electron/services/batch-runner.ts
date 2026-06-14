import type { BatchProgressEvent, BatchItemStatus, TaggerProviderId, TrainingType } from '../../src/types/tagging.js'
import type { TagRequest, TagResult, TaggerAdapter } from '../taggers/types.js'

export type BatchItemState = {
  imageId: string
  status: BatchItemStatus
  result?: TagResult
  error?: string
}

export type BatchState = {
  providerId: TaggerProviderId
  trainingType: TrainingType
  threshold: number
  items: Record<string, BatchItemState>
}

export interface BatchStatePersistence {
  loadBatchState(): Promise<BatchState | null>
  saveBatchState(state: BatchState): Promise<void>
}

type BatchProgressCallback = (event: BatchProgressEvent) => void

export class BatchRunner {
  private cancelled = false

  constructor(private readonly persistence: BatchStatePersistence) {}

  cancel() {
    this.cancelled = true
  }

  async start(request: TagRequest, adapter: TaggerAdapter, onProgress?: BatchProgressCallback) {
    const state: BatchState = {
      providerId: adapter.id,
      trainingType: request.trainingType,
      threshold: request.threshold,
      items: Object.fromEntries(request.images.map((image) => [
        image.id,
        { imageId: image.id, status: 'queued' satisfies BatchItemStatus },
      ])),
    }
    await this.persistence.saveBatchState(state)
    return this.execute(request, adapter, state, request.images.map((image) => image.id), onProgress)
  }

  async resume(request: TagRequest, adapter: TaggerAdapter, onProgress?: BatchProgressCallback) {
    const state = await this.persistence.loadBatchState()
    if (!state) return this.start(request, adapter, onProgress)
    const targets = Object.values(state.items)
      .filter((item) => item.status === 'queued' || item.status === 'tagging')
      .map((item) => item.imageId)
    targets.forEach((imageId) => { state.items[imageId].status = 'queued' })
    await this.persistence.saveBatchState(state)
    return this.execute(request, adapter, state, targets, onProgress)
  }

  async retryFailed(request: TagRequest, adapter: TaggerAdapter, onProgress?: BatchProgressCallback) {
    const state = await this.persistence.loadBatchState()
    if (!state) return this.start(request, adapter, onProgress)
    const targets = Object.values(state.items)
      .filter((item) => item.status === 'failed')
      .map((item) => item.imageId)
    targets.forEach((imageId) => {
      state.items[imageId] = { imageId, status: 'queued' }
    })
    await this.persistence.saveBatchState(state)
    return this.execute(request, adapter, state, targets, onProgress)
  }

  private async execute(
    request: TagRequest,
    adapter: TaggerAdapter,
    state: BatchState,
    targets: string[],
    onProgress?: BatchProgressCallback,
  ) {
    this.cancelled = false
    const readiness = await adapter.checkReady()
    if (!readiness.ready) throw new Error(readiness.reason || `${adapter.id} is not ready.`)

    for (const imageId of targets) {
      if (this.cancelled) break
      const image = request.images.find((item) => item.id === imageId)
      if (!image) continue
      state.items[imageId] = { imageId, status: 'tagging' }
      await this.persistAndReport(state, imageId, onProgress)

      try {
        const [tagResult] = await adapter.tag({ ...request, images: [image] })
        if (!tagResult) throw new Error('Tagger returned no result.')
        state.items[imageId] = tagResult.error
          ? { imageId, status: 'failed', result: tagResult, error: tagResult.error }
          : { imageId, status: 'ready', result: tagResult }
      } catch (error) {
        state.items[imageId] = {
          imageId,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Tagging failed.',
        }
      }
      await this.persistAndReport(state, imageId, onProgress)
    }

    return state
  }

  private async persistAndReport(state: BatchState, imageId: string, onProgress?: BatchProgressCallback) {
    await this.persistence.saveBatchState(state)
    const item = state.items[imageId]
    const completed = Object.values(state.items).filter((value) => value.status === 'ready' || value.status === 'failed').length
    onProgress?.({
      imageId,
      status: item.status,
      completed,
      total: Object.keys(state.items).length,
      error: item.error,
    })
  }
}
