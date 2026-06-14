import type { ProjectDto } from './types/project.js'
import type { PreprocessSettings } from './types/preprocessing.js'
import type { BatchProgressEvent } from './types/tagging.js'

export type RuntimeInfo = {
  environment: 'browser' | 'electron'
  platform: string
}

export interface DesktopApi {
  getRuntimeInfo(): Promise<RuntimeInfo>
  selectImageFolder(): Promise<ProjectDto | null>
  loadProject(): Promise<ProjectDto | null>
  saveProject(project: ProjectDto): Promise<ProjectDto>
  prepareImages(settings: PreprocessSettings): Promise<ProjectDto>
  onBatchProgress(callback: (event: BatchProgressEvent) => void): () => void
}

export const desktopApiMethodNames = [
  'getRuntimeInfo',
  'selectImageFolder',
  'loadProject',
  'saveProject',
  'prepareImages',
  'onBatchProgress',
] as const satisfies ReadonlyArray<keyof DesktopApi>

type DesktopInvoke = (channel: string, ...args: unknown[]) => Promise<unknown>
type DesktopSubscribe = (channel: string, callback: (event: unknown) => void) => () => void

export function createDesktopApi(invoke: DesktopInvoke, subscribe: DesktopSubscribe = () => () => undefined): DesktopApi {
  return {
    async getRuntimeInfo() {
      return await invoke('lora-studio:get-runtime-info') as RuntimeInfo
    },
    async selectImageFolder() {
      return await invoke('lora-studio:select-image-folder') as ProjectDto | null
    },
    async loadProject() {
      return await invoke('lora-studio:load-project') as ProjectDto | null
    },
    async saveProject(project) {
      return await invoke('lora-studio:save-project', project) as ProjectDto
    },
    async prepareImages(settings) {
      return await invoke('lora-studio:prepare-images', settings) as ProjectDto
    },
    onBatchProgress(callback) {
      return subscribe('lora-studio:batch-progress', (event) => callback(event as BatchProgressEvent))
    },
  }
}

let browserProject: ProjectDto | null = null

export const browserDesktopApi: DesktopApi = {
  async getRuntimeInfo() {
    return {
      environment: 'browser',
      platform: 'browser',
    }
  },
  async selectImageFolder() {
    const response = await fetch('/api/local-images')
    const data = await response.json() as {
      folderName: string
      images: Array<{ id: string; name: string; url: string }>
      error?: string
    }
    if (!response.ok) throw new Error(data.error || 'Unable to read the development image folder.')
    browserProject = {
      id: 'browser-development-project',
      folderName: data.folderName,
      images: data.images.map((image, index) => ({
        id: image.id,
        name: image.name,
        previewUrl: image.url,
        tags: [],
        originalTags: [],
        selected: index === 0,
        status: 'queued',
      })),
      updatedAt: new Date().toISOString(),
    }
    return browserProject
  },
  async loadProject() {
    return browserProject ?? browserDesktopApi.selectImageFolder()
  },
  async saveProject(project) {
    browserProject = project
    return project
  },
  async prepareImages() {
    throw new Error('Image preparation is available in the desktop application.')
  },
  onBatchProgress() {
    return () => undefined
  },
}

declare global {
  interface Window {
    loraStudio?: DesktopApi
  }
}

export function getDesktopApi(): DesktopApi {
  return window.loraStudio ?? browserDesktopApi
}
