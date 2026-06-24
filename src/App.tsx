import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import JSZip from 'jszip'
import {
  Aperture,
  Archive,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  DoorOpen,
  FolderOpen,
  ImagePlus,
  Images,
  LoaderCircle,
  LogOut,
  Maximize2,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  WandSparkles,
  X,
} from 'lucide-react'
import {
  createTag,
  deduplicateTags,
  normalizeDanbooruTag,
  serializeDanbooruTags,
  type DanbooruTag,
} from './danbooru'
import { getDesktopApi } from './desktop-api'
import { ModelSetupPanel } from './components/ModelSetupPanel'
import { ImageLightbox } from './components/ImageLightbox'
import { PreprocessStep } from './components/PreprocessStep'
import { createBrowserDatasetImages, prepareBrowserProjectImages } from './browser-image-preprocessor'
import { countPreparedImages } from './preprocessing'
import { getTextRemovalPrepareBlockReason } from './text-removal-availability'
import {
  clearAutoTextRegionsForImages,
  cloneTextRegionsForImages,
  countAutoTextRegionsForImages,
  countTextRegionsForImages,
  finalizeDraftTextRegion,
  pickTextRegionsForImages,
} from './text-regions'
import type { ProjectDto, ProjectImageStatus } from './types/project'
import type { ImagePreparationDto, PreprocessMode } from './types/preprocessing'
import type { ModelDownloadProgress, ModelStatus } from './types/model'
import type { TextRemovalEngineStatus, TextRegion } from './types/text-removal'
import type { BatchProgressEvent } from './types/tagging'

type TrainingType = 'character' | 'style' | 'concept'
type ImageStatus = ProjectImageStatus

type DatasetImage = {
  id: string
  name: string
  url: string
  sourceUrl?: string
  tags: DanbooruTag[]
  originalTags: DanbooruTag[]
  selected: boolean
  status: ImageStatus
  error?: string
  local?: boolean
  preparation?: ImagePreparationDto
}

type PreprocessCompletionItem = {
  imageId: string
  name: string
  status: 'cleaned' | 'prepared' | 'skipped' | 'failed'
  detail: string
}

type PreprocessPendingItem = {
  imageId: string
  name: string
  status: 'will-clean' | 'skipped'
  detail: string
}

type LocalTagResponse = {
  provider: string
  results: Array<{ name: string; tags: DanbooruTag[] }>
}

const desktopApi = getDesktopApi()
const isDesktop = Boolean(window.loraStudio)
const unavailableModelStatus: ModelStatus = {
  state: 'unavailable',
  name: '本地 WD14',
  recommendedVersion: '',
  totalBytes: 0,
  licenseUrl: '',
}

const strategies: Record<TrainingType, { label: string; description: string; trigger: string }> = {
  character: { label: '人物', description: '让模型记住一个人物，同时保留不同服装与场景。', trigger: 'ohwx_person' },
  style: { label: '画风', description: '让模型学习图片共同的视觉风格。', trigger: 'sks_style' },
  concept: { label: '物品 / 概念', description: '让模型学习独特物品、服装或概念。', trigger: 'sks_concept' },
}

const generatedTags: Record<TrainingType, DanbooruTag[]> = {
  character: [
    createTag('ohwx_person', 'character', 1),
    createTag('1girl', 'general', .99),
    createTag('solo', 'general', .98),
    createTag('looking_at_viewer', 'general', .94),
    createTag('black_jacket', 'general', .88),
    createTag('upper_body', 'general', .83),
    createTag('city_lights', 'general', .72),
  ],
  style: [
    createTag('1girl', 'general', .99),
    createTag('portrait', 'general', .96),
    createTag('warm_color_palette', 'general', .87),
    createTag('soft_lighting', 'general', .84),
    createTag('detailed_background', 'general', .76),
  ],
  concept: [
    createTag('sks_concept', 'general', 1),
    createTag('close-up', 'general', .97),
    createTag('outdoors', 'general', .91),
    createTag('natural_lighting', 'general', .86),
    createTag('depth_of_field', 'general', .78),
  ],
}

const demoImages: DatasetImage[] = [
  { id: 'demo-1', name: 'portrait_001.png', url: '', tags: generatedTags.character, originalTags: generatedTags.character, selected: true, status: 'ready' },
  { id: 'demo-2', name: 'portrait_002.png', url: '', tags: [createTag('ohwx_person', 'character', 1), createTag('1girl'), createTag('white_shirt'), createTag('indoors')], originalTags: [], selected: false, status: 'ready' },
  { id: 'demo-3', name: 'portrait_003.png', url: '', tags: [], originalTags: [], selected: false, status: 'queued' },
  { id: 'demo-4', name: 'portrait_004.png', url: '', tags: [], originalTags: [], selected: false, status: 'queued' },
]

function TagChip({ tag, emerging = false, onRemove }: { tag: DanbooruTag; emerging?: boolean; onRemove?: () => void }) {
  return (
    <span className={`tag-chip ${emerging ? 'emerging' : ''}`}>
      {tag.name.replaceAll('_', ' ')}
      {onRemove ? <button type="button" aria-label={`删除标签 ${tag.name}`} onClick={onRemove}><X size={14} aria-hidden="true" /></button> : null}
    </span>
  )
}

function App() {
  const [view, setView] = useState<'room' | 'workspace'>('room')
  const [isEntering, setIsEntering] = useState(false)
  const [soundOn, setSoundOn] = useState(false)
  const [roomTheme, setRoomTheme] = useState<'night' | 'day'>('night')
  const [trainingType, setTrainingType] = useState<TrainingType>('character')
  const [images, setImages] = useState<DatasetImage[]>(demoImages)
  const [activeId, setActiveId] = useState(demoImages[0].id)
  const [search, setSearch] = useState('')
  const [newTag, setNewTag] = useState('')
  const [isTagging, setIsTagging] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [isDetectingTextRegions, setIsDetectingTextRegions] = useState(false)
  const [preprocessProgress, setPreprocessProgress] = useState<BatchProgressEvent | null>(null)
  const [preprocessCompletionMessage, setPreprocessCompletionMessage] = useState('')
  const [preprocessCompletionItems, setPreprocessCompletionItems] = useState<PreprocessCompletionItem[]>([])
  const [preprocessMode, setPreprocessMode] = useState<PreprocessMode>('preserve-aspect')
  const [batchScope, setBatchScope] = useState<'all' | 'selected'>('all')
  const [textRemovalEnabled, setTextRemovalEnabled] = useState(false)
  const [manualTextRegions, setManualTextRegions] = useState<Record<string, TextRegion[]>>({})
  const [draftRegion, setDraftRegion] = useState<TextRegion | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [threshold, setThreshold] = useState(.35)
  const [notice, setNotice] = useState('暗房已准备好')
  const [localFolderName, setLocalFolderName] = useState('')
  const [hasLoadedLocalFolder, setHasLoadedLocalFolder] = useState(false)
  const [currentProject, setCurrentProject] = useState<ProjectDto | null>(null)
  const [modelStatus, setModelStatus] = useState<ModelStatus>(unavailableModelStatus)
  const [textRemovalStatus, setTextRemovalStatus] = useState<TextRemovalEngineStatus | undefined>()
  const [isCheckingTextRemovalStatus, setIsCheckingTextRemovalStatus] = useState(false)
  const [modelProgress, setModelProgress] = useState<ModelDownloadProgress | null>(null)
  const [isManagingModel, setIsManagingModel] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<{ id: string; name: string; url: string } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const noiseSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const noiseGainRef = useRef<GainNode | null>(null)
  const ambientOscillatorsRef = useRef<OscillatorNode[]>([])
  const deferredSearch = useDeferredValue(search)

  const activeImage = images.find((image) => image.id === activeId) ?? images[0]
  const activeTextRegions = activeImage ? (manualTextRegions[activeImage.id] ?? []) : []
  const selectedCount = images.reduce((count, image) => count + Number(image.selected), 0)
  const taggedCount = images.reduce((count, image) => count + Number(image.tags.length > 0), 0)
  const preparedCount = countPreparedImages(images)
  const lightboxPrepareBlockReason = lightboxImage && textRemovalEnabled
    ? (!images.length || (isDesktop && !currentProject)
      ? '请先选择图片文件夹。'
      : !isDesktop && images.some((image) => !image.sourceUrl)
        ? '请先导入真实图片；示例图片不能进行网页图片处理。'
        : getTextRemovalPrepareBlockReason({
          isDesktop,
          textRemovalEnabled,
          manualRegionCount: manualTextRegions[lightboxImage.id]?.length ?? 0,
        }))
    : null
  const visibleImages = useMemo(() => {
    const query = normalizeDanbooruTag(deferredSearch)
    if (!query) return images
    return images.filter((image) => image.name.toLowerCase().includes(query) || image.tags.some((tag) => tag.name.includes(query)))
  }, [images, deferredSearch])

  const getBatchTargetImages = () => {
    return batchScope === 'selected' ? images.filter((image) => image.selected) : images
  }
  const batchTargetImageIds = getBatchTargetImages().map((image) => image.id)
  const targetManualRegionCount = countTextRegionsForImages(manualTextRegions, batchTargetImageIds)
  const targetAutoRegionCount = countAutoTextRegionsForImages(manualTextRegions, batchTargetImageIds)
  const preprocessPendingItems: PreprocessPendingItem[] = textRemovalEnabled
    ? getBatchTargetImages().map((image) => {
      const regionCount = manualTextRegions[image.id]?.length ?? 0
      return {
        imageId: image.id,
        name: image.name,
        status: regionCount > 0 ? 'will-clean' : 'skipped',
        detail: regionCount > 0 ? `${regionCount} 个区域待处理` : '未框选区域',
      }
    })
    : []

  useEffect(() => {
    if (!lightboxImage) return
    const updatedImage = images.find((image) => image.id === lightboxImage.id)
    if (updatedImage?.url && updatedImage.url !== lightboxImage.url) {
      setLightboxImage({ id: updatedImage.id, name: updatedImage.name, url: updatedImage.url })
    }
  }, [images, lightboxImage])

  const updateImage = (id: string, patch: Partial<DatasetImage>) => {
    setImages((current) => current.map((image) => image.id === id ? { ...image, ...patch } : image))
  }

  const applyProject = (project: ProjectDto) => {
    const projectImages: DatasetImage[] = project.images.map((image) => ({
      id: image.id,
      name: image.name,
      url: image.previewUrl,
      sourceUrl: image.previewUrl,
      tags: image.tags,
      originalTags: image.originalTags,
      selected: image.selected,
      status: image.status,
      error: image.error,
      local: true,
      preparation: image.preparation,
    }))
    startTransition(() => setImages(projectImages))
    setActiveId((current) => projectImages.some((image) => image.id === current) ? current : projectImages[0]?.id ?? '')
    setLocalFolderName(project.folderName)
    setCurrentProject(project)
    setHasLoadedLocalFolder(true)
  }

  const loadProject = async () => {
    setNotice('正在恢复本地项目…')
    try {
      const project = await desktopApi.loadProject()
      if (!project) {
        setImages([])
        setActiveId('')
        setLocalFolderName('')
        setHasLoadedLocalFolder(true)
        setNotice('请选择一个图片文件夹开始')
        return
      }
      applyProject(project)
      setNotice(`已恢复 ${project.folderName} 中 ${project.images.length} 张图片`)
    } catch (error) {
      setHasLoadedLocalFolder(true)
      setNotice(error instanceof Error ? error.message : '无法恢复本地项目')
    }
  }

  const selectImageFolder = async () => {
    setNotice('请选择包含训练图片的文件夹…')
    try {
      const project = await desktopApi.selectImageFolder()
      if (!project) {
        setNotice('已取消选择')
        return
      }
      applyProject(project)
      setNotice(`已从 ${project.folderName} 读取 ${project.images.length} 张图片`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法读取本地图片文件夹')
    }
  }

  const prepareImages = async (manualRegionsOverride?: Record<string, TextRegion[]>) => {
    const manualRegionsForPrepare = manualRegionsOverride ?? manualTextRegions
    const targetImages = getBatchTargetImages()
    const targetImageIds = targetImages.map((image) => image.id)
    const targetManualRegions = pickTextRegionsForImages(manualRegionsForPrepare, targetImageIds)
    const manualRegionCountForPrepare = countTextRegionsForImages(manualRegionsForPrepare, targetImageIds)
    if (!images.length || (isDesktop && !currentProject)) {
      const message = '请先选择图片文件夹'
      setNotice(message)
      return message
    }
    if (!targetImageIds.length) {
      const message = '请先勾选要批量处理的图片，或把处理范围改为全部图片'
      setNotice(message)
      return message
    }
    if (!isDesktop && images.some((image) => !image.sourceUrl)) {
      const message = '请先导入真实图片，再进行网页图片处理'
      setNotice(message)
      return message
    }
    const textRemovalBlockReason = getTextRemovalPrepareBlockReason({
      isDesktop,
      textRemovalEnabled,
      manualRegionCount: manualRegionCountForPrepare,
    })
    if (textRemovalBlockReason) {
      setNotice(textRemovalBlockReason)
      return textRemovalBlockReason
    }
    setIsPreparing(true)
    setPreprocessCompletionMessage('')
    setPreprocessCompletionItems([])
    setPreprocessProgress({ phase: 'prepare', imageId: '', status: 'preparing', completed: 0, total: targetImageIds.length })
    const preparingMessage = `正在准备 ${targetImageIds.length} 张训练图片…`
    setNotice(preparingMessage)
    try {
      if (!isDesktop) {
        const preparedImages = await prepareBrowserProjectImages(
          images,
          { mode: preprocessMode },
          undefined,
          (progressImages) => setImages(progressImages),
        )
        images.forEach((image) => {
          if (image.url.startsWith('blob:') && image.url !== image.sourceUrl) URL.revokeObjectURL(image.url)
        })
        setImages(preparedImages)
        const message = `网页图片已准备完成：${preparedImages.length} 张 · ${preprocessMode}`
        setNotice(message)
        return message
      }
      const project = await desktopApi.prepareImages({
        mode: preprocessMode,
        imageIds: targetImageIds,
        textRemoval: textRemovalEnabled ? {
          mode: 'manual',
          maskPadding: 8,
          manualRegionsByImageId: targetManualRegions,
        } : { mode: 'off' },
      })
      applyProject(project)
      const targetIdSet = new Set(targetImageIds)
      const targetProjectImages = project.images.filter((image) => targetIdSet.has(image.id))
      const targetRegionCounts = new Map(targetImageIds.map((imageId) => [imageId, targetManualRegions[imageId]?.length ?? 0]))
      const completionItems: PreprocessCompletionItem[] = targetProjectImages.map((image) => {
        if (image.status === 'failed') {
          return { imageId: image.id, name: image.name, status: 'failed', detail: image.error ?? '处理失败' }
        }
        if (image.preparation?.textRemoval) {
          return {
            imageId: image.id,
            name: image.name,
            status: 'cleaned',
            detail: `${image.preparation.textRemoval.regionCount} 个区域 · ${image.preparation.textRemoval.fallbackReason ? '快速修复' : 'LaMA'}`,
          }
        }
        if (textRemovalEnabled && (targetRegionCounts.get(image.id) ?? 0) === 0) {
          return { imageId: image.id, name: image.name, status: 'skipped', detail: '未框选区域' }
        }
        return {
          imageId: image.id,
          name: image.name,
          status: 'prepared',
          detail: image.preparation ? `${image.preparation.outputDimensions.width}×${image.preparation.outputDimensions.height}` : '已准备',
        }
      })
      setPreprocessCompletionItems(completionItems)
      const failedImages = targetProjectImages.filter((image) => image.status === 'failed')
      if (failedImages.length) {
        const firstFailure = failedImages[0]
        const message = `${failedImages.length} 张图片准备失败：${firstFailure.name}${firstFailure.error ? ` · ${firstFailure.error}` : ''}`
        setNotice(message)
        return message
      }
      if (textRemovalEnabled && manualRegionCountForPrepare > 0 && !targetProjectImages.some((image) => image.preparation?.textRemoval)) {
        const message = '图片已准备，但去水印没有执行：没有在返回结果中发现 LaMA 修复记录。请重新打开当前图确认区域还在。'
        setNotice(message)
        setPreprocessCompletionMessage(message)
        return message
      }
      const textRemovalImages = targetProjectImages.filter((image) => image.preparation?.textRemoval)
      const textRemovalRegionCount = textRemovalImages.reduce((count, image) => count + (image.preparation?.textRemoval?.regionCount ?? 0), 0)
      const textRemovalAdapters = new Set(textRemovalImages.map((image) => image.preparation?.textRemoval?.fallbackReason ? '快速修复' : 'LaMA'))
      let textRemovalSummaryMessage = ''
      if (textRemovalImages.length) {
        const adapterLabel = textRemovalAdapters.size > 1 ? 'LaMA / 快速修复' : [...textRemovalAdapters][0]
        textRemovalSummaryMessage = `去水印完成：${textRemovalImages.length} 张图片 · ${textRemovalRegionCount} 个区域已用 ${adapterLabel} 处理。`
        setNotice(textRemovalSummaryMessage)
        setPreprocessCompletionMessage(textRemovalSummaryMessage)
      }
      const preparedLightboxImage = lightboxImage ? project.images.find((image) => image.id === lightboxImage.id) : undefined
      if (preparedLightboxImage?.preparation?.textRemoval) {
        const removal = preparedLightboxImage.preparation.textRemoval
        const message = `当前图已用 ${removal.adapterId === 'iopaint-lama' ? 'LaMA' : removal.adapterId} 处理 ${removal.regionCount} 个区域。`
        setNotice(message)
        setPreprocessCompletionMessage(message)
        return message
      }
      if (textRemovalImages.length) {
        setNotice(textRemovalSummaryMessage)
        setPreprocessCompletionMessage(textRemovalSummaryMessage)
        return textRemovalSummaryMessage
      }
      const message = `图片已准备完成：${targetImageIds.length} 张 · ${preprocessMode}`
      setNotice(message)
      setPreprocessCompletionMessage(message)
      return message
    } catch (error) {
      const message = error instanceof Error ? error.message : '图片准备失败'
      setNotice(message)
      return message
    } finally {
      setIsPreparing(false)
      setPreprocessProgress(null)
    }
  }

  const beginTextRegion = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!activeImage || !textRemovalEnabled) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - bounds.left) / bounds.width
    const y = (event.clientY - bounds.top) / bounds.height
    const region = { id: `${activeImage.id}-${Date.now()}`, box: { x, y, width: 0, height: 0 }, confidence: 1 }
    setDraftRegion(region)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const updateTextRegion = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!activeImage || !draftRegion?.box || !textRemovalEnabled) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const y = Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height))
    setDraftRegion({
      ...draftRegion,
      box: {
        x: Math.min(draftRegion.box.x, x),
        y: Math.min(draftRegion.box.y, y),
        width: Math.abs(x - draftRegion.box.x),
        height: Math.abs(y - draftRegion.box.y),
      },
    })
  }

  const commitTextRegion = () => {
    if (!activeImage || !draftRegion?.box) {
      setDraftRegion(null)
      return
    }
    const finalizedRegion = finalizeDraftTextRegion(activeImage.id, draftRegion, `${activeImage.id}-${Date.now()}-click`)
    if (!finalizedRegion) {
      setDraftRegion(null)
      return
    }
    setManualTextRegions((current) => ({
      ...current,
      [activeImage.id]: [...(current[activeImage.id] ?? []), finalizedRegion],
    }))
    setDraftRegion(null)
  }

  const addTextRegion = (imageId: string, region: TextRegion) => {
    setManualTextRegions((current) => ({
      ...current,
      [imageId]: [...(current[imageId] ?? []), region],
    }))
  }

  const removeTextRegion = (imageId: string, regionId: string) => {
    setManualTextRegions((current) => ({
      ...current,
      [imageId]: (current[imageId] ?? []).filter((region) => region.id !== regionId),
    }))
  }

  const clearActiveTextRegions = () => {
    if (!activeImage) return
    setManualTextRegions((current) => ({ ...current, [activeImage.id]: [] }))
  }

  const clearBatchAutoTextRegions = () => {
    const clearedCount = countAutoTextRegionsForImages(manualTextRegions, batchTargetImageIds)
    if (!clearedCount) {
      setNotice('当前处理范围里没有自动检测框。')
      return
    }
    setManualTextRegions((current) => clearAutoTextRegionsForImages(current, batchTargetImageIds))
    setPreprocessCompletionMessage('')
    setPreprocessCompletionItems([])
    setNotice(`已清空当前处理范围内 ${clearedCount} 个自动检测框。`)
  }

  const applyActiveTextRegionsToBatch = () => {
    if (!activeImage || activeTextRegions.length === 0) {
      setNotice('当前图还没有文字 / 水印框。')
      return
    }
    if (!batchTargetImageIds.length) {
      setNotice('当前处理范围里没有图片。')
      return
    }
    const clonedRegions = cloneTextRegionsForImages(activeTextRegions, batchTargetImageIds, String(Date.now()))
    setManualTextRegions((current) => ({
      ...current,
      ...clonedRegions,
    }))
    setPreprocessCompletionMessage('')
    setPreprocessCompletionItems([])
    setNotice(`已把当前图 ${activeTextRegions.length} 个区域套用到 ${batchTargetImageIds.length} 张图片。`)
  }

  const autoDetectTextRegions = async () => {
    if (!textRemovalEnabled) {
      setNotice('请先开启 Remove text / watermark。')
      return
    }
    setIsDetectingTextRegions(true)
    const targetImages = getBatchTargetImages()
    const targetImageIds = targetImages.map((image) => image.id)
    if (!targetImageIds.length) {
      setNotice('请先勾选要自动检测的图片，或把处理范围改为全部图片。')
      setIsDetectingTextRegions(false)
      return
    }
    setPreprocessProgress({ phase: 'detect-text', imageId: '', status: 'preparing', completed: 0, total: targetImageIds.length })
    setNotice(`正在自动检测 ${targetImageIds.length} 张图片的水印 / 文字区域…`)
    try {
      const detectedRegions = await desktopApi.detectTextRegions(targetImageIds)
      const detectedCount = Object.values(detectedRegions).reduce((count, regions) => count + regions.length, 0)
      setManualTextRegions((current) => {
        const next = { ...current }
        for (const [imageId, regions] of Object.entries(detectedRegions)) {
          const manualRegions = (next[imageId] ?? []).filter((region) => !region.id.includes('-auto-'))
          next[imageId] = [...manualRegions, ...regions]
        }
        return next
      })
      setNotice(detectedCount ? `已在 ${targetImageIds.length} 张图片中检测到 ${detectedCount} 个候选区域，可逐张检查后准备图片。` : '没有检测到明显的边角文字 / 水印区域，可手动框选。')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '批量自动检测失败')
    } finally {
      setIsDetectingTextRegions(false)
      setPreprocessProgress(null)
    }
  }

  useEffect(() => {
    if (view === 'workspace' && !hasLoadedLocalFolder) void loadProject()
  }, [view, hasLoadedLocalFolder])

  useEffect(() => desktopApi.onBatchProgress((event) => {
    if (event.phase === 'prepare' || event.phase === 'detect-text') {
      setPreprocessProgress(event)
      setNotice(`${event.phase === 'detect-text' ? '自动检测' : '准备图片'} ${event.completed} / ${event.total}${event.fileName ? ` · ${event.fileName}` : ''}`)
      return
    }
    setImages((current) => current.map((image) => image.id === event.imageId
      ? { ...image, status: event.status }
      : image))
    if (event.error) setNotice(`图片处理失败：${event.error}`)
  }), [])

  useEffect(() => {
    void desktopApi.getModelStatus().then(setModelStatus).catch((error) => {
      setNotice(error instanceof Error ? error.message : '无法读取本地模型状态')
    })
    void desktopApi.getTextRemovalStatus().then(setTextRemovalStatus).catch(() => {
      setTextRemovalStatus({
        state: 'fallback',
        adapterId: 'local-sharp-inpaint',
        label: '快速修复',
        detail: '无法读取 LaMA 修复状态。',
      })
    })
    return desktopApi.onModelProgress(setModelProgress)
  }, [])

  const installRecommendedModel = async () => {
    setIsManagingModel(true)
    setModelProgress({ downloadedBytes: 0, totalBytes: modelStatus.totalBytes, fileName: '准备下载' })
    try {
      setModelStatus(await desktopApi.installRecommendedModel())
      setNotice('本地 WD14 模型已准备好')
    } catch (error) {
      setModelStatus(await desktopApi.getModelStatus())
      setNotice(error instanceof Error ? error.message : '模型下载失败')
    } finally {
      setIsManagingModel(false)
      setModelProgress(null)
    }
  }

  const removeModel = async () => {
    setIsManagingModel(true)
    try {
      setModelStatus(await desktopApi.removeModel())
      setNotice('已移除本地 WD14 模型')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法移除本地模型')
    } finally {
      setIsManagingModel(false)
    }
  }

  const selectExistingModel = async () => {
    setIsManagingModel(true)
    try {
      const status = await desktopApi.selectExistingModel()
      if (status) {
        setModelStatus(status)
        setNotice('已使用检测到的本地 WD14 模型，无需下载')
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法使用所选模型目录')
    } finally {
      setIsManagingModel(false)
    }
  }

  const refreshTextRemovalStatus = async () => {
    setIsCheckingTextRemovalStatus(true)
    try {
      const status = await desktopApi.getTextRemovalStatus()
      setTextRemovalStatus(status)
      setNotice(status.state === 'ready' ? 'LaMA 去水印已可用' : status.detail)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '无法重新检查 LaMA 去水印状态')
    } finally {
      setIsCheckingTextRemovalStatus(false)
    }
  }

  useEffect(() => {
    if (!currentProject || !hasLoadedLocalFolder) return
    const project: ProjectDto = {
      ...currentProject,
      images: images.filter((image) => image.local).map((image) => ({
        id: image.id,
        name: image.name,
        previewUrl: image.url,
        tags: image.tags,
        originalTags: image.originalTags,
        selected: image.selected,
        status: image.status,
        preparation: image.preparation,
      })),
    }
    const saveTimer = window.setTimeout(() => {
      void desktopApi.saveProject(project).catch((error) => {
        setNotice(error instanceof Error ? error.message : '无法保存项目')
      })
    }, 350)
    return () => window.clearTimeout(saveTimer)
  }, [images, currentProject?.id, hasLoadedLocalFolder])

  const handleFiles = (files: FileList | null, replace = false) => {
    if (!files) return
    const added: DatasetImage[] = createBrowserDatasetImages(files)
    const shouldReplace = replace || images.every((image) => !image.sourceUrl)
    if (shouldReplace && added[0]) added[0].selected = true
    if (shouldReplace) {
      images.forEach((image) => {
        if (image.url.startsWith('blob:')) URL.revokeObjectURL(image.url)
        if (image.sourceUrl?.startsWith('blob:') && image.sourceUrl !== image.url) URL.revokeObjectURL(image.sourceUrl)
      })
      startTransition(() => setImages(added))
      setCurrentProject(null)
      if (replace) {
        const relativePath = files[0]?.webkitRelativePath
        setLocalFolderName(relativePath?.split('/')[0] || '浏览器导入图片')
      } else {
        setLocalFolderName('浏览器导入图片')
      }
    } else {
      startTransition(() => setImages((current) => [...current, ...added]))
    }
    if (added[0]) setActiveId(added[0].id)
    setNotice(`已将 ${added.length} 张图片放上灯箱`)
  }

  const runTagging = async () => {
    const targets = selectedCount ? images.filter((image) => image.selected) : images
    if (!targets.length) return
    const localTargets = targets.filter((image) => image.local)
    if (localTargets.length !== targets.length) {
      setNotice('当前真实打标仅支持从本地文件夹读取的图片')
      return
    }
    if (isDesktop && targets.some((image) => !image.preparation)) {
      setNotice('请先准备训练图片，再生成标签')
      return
    }
    setIsTagging(true)
    setNotice(`正在读取 ${targets.length} 张图片…`)
    setImages((current) => current.map((image) => localTargets.some((target) => target.id === image.id) ? { ...image, status: 'tagging', tags: [] } : image))
    setActiveId(localTargets[0].id)
    try {
      const response = await fetch('/api/tag-local-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: localTargets.map((image) => image.name), threshold }),
      })
      const data = await response.json() as LocalTagResponse & { error?: string }
      if (!response.ok) throw new Error(data.error || '本地打标失败')
      const resultMap = new Map(data.results.map((result) => [result.name, result.tags]))
      const triggerTag = createTag(strategies[trainingType].trigger, trainingType === 'character' ? 'character' : 'general', 1)
      setImages((current) => current.map((image) => {
        const rawTags = resultMap.get(image.name)
        if (!rawTags) return image
        const tags = deduplicateTags([triggerTag, ...rawTags])
        return { ...image, status: 'ready', tags, originalTags: rawTags }
      }))
      setNotice(`真实标签已生成：${data.results.length} 张图片 · ${data.provider}`)
    } catch (error) {
      setImages((current) => current.map((image) => image.status === 'tagging' ? { ...image, status: 'queued' } : image))
      setNotice(error instanceof Error ? error.message : '本地打标失败')
    } finally {
      setIsTagging(false)
    }
  }

  const addTag = () => {
    if (!activeImage) return
    const tag = createTag(newTag)
    if (!tag.name || activeImage.tags.some((item) => item.name === tag.name)) return
    updateImage(activeImage.id, { tags: [...activeImage.tags, tag] })
    setNewTag('')
    setNotice(`已添加“${tag.name.replaceAll('_', ' ')}”`)
  }

  const cleanTags = () => {
    if (!activeImage) return
    const cleaned = deduplicateTags(activeImage.tags.map((tag) => ({ ...tag, name: normalizeDanbooruTag(tag.name) }))).filter((tag) => tag.confidence >= threshold)
    updateImage(activeImage.id, { tags: cleaned })
    setNotice('标签已经整理好')
  }

  const exportDataset = async () => {
    const zip = new JSZip()
    for (const image of images) {
      const baseName = image.name.replace(/\.[^.]+$/, '')
      zip.file(`${baseName}.txt`, serializeDanbooruTags(image.tags))
      if (image.url) {
        const response = await fetch(image.url)
        if (response.ok) {
          const imageBlob = await response.blob()
          zip.file(image.preparation?.outputFilename ?? `${baseName}.jpg`, imageBlob)
        }
      }
    }
    zip.file('dataset-settings.json', JSON.stringify({ format: 'danbooru', trainingType, threshold, triggerWord: strategies[trainingType].trigger, imageCount: images.length }, null, 2))
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'lora-training-dataset.zip'
    link.click()
    URL.revokeObjectURL(url)
    setNotice('训练数据集已导出')
  }

  const removeActiveImage = () => {
    if (!activeImage || !window.confirm(`从项目中移除 ${activeImage.name}？原始图片不会被删除。`)) return
    const nextId = images.find((image) => image.id !== activeImage.id)?.id ?? ''
    setImages((current) => current.filter((image) => image.id !== activeImage.id))
    setActiveId(nextId)
  }

  const toggleRoomTone = () => {
    if (soundOn) {
      noiseGainRef.current?.gain.setTargetAtTime(0, audioContextRef.current?.currentTime ?? 0, .12)
      setSoundOn(false)
      return
    }

    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext
      const context = new AudioContextClass()
      const frameCount = context.sampleRate * 4
      const buffer = context.createBuffer(1, frameCount, context.sampleRate)
      const data = buffer.getChannelData(0)
      let pink0 = 0
      let pink1 = 0
      let pink2 = 0
      for (let index = 0; index < frameCount; index += 1) {
        const white = Math.random() * 2 - 1
        pink0 = .99765 * pink0 + white * .099046
        pink1 = .963 * pink1 + white * .296516
        pink2 = .57 * pink2 + white * 1.052691
        data[index] = (pink0 + pink1 + pink2 + white * .1848) * .055
      }
      const source = context.createBufferSource()
      const filter = context.createBiquadFilter()
      const gain = context.createGain()
      source.buffer = buffer
      source.loop = true
      filter.type = 'lowpass'
      filter.frequency.value = 1150
      filter.Q.value = .3
      gain.gain.value = 0
      source.connect(filter).connect(gain).connect(context.destination)
      source.start()

      const roomHumGain = context.createGain()
      roomHumGain.gain.value = .012
      roomHumGain.connect(gain)
      const oscillators = [55, 82.5].map((frequency, index) => {
        const oscillator = context.createOscillator()
        const oscillatorGain = context.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.value = frequency
        oscillatorGain.gain.value = index === 0 ? .5 : .18
        oscillator.connect(oscillatorGain).connect(roomHumGain)
        oscillator.start()
        return oscillator
      })
      audioContextRef.current = context
      noiseSourceRef.current = source
      noiseGainRef.current = gain
      ambientOscillatorsRef.current = oscillators
    }
    void audioContextRef.current.resume()
    noiseGainRef.current?.gain.setTargetAtTime(.13, audioContextRef.current.currentTime, .35)
    setSoundOn(true)
  }

  const enterWorkspace = () => {
    setIsEntering(true)
    setNotice('正在打开灯箱屏幕…')
    window.setTimeout(() => {
      setView('workspace')
      setIsEntering(false)
      setNotice('工作台已就绪')
    }, 1550)
  }

  const leaveWorkspace = () => {
    setView('room')
    setNotice('已回到暗房')
  }

  return (
    <div className={`experience-shell view-${view} theme-${roomTheme} ${isEntering ? 'is-entering' : ''}`}>
      <button className="sound-toggle" type="button" onClick={toggleRoomTone} aria-label={soundOn ? '关闭暗房环境音' : '打开暗房环境音'}>
        {soundOn ? <Volume2 size={18} /> : <VolumeX size={18} />}
        <span>{soundOn ? '环境音已开启' : '打开环境音'}</span>
      </button>

      <section className="darkroom-scene" aria-label="暗房入口">
        <div className="room-ceiling" /><div className="room-left-wall" /><div className="room-right-wall" /><div className="room-floor" />
        <button className="safe-light" type="button" onClick={() => setRoomTheme((theme) => theme === 'night' ? 'day' : 'night')} aria-label={roomTheme === 'night' ? '切换到白天模式' : '切换到夜间模式'}>
          <span /><em>{roomTheme === 'night' ? '切换白天模式' : '切换夜间模式'}</em>
        </button>
        <div className="photo-line line-back"><i /><i /><i /></div>
        <div className="photo-line line-front"><i /><i /><i /><i /></div>
        <div className="shelf"><span /><span /><span /></div>
        <div className="chemical-bottles"><i /><i /><i /></div>
        <div className="developing-trays"><span /><span /><span /></div>
        <div className="room-table">
          <button className="room-lightbox" type="button" onClick={enterWorkspace}>
            <span className="lightbox-grid" />
            <span className="lightbox-photo photo-a" /><span className="lightbox-photo photo-b" /><span className="lightbox-photo photo-c" />
            <strong><Aperture size={20} />进入图片工作台</strong>
            <small>点击靠近灯箱，开始准备训练素材</small>
          </button>
        </div>
        <div className="screen-transition"><Aperture size={28} /><span>正在打开图片工作台</span></div>
        <div className="room-copy">
          <span>LoRA DARKROOM · 01</span>
          <h1>安静地整理，<br />让图片准备好被学习。</h1>
          <p>点击发光的工作台进入。环境音可以随时关闭。</p>
        </div>
        <div className="entering-status"><DoorOpen size={24} /><span>正在进入暗房工作台</span></div>
      </section>

      <div className={`app-shell ${isTagging ? 'is-tagging' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><Aperture size={22} aria-hidden="true" /></div>
          <div><strong>LoRA 暗房</strong><span>把图片变成训练素材</span></div>
        </div>
        <div className="process">
          <span className="complete"><Check size={14} />选择内容</span><i />
          <span className="complete"><Check size={14} />放入图片</span><i />
          <span className={taggedCount === images.length ? 'complete' : 'current'}>{taggedCount === images.length ? <Check size={14} /> : '3'}检查标签</span>
        </div>
        <div className="top-actions">
          <button className="room-return" type="button" onClick={leaveWorkspace}><LogOut size={17} />返回暗房</button>
          <button className="export-button" type="button" onClick={exportDataset}><Archive size={18} />导出训练数据集</button>
        </div>
      </header>

      <main className="lightroom">
        <div className="lightroom-toolbar">
          <div className="project-title"><span>当前项目</span><strong>{localFolderName ? `本地文件夹：${localFolderName}` : '人物练习集'}</strong><em>{images.length} 张图片 · {taggedCount} 张已完成</em></div>
          <label className="search" htmlFor="search"><Search size={18} /><input id="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索图片或标签" /></label>
          <button className="quiet-button folder-button" type="button" disabled={isTagging} onClick={() => isDesktop ? void selectImageFolder() : folderInput.current?.click()}><FolderOpen size={18} />{isDesktop ? '选择图片文件夹' : '导入图片文件夹'}</button>
          <button className="quiet-button" type="button" onClick={() => fileInput.current?.click()}><ImagePlus size={18} />添加图片</button>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => { handleFiles(event.target.files); event.currentTarget.value = '' }} />
          <input ref={folderInput} type="file" accept="image/*" multiple hidden {...({ webkitdirectory: '', directory: '' } as Record<string, string>)} onChange={(event) => { handleFiles(event.target.files, true); event.currentTarget.value = '' }} />
        </div>

        <section className="light-table" aria-label="图片灯箱">
          <div className="ambient ambient-one" /><div className="ambient ambient-two" />
          <div className="table-heading">
            <div><span className="table-kicker">数字灯箱</span><h1>选择图片，然后让模型帮你写标签。</h1></div>
            <button className="generate-button" type="button" disabled={isTagging || isPreparing} onClick={runTagging}>
              {isTagging ? <LoaderCircle className="spin" size={19} /> : <WandSparkles size={19} />}
              <span><strong>{isTagging ? '正在读取图片…' : selectedCount ? `为选中的 ${selectedCount} 张生成标签` : '为全部图片生成标签'}</strong><small>{isTagging ? '图片会依次亮起' : '生成后只需简单检查'}</small></span>
            </button>
          </div>

          <PreprocessStep
            mode={preprocessMode}
            totalCount={images.length}
            selectedCount={selectedCount}
            batchScope={batchScope}
            preparedCount={preparedCount}
            isPreparing={isPreparing}
            isDetectingTextRegions={isDetectingTextRegions}
            batchProgress={preprocessProgress?.phase === 'prepare' || preprocessProgress?.phase === 'detect-text' ? {
              phase: preprocessProgress.phase,
              completed: preprocessProgress.completed,
              total: preprocessProgress.total,
              fileName: preprocessProgress.fileName,
            } : null}
            completionMessage={preprocessCompletionMessage}
            completionItems={preprocessCompletionItems}
            pendingItems={preprocessPendingItems}
            textRemovalEnabled={textRemovalEnabled}
            manualRegionCount={targetManualRegionCount}
            autoRegionCount={targetAutoRegionCount}
            activeRegionCount={activeTextRegions.length}
            textRemovalStatus={textRemovalStatus}
            isCheckingTextRemovalStatus={isCheckingTextRemovalStatus}
            onModeChange={setPreprocessMode}
            onBatchScopeChange={setBatchScope}
            onTextRemovalChange={setTextRemovalEnabled}
            onAutoDetectTextRegions={() => void autoDetectTextRegions()}
            onClearAutoTextRegions={clearBatchAutoTextRegions}
            onApplyActiveTextRegionsToBatch={applyActiveTextRegionsToBatch}
            onRefreshTextRemovalStatus={() => void refreshTextRemovalStatus()}
            onPrepare={prepareImages}
          />

          <div className="goal-tabs" aria-label="训练目标">
            <span>我想训练</span>
            {(Object.entries(strategies) as [TrainingType, typeof strategies[TrainingType]][]).map(([key, strategy]) => (
              <button key={key} type="button" className={trainingType === key ? 'active' : ''} onClick={() => setTrainingType(key)}>{strategy.label}</button>
            ))}
          </div>

          <div className="film-grid">
            {visibleImages.map((image, index) => (
              <article key={image.id} className={`film-card ${activeId === image.id ? 'focused' : ''} ${image.status === 'tagging' ? 'scanning' : ''}`}>
                <button className="card-open" type="button" aria-label={`查看 ${image.name}`} onClick={() => setActiveId(image.id)} />
                <div className="film-top"><span>{String(index + 1).padStart(2, '0')}</span><i /><em>35mm</em></div>
                <div className={`film-image demo-${index % 4} ${image.local ? 'local-image' : ''}`} style={image.url ? { backgroundImage: `url("${image.url}")` } : undefined}>
                  <div className="scan-line" />
                  <button className={`select-check ${image.selected ? 'checked' : ''}`} type="button" aria-label={`${image.selected ? '取消选择' : '选择'} ${image.name}`} onClick={() => updateImage(image.id, { selected: !image.selected })}>{image.selected ? <Check size={15} strokeWidth={3} /> : null}</button>
                  {image.status === 'tagging' ? <div className="reading-state"><Aperture size={19} className="spin" />正在读取</div> : null}
                </div>
                <div className="film-caption"><strong>{image.name}</strong><span className={image.status === 'failed' ? 'failed' : image.tags.length || image.preparation ? 'ready' : ''}>{image.status === 'failed' ? `准备失败${image.error ? ` · ${image.error}` : ''}` : image.tags.length ? <><CircleCheck size={14} />{image.tags.length} 个标签</> : image.preparation ? <><CircleCheck size={14} />已准备 {image.preparation.outputDimensions.width}×{image.preparation.outputDimensions.height}{image.preparation.textRemoval ? ` · ${image.preparation.textRemoval.fallbackReason ? '快速修复' : 'LaMA 修复'}` : ''}</> : '等待准备图片'}</span></div>
              </article>
            ))}
            <button className="add-film" type="button" onClick={() => fileInput.current?.click()}><span><Plus size={27} /></span><strong>放入更多图片</strong><small>PNG、JPG、WEBP</small></button>
          </div>
        </section>
      </main>

      <aside className="annotation-panel" aria-label="标签编辑器">
        {activeImage ? <>
          <div className="annotation-head">
            <div><span>注释卡</span><strong>{activeImage.name}</strong></div>
            <span className={`completion-pill ${activeImage.tags.length ? 'ready' : ''}`}>{activeImage.tags.length ? '可以检查' : '等待标签'}</span>
          </div>
          <div className="photo-mat">
            <button
              className={`large-preview preview-open demo-${Math.max(0, images.indexOf(activeImage)) % 4} ${activeImage.local ? 'local-image' : ''} ${textRemovalEnabled ? 'text-removal-active' : ''}`}
              type="button"
              aria-label={`放大查看 ${activeImage.name}`}
              style={activeImage.url ? { backgroundImage: `url("${activeImage.url}")` } : undefined}
              onPointerDown={beginTextRegion}
              onPointerMove={updateTextRegion}
              onPointerUp={commitTextRegion}
              onPointerCancel={() => setDraftRegion(null)}
              onClick={() => {
                if (textRemovalEnabled) return
                if (activeImage.url) setLightboxImage({ id: activeImage.id, name: activeImage.name, url: activeImage.url })
              }}
            >
              {[...activeTextRegions, ...(draftRegion ? [draftRegion] : [])].map((region) => region.box ? (
                <span
                  key={region.id}
                  className={`manual-text-region ${region.id === draftRegion?.id ? 'draft' : ''}`}
                  style={{
                    left: `${region.box.x * 100}%`,
                    top: `${region.box.y * 100}%`,
                    width: `${region.box.width * 100}%`,
                    height: `${region.box.height * 100}%`,
                  }}
                />
              ) : null)}
              {activeImage.status === 'tagging' ? <div className="preview-scan"><span /></div> : null}
              <span className="preview-expand"><Maximize2 size={14} />{textRemovalEnabled ? '点击或拖拽框选文字 / 水印' : '放大查看'}</span>
            </button>
            {activeImage.url ? (
              <button
                className="preview-edit-button"
                type="button"
                onClick={() => setLightboxImage({ id: activeImage.id, name: activeImage.name, url: activeImage.url })}
              >
                <Maximize2 size={14} />
                {textRemovalEnabled ? '放大编辑区域' : '放大查看'}
              </button>
            ) : null}
            <span>{strategies[trainingType].label} · {activeImage.name}</span>
          </div>

          {textRemovalEnabled ? (
            <div className="text-region-tools">
              <div>
                <strong>文字 / 水印框</strong>
                <small>{activeTextRegions.length ? `当前图 ${activeTextRegions.length} 个区域` : '点击或拖拽大图添加区域'}</small>
              </div>
              {activeTextRegions.length ? <button type="button" onClick={clearActiveTextRegions}>清空当前图</button> : null}
              {activeTextRegions.map((region, index) => (
                <button key={region.id} type="button" onClick={() => removeTextRegion(activeImage.id, region.id)}>
                  删除区域 {index + 1}
                </button>
              ))}
            </div>
          ) : null}

          <section className="tag-section">
            <div className="section-title"><div><h2>这张图片里有什么？</h2><p>删掉不准确的内容，保留你希望模型学会的内容。</p></div><button type="button" onClick={cleanTags}>自动整理</button></div>
            <div className={`tag-note ${activeImage.status === 'tagging' ? 'receiving' : ''}`}>
              {activeImage.tags.map((tag) => <TagChip key={tag.name} tag={tag} emerging={isTagging} onRemove={() => updateImage(activeImage.id, { tags: activeImage.tags.filter((item) => item.name !== tag.name) })} />)}
              {!activeImage.tags.length && activeImage.status !== 'tagging' ? <div className="empty-tags"><Sparkles size={25} /><strong>等待生成标签</strong><span>点击灯箱上的紫色按钮开始。</span></div> : null}
              {activeImage.status === 'tagging' ? <div className="typing-tags"><i /><i /><i /></div> : null}
            </div>
            <div className="tag-input"><input value={newTag} onChange={(event) => setNewTag(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && addTag()} placeholder="添加一个标签，例如 blue eyes" /><button type="button" onClick={addTag}><Plus size={17} />添加</button></div>
            <p className="friendly-hint">直接输入普通文字即可，导出时会自动转换成训练格式。</p>
          </section>

          <section className="advanced">
            <button type="button" onClick={() => setShowAdvanced((current) => !current)}><Settings2 size={17} /><span><strong>高级设置</strong><small>大多数情况下不用修改</small></span>{showAdvanced ? <ChevronDown size={18} /> : <ChevronRight size={18} />}</button>
            {showAdvanced ? <div className="advanced-body">
              <label>触发词<input value={strategies[trainingType].trigger} readOnly /></label>
              <label>标签筛选<input type="range" min=".1" max=".95" step=".05" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /></label>
              <p>向右调会减少不确定的标签。默认设置适合大多数情况。</p>
              <ModelSetupPanel
                status={modelStatus}
                progress={modelProgress}
                isBusy={isManagingModel}
                allowSelectExisting={isDesktop}
                allowRemove={isDesktop}
                onInstall={() => void installRecommendedModel()}
                onSelectExisting={() => void selectExistingModel()}
                onRemove={() => void removeModel()}
              />
            </div> : null}
          </section>
          <button className="remove-button" type="button" onClick={removeActiveImage}><Trash2 size={16} />从项目中移除</button>
        </> : <div className="empty-panel"><Images size={36} /><p>放入图片后，就可以在这里检查标签。</p></div>}
      </aside>

      <div className="toast" aria-live="polite">{notice}</div>
      <ImageLightbox
        image={lightboxImage}
        textRemoval={lightboxImage && textRemovalEnabled ? {
          regions: manualTextRegions[lightboxImage.id] ?? [],
          prepareStatus: lightboxPrepareBlockReason ?? undefined,
          prepareDisabled: isPreparing,
          prepareBusy: isPreparing,
          onAddRegion: (region) => addTextRegion(lightboxImage.id, region),
          onRemoveRegion: (regionId) => removeTextRegion(lightboxImage.id, regionId),
          onClearRegions: () => setManualTextRegions((current) => ({ ...current, [lightboxImage.id]: [] })),
          onPrepare: async (regions) => {
            const message = await prepareImages({ ...manualTextRegions, [lightboxImage.id]: regions })
            return message
          },
        } : undefined}
        onClose={() => setLightboxImage(null)}
      />
      </div>
    </div>
  )
}

export default App
