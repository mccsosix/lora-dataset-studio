import type { DanbooruTag } from '../danbooru.js'
import type { ImagePreparationDto } from './preprocessing.js'

export type ProjectImageStatus = 'queued' | 'preparing' | 'prepared' | 'tagging' | 'ready' | 'failed'

export type ProjectImageDto = {
  id: string
  name: string
  previewUrl: string
  tags: DanbooruTag[]
  originalTags: DanbooruTag[]
  selected: boolean
  status: ProjectImageStatus
  preparation?: ImagePreparationDto
  error?: string
}

export type ProjectDto = {
  id: string
  folderName: string
  images: ProjectImageDto[]
  updatedAt: string
}
