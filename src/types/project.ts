import type { DanbooruTag } from '../danbooru.js'

export type ProjectImageStatus = 'queued' | 'preparing' | 'prepared' | 'tagging' | 'ready' | 'failed'

export type ProjectImageDto = {
  id: string
  name: string
  previewUrl: string
  tags: DanbooruTag[]
  originalTags: DanbooruTag[]
  selected: boolean
  status: ProjectImageStatus
}

export type ProjectDto = {
  id: string
  folderName: string
  images: ProjectImageDto[]
  updatedAt: string
}
