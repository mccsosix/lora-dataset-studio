import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import type { ProjectDto, ProjectImageDto } from '../../src/types/project.js'
import type { PreprocessImageResult } from './image-preprocessor.js'
import type { BatchState } from './batch-runner.js'

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp'])

type PersistedImage = Omit<ProjectImageDto, 'previewUrl'> & {
  sourcePath: string
  sourceSize: number
  sourceModifiedAt: string
  processedPath?: string
}

type PersistedProject = Omit<ProjectDto, 'images' | 'folderName'> & {
  folderPath: string
  images: PersistedImage[]
  batch?: BatchState
}

function stableId(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

function toImageDto(image: PersistedImage): ProjectImageDto {
  return {
    id: image.id,
    name: image.name,
    previewUrl: `lora-image://image/${encodeURIComponent(image.id)}?v=${encodeURIComponent(image.preparation?.processedAt ?? image.sourceModifiedAt)}`,
    tags: image.tags.map((tag) => ({ ...tag })),
    originalTags: image.originalTags.map((tag) => ({ ...tag })),
    selected: image.selected,
    status: image.status,
    preparation: image.preparation ? { ...image.preparation } : undefined,
  }
}

function toProjectDto(project: PersistedProject): ProjectDto {
  return {
    id: project.id,
    folderName: basename(project.folderPath),
    images: project.images.map(toImageDto),
    updatedAt: project.updatedAt,
  }
}

export class ProjectStore {
  private project: PersistedProject | null = null

  constructor(private readonly stateFile: string) {}

  async createProjectFromFolder(folderPath: string): Promise<ProjectDto> {
    const resolvedFolder = resolve(folderPath)
    const entries = await readdir(resolvedFolder, { withFileTypes: true })
    const imageNames = entries
      .filter((entry) => entry.isFile() && imageExtensions.has(extname(entry.name).toLowerCase()))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right))

    const images = await Promise.all(imageNames.map(async (name, index): Promise<PersistedImage> => {
      const sourcePath = join(resolvedFolder, name)
      const sourceStat = await stat(sourcePath)
      return {
        id: stableId(sourcePath),
        name,
        sourcePath,
        sourceSize: sourceStat.size,
        sourceModifiedAt: sourceStat.mtime.toISOString(),
        tags: [],
        originalTags: [],
        selected: index === 0,
        status: 'queued',
      }
    }))

    this.project = {
      id: stableId(resolvedFolder),
      folderPath: resolvedFolder,
      images,
      updatedAt: new Date().toISOString(),
    }
    await this.persist()
    return toProjectDto(this.project)
  }

  async loadProject(): Promise<ProjectDto | null> {
    if (!this.project) {
      try {
        this.project = JSON.parse(await readFile(this.stateFile, 'utf8')) as PersistedProject
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw error
      }
    }
    return toProjectDto(this.project)
  }

  async saveProject(project: ProjectDto): Promise<ProjectDto> {
    if (!this.project) await this.loadProject()
    if (!this.project || this.project.id !== project.id) throw new Error('Project does not match the active project.')

    const edits = new Map(project.images.map((image) => [image.id, image]))
    this.project.images = this.project.images.flatMap((image) => {
      const edit = edits.get(image.id)
      if (!edit) return []
      return [{
        ...image,
        tags: edit.tags.map((tag) => ({ ...tag })),
        originalTags: edit.originalTags.map((tag) => ({ ...tag })),
        selected: edit.selected,
        status: edit.status,
      }]
    })
    await this.persist()
    return toProjectDto(this.project)
  }

  getSourcePath(imageId: string): string | undefined {
    return this.project?.images.find((image) => image.id === imageId)?.sourcePath
  }

  getPreviewPath(imageId: string): string | undefined {
    const image = this.project?.images.find((item) => item.id === imageId)
    return image?.processedPath ?? image?.sourcePath
  }

  getProjectId(): string | undefined {
    return this.project?.id
  }

  getProjectImages() {
    return this.project?.images.map((image) => ({
      id: image.id,
      name: image.name,
      sourcePath: image.sourcePath,
    })) ?? []
  }

  async savePreparationResults(results: PreprocessImageResult[]): Promise<ProjectDto> {
    if (!this.project) throw new Error('No active project.')
    const resultMap = new Map(results.map((result) => [result.imageId, result]))
    this.project.images = this.project.images.map((image) => {
      const result = resultMap.get(image.id)
      if (!result) return image
      const { imageId: _imageId, outputPath, ...preparation } = result
      return {
        ...image,
        processedPath: outputPath,
        preparation,
        status: 'prepared',
      }
    })
    this.project.updatedAt = new Date().toISOString()
    await this.persist()
    return toProjectDto(this.project)
  }

  async loadBatchState(): Promise<BatchState | null> {
    if (!this.project) await this.loadProject()
    return this.project?.batch ? structuredClone(this.project.batch) : null
  }

  async saveBatchState(state: BatchState): Promise<void> {
    if (!this.project) await this.loadProject()
    if (!this.project) throw new Error('No active project.')
    this.project.batch = structuredClone(state)
    await this.persist()
  }

  private async persist() {
    if (!this.project) return
    await mkdir(dirname(this.stateFile), { recursive: true })
    await writeFile(this.stateFile, JSON.stringify(this.project, null, 2), 'utf8')
  }
}
