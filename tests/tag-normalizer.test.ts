import { describe, expect, it } from 'vitest'
import { normalizeTags } from '../electron/services/tag-normalizer'

describe('normalizeTags', () => {
  it('normalizes names, falls back invalid categories, and keeps the strongest duplicate', () => {
    expect(normalizeTags([
      { name: ' Blue Eyes ', category: 'unknown', confidence: 0.6 },
      { name: 'blue-eyes', category: 'character', confidence: 0.92 },
      { name: 'Looking At Viewer', category: 'general', confidence: 0.8 },
      { name: '   ', category: 'general', confidence: 1 },
    ])).toEqual([
      { name: 'blue_eyes', category: 'character', confidence: 0.92 },
      { name: 'looking_at_viewer', category: 'general', confidence: 0.8 },
    ])
  })
})
