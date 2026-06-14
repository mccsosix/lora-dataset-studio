import { describe, expect, it } from 'vitest'
import { browserDesktopApi, createDesktopApi, desktopApiMethodNames } from '../src/desktop-api'

describe('browser desktop API fallback', () => {
  it('implements every safe preload method', () => {
    expect(Object.keys(browserDesktopApi).sort()).toEqual([...desktopApiMethodNames].sort())
  })

  it('returns browser runtime information without exposing Node primitives', async () => {
    await expect(browserDesktopApi.getRuntimeInfo()).resolves.toEqual({
      environment: 'browser',
      platform: 'browser',
    })

    expect(browserDesktopApi).not.toHaveProperty('require')
    expect(browserDesktopApi).not.toHaveProperty('process')
    expect(browserDesktopApi).not.toHaveProperty('fs')
  })

  it('builds the preload bridge from the same safe contract', async () => {
    const invokedChannels: string[] = []
    const preloadApi = createDesktopApi(async (channel, value) => {
      invokedChannels.push(channel)
      if (value) return value
      return { environment: 'electron', platform: 'win32' }
    })
    const project = {
      id: 'project',
      folderName: 'images',
      images: [],
      updatedAt: '2026-06-14T00:00:00.000Z',
    }

    expect(Object.keys(preloadApi).sort()).toEqual([...desktopApiMethodNames].sort())
    await expect(preloadApi.getRuntimeInfo()).resolves.toEqual({
      environment: 'electron',
      platform: 'win32',
    })
    await preloadApi.selectImageFolder()
    await preloadApi.loadProject()
    await expect(preloadApi.saveProject(project)).resolves.toEqual(project)
    await preloadApi.prepareImages({ mode: 'preserve-aspect' })
    expect(invokedChannels).toEqual([
      'lora-studio:get-runtime-info',
      'lora-studio:select-image-folder',
      'lora-studio:load-project',
      'lora-studio:save-project',
      'lora-studio:prepare-images',
    ])
  })

  it('subscribes to safe batch progress events without exposing ipcRenderer', () => {
    let listener: ((event: unknown) => void) | undefined
    const api = createDesktopApi(
      async () => null,
      (channel, callback) => {
        expect(channel).toBe('lora-studio:batch-progress')
        listener = callback
        return () => { listener = undefined }
      },
    )
    const events: unknown[] = []

    const unsubscribe = api.onBatchProgress((event) => events.push(event))
    listener?.({ imageId: 'one', status: 'ready', completed: 1, total: 2 })
    unsubscribe()

    expect(events).toEqual([{ imageId: 'one', status: 'ready', completed: 1, total: 2 }])
    expect(listener).toBeUndefined()
    expect(api).not.toHaveProperty('ipcRenderer')
  })
})
