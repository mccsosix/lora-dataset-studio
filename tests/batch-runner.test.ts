import { describe, expect, it } from 'vitest'
import { BatchRunner, type BatchStatePersistence } from '../electron/services/batch-runner'
import type { TagRequest, TagResult, TaggerAdapter } from '../electron/taggers/types'

class MemoryBatchStore implements BatchStatePersistence {
  state = null

  async loadBatchState() {
    return this.state
  }

  async saveBatchState(state: NonNullable<MemoryBatchStore['state']>) {
    this.state = structuredClone(state)
  }
}

const request: TagRequest = {
  images: [
    { id: 'one', processedPath: 'one.jpg' },
    { id: 'two', processedPath: 'two.jpg' },
    { id: 'three', processedPath: 'three.jpg' },
  ],
  trainingType: 'character',
  threshold: 0.35,
}

function result(imageId: string): TagResult {
  return {
    imageId,
    providerId: 'local-wd14',
    tags: [{ name: imageId, category: 'general', confidence: 1 }],
    rawResponse: { imageId },
  }
}

describe('BatchRunner', () => {
  it('keeps completed images when one image fails', async () => {
    const store = new MemoryBatchStore()
    const adapter: TaggerAdapter = {
      id: 'local-wd14',
      async checkReady() { return { ready: true } },
      async tag(tagRequest) {
        const imageId = tagRequest.images[0].id
        if (imageId === 'two') throw new Error('broken image')
        return [result(imageId)]
      },
    }

    const state = await new BatchRunner(store).start(request, adapter)

    expect(state.items.one.status).toBe('ready')
    expect(state.items.two).toMatchObject({ status: 'failed', error: 'broken image' })
    expect(state.items.three.status).toBe('ready')
  })

  it('cancels before starting the next image without discarding completed work', async () => {
    const store = new MemoryBatchStore()
    const runner = new BatchRunner(store)
    const adapter: TaggerAdapter = {
      id: 'local-wd14',
      async checkReady() { return { ready: true } },
      async tag(tagRequest) {
        runner.cancel()
        return [result(tagRequest.images[0].id)]
      },
    }

    const state = await runner.start(request, adapter)

    expect(state.items.one.status).toBe('ready')
    expect(state.items.two.status).toBe('queued')
    expect(state.items.three.status).toBe('queued')
  })

  it('resumes interrupted items and retries only failed items', async () => {
    const store = new MemoryBatchStore()
    store.state = {
      providerId: 'local-wd14',
      trainingType: 'character',
      threshold: 0.35,
      items: {
        one: { imageId: 'one', status: 'ready', result: result('one') },
        two: { imageId: 'two', status: 'tagging' },
        three: { imageId: 'three', status: 'failed', error: 'failed earlier' },
      },
    }
    const calls: string[] = []
    const adapter: TaggerAdapter = {
      id: 'local-wd14',
      async checkReady() { return { ready: true } },
      async tag(tagRequest) {
        const imageId = tagRequest.images[0].id
        calls.push(imageId)
        return [result(imageId)]
      },
    }
    const runner = new BatchRunner(store)

    const resumed = await runner.resume(request, adapter)
    expect(calls).toEqual(['two'])
    expect(resumed.items.one.status).toBe('ready')
    expect(resumed.items.two.status).toBe('ready')
    expect(resumed.items.three.status).toBe('failed')

    calls.length = 0
    const retried = await runner.retryFailed(request, adapter)
    expect(calls).toEqual(['three'])
    expect(retried.items.three.status).toBe('ready')
  })
})
