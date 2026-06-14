import { describe, expect, it } from 'vitest'
import { createBrowserDatasetImages, prepareBrowserProjectImages } from '../src/browser-image-preprocessor'

describe('prepareBrowserProjectImages', () => {
  it('creates processable dataset images from browser-imported files', () => {
    let nextId = 0
    const images = createBrowserDatasetImages([
      { name: 'one.png', type: 'image/png' },
      { name: 'notes.txt', type: 'text/plain' },
      { name: 'two.webp', type: '' },
    ], (file) => `blob:${file.name}`, () => `image-${++nextId}`)

    expect(images).toEqual([
      {
        id: 'image-1',
        name: 'one.png',
        url: 'blob:one.png',
        sourceUrl: 'blob:one.png',
        tags: [],
        originalTags: [],
        selected: false,
        status: 'queued',
      },
      {
        id: 'image-2',
        name: 'two.webp',
        url: 'blob:two.webp',
        sourceUrl: 'blob:two.webp',
        tags: [],
        originalTags: [],
        selected: false,
        status: 'queued',
      },
    ])
  })

  it('processes imported browser images from their original URLs and stores preparation results', async () => {
    const processedSources: string[] = []
    const progressCounts: number[] = []
    const images = [
      { id: 'one', name: 'one.png', sourceUrl: 'blob:original-one', url: 'blob:old-preview' },
      { id: 'two', name: 'two.webp', sourceUrl: 'blob:original-two', url: 'blob:old-preview-two' },
    ]

    const prepared = await prepareBrowserProjectImages(
      images,
      { mode: 'white-padding' },
      async ({ imageId, sourceUrl, name, settings }) => {
        processedSources.push(sourceUrl)
        return {
          imageId,
          previewUrl: `blob:processed-${imageId}`,
          preparation: {
            mode: settings.mode,
            originalDimensions: { width: 1200, height: 800 },
            outputDimensions: { width: 1024, height: 1024 },
            outputFilename: name.replace(/\.[^.]+$/, '.jpg'),
            processedAt: '2026-06-14T00:00:00.000Z',
          },
        }
      },
      (progressImages) => progressCounts.push(progressImages.filter((image) => image.status === 'prepared').length),
    )

    expect(processedSources).toEqual(['blob:original-one', 'blob:original-two'])
    expect(progressCounts).toEqual([1, 2])
    expect(prepared).toMatchObject([
      {
        url: 'blob:processed-one',
        sourceUrl: 'blob:original-one',
        status: 'prepared',
        preparation: { mode: 'white-padding', outputFilename: 'one.jpg' },
      },
      {
        url: 'blob:processed-two',
        sourceUrl: 'blob:original-two',
        status: 'prepared',
        preparation: { mode: 'white-padding', outputFilename: 'two.jpg' },
      },
    ])
  })

  it('fails clearly when an image has no original browser source', async () => {
    await expect(prepareBrowserProjectImages(
      [{ id: 'missing', name: 'missing.png', url: 'blob:preview' }],
      { mode: 'center-crop' },
      async () => { throw new Error('processor should not run') },
    )).rejects.toThrow('missing.png 没有可处理的原始图片')
  })
})
