import { normalizeDanbooruTag, type DanbooruTag, type TagCategory } from '../../src/danbooru.js'

const categories = new Set<TagCategory>(['general', 'character', 'copyright', 'artist', 'meta'])

type RawTag = {
  name: string
  category?: string
  confidence?: number
}

function normalizeCategory(category: string | undefined): TagCategory {
  return categories.has(category as TagCategory) ? category as TagCategory : 'general'
}

export function normalizeTags(tags: RawTag[]): DanbooruTag[] {
  const normalized = new Map<string, DanbooruTag>()

  for (const tag of tags) {
    const name = normalizeDanbooruTag(tag.name.replaceAll('-', '_'))
    if (!name) continue
    const confidence = Number.isFinite(tag.confidence) ? Math.min(1, Math.max(0, tag.confidence ?? 1)) : 1
    const candidate = {
      name,
      category: normalizeCategory(tag.category),
      confidence,
    }
    const existing = normalized.get(name)
    if (!existing || candidate.confidence > existing.confidence) normalized.set(name, candidate)
  }

  return [...normalized.values()]
}
