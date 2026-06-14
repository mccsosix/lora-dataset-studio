export type TagCategory = 'general' | 'character' | 'copyright' | 'artist' | 'meta'

export type DanbooruTag = {
  name: string
  category: TagCategory
  confidence: number
}

export const categoryMeta: Record<TagCategory, { label: string; color: string }> = {
  general: { label: 'General', color: '#67b7a5' },
  character: { label: 'Character', color: '#b6db63' },
  copyright: { label: 'Copyright', color: '#c995d1' },
  artist: { label: 'Artist', color: '#efad70' },
  meta: { label: 'Meta', color: '#7fa7d8' },
}

const invalidCharacters = /[^\p{L}\p{N}_():'.+\-!]/gu
const repeatedUnderscores = /_+/g

export function normalizeDanbooruTag(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(invalidCharacters, '')
    .replace(repeatedUnderscores, '_')
    .replace(/^_+|_+$/g, '')
}

export function serializeDanbooruTags(tags: DanbooruTag[]) {
  return tags.map((tag) => tag.name).join(', ')
}

export function deduplicateTags(tags: DanbooruTag[]) {
  const seen = new Set<string>()
  return tags.filter((tag) => {
    if (!tag.name || seen.has(tag.name)) return false
    seen.add(tag.name)
    return true
  })
}

export function createTag(name: string, category: TagCategory = 'general', confidence = 1): DanbooruTag {
  return { name: normalizeDanbooruTag(name), category, confidence }
}

