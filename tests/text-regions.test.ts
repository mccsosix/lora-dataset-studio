import { describe, expect, it } from 'vitest'
import {
  clearAutoTextRegionsForImages,
  cloneTextRegionsForImages,
  countAutoTextRegionsForImages,
  countTextRegionsForImages,
  createClickTextRegion,
  finalizeDraftTextRegion,
  pickTextRegionsForImages,
} from '../src/text-regions'

describe('text region interactions', () => {
  it('creates a default region centered on a simple click', () => {
    const region = createClickTextRegion('image-1', 0.5, 0.5, 'region-1')

    expect(region).toEqual({
      id: 'region-1',
      confidence: 1,
      box: {
        x: 0.41,
        y: 0.44,
        width: 0.18,
        height: 0.12,
      },
    })
  })

  it('clamps click-created regions to image bounds', () => {
    const region = createClickTextRegion('image-1', 0.98, 0.02, 'region-1')

    expect(region.box).toEqual({
      x: 0.82,
      y: 0,
      width: 0.18,
      height: 0.12,
    })
  })

  it('turns a zero-size draft into a click region', () => {
    const finalized = finalizeDraftTextRegion(
      'image-1',
      { id: 'draft', confidence: 1, box: { x: 0.25, y: 0.75, width: 0, height: 0 } },
      'region-click',
    )

    expect(finalized?.id).toBe('region-click')
    expect(finalized?.box).toEqual({
      x: 0.16,
      y: 0.69,
      width: 0.18,
      height: 0.12,
    })
  })

  it('keeps a dragged region unchanged when it is large enough', () => {
    const draft = { id: 'draft', confidence: 1, box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } }

    expect(finalizeDraftTextRegion('image-1', draft, 'unused')).toBe(draft)
  })

  it('counts only regions that belong to the current batch target images', () => {
    const regionsByImageId = {
      selected: [{ id: 'selected-region', box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } }],
      skipped: [
        { id: 'skipped-1', box: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 } },
        { id: 'skipped-2', box: { x: 0.3, y: 0.3, width: 0.2, height: 0.2 } },
      ],
    }

    expect(countTextRegionsForImages(regionsByImageId, ['selected'])).toBe(1)
    expect(pickTextRegionsForImages(regionsByImageId, ['selected'])).toEqual({
      selected: regionsByImageId.selected,
    })
  })

  it('clears only auto-detected regions in the current batch target images', () => {
    const regionsByImageId = {
      selected: [
        { id: 'selected-auto-1', box: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } },
        { id: 'selected-manual-1', box: { x: 0.2, y: 0.2, width: 0.2, height: 0.2 } },
      ],
      skipped: [{ id: 'skipped-auto-1', box: { x: 0.3, y: 0.3, width: 0.2, height: 0.2 } }],
    }

    expect(countAutoTextRegionsForImages(regionsByImageId, ['selected'])).toBe(1)
    expect(clearAutoTextRegionsForImages(regionsByImageId, ['selected'])).toEqual({
      selected: [regionsByImageId.selected[1]],
      skipped: regionsByImageId.skipped,
    })
  })

  it('clones the current image regions to each batch target image', () => {
    const sourceRegions = [
      {
        id: 'source-region',
        confidence: 0.8,
        box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        polygon: [{ x: 0.1, y: 0.2 }],
      },
    ]

    const cloned = cloneTextRegionsForImages(sourceRegions, ['one', 'two'], 'stamp')

    expect(cloned.one).toEqual([
      {
        id: 'one-bulk-stamp-0',
        confidence: 0.8,
        box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        polygon: [{ x: 0.1, y: 0.2 }],
      },
    ])
    expect(cloned.two[0].id).toBe('two-bulk-stamp-0')
    expect(cloned.one[0]).not.toBe(sourceRegions[0])
    expect(cloned.one[0].box).not.toBe(sourceRegions[0].box)
    expect(cloned.one[0].polygon).not.toBe(sourceRegions[0].polygon)
  })
})
