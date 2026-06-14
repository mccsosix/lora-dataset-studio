import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import type { ProjectDto, ProjectImageDto } from '../../src/types/project.js'

const imageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp'])

type PersistedImage = Omit<ProjectImageDto, 'previewUrl'> & {
  sourcePath: string
  sourceSize: number
  sourceModifiedAt: string
}

type PersistedProject = Omit<ProjectDto, 'images' | 'folderName'> & {
  folderPath: string
  images: PersistedImage[]
}

function stableId(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

function toImageDto(image: PersistedImage): ProjectImageDto {
  return {
    id: image.id,
    name: image.name,
    previewUrl: `lora-image://image/${encodeURIComponent(image.id)}`,
    tags: image.tags.map((tag) => ({ ...tag })),
    originalTags: image.originalTags.map((tag) => ({ ...tag })),
    selected: image.selected,
    status: image.status,
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

  private async persist() {
    if (!this.project) return
    await mkdir(dirname(this.stateFile), { recursive: true })
    await writeFile(this.stateFile, JSON.stringify(this.project, null, 2), 'utf8')
  }
}
