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
    const preloadApi = createDesktopApi(async (channel) => {
      invokedChannels.push(channel)
      return { environment: 'electron', platform: 'win32' }
    })

    expect(Object.keys(preloadApi).sort()).toEqual([...desktopApiMethodNames].sort())
    await expect(preloadApi.getRuntimeInfo()).resolves.toEqual({
      environment: 'electron',
      platform: 'win32',
    })
    expect(invokedChannels).toEqual(['lora-studio:get-runtime-info'])
  })
})
