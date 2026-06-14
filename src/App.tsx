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
import type { ProjectDto, ProjectImageStatus } from './types/project'

type TrainingType = 'character' | 'style' | 'concept'
type ImageStatus = ProjectImageStatus

type DatasetImage = {
  id: string
  name: string
  url: string
  tags: DanbooruTag[]
  originalTags: DanbooruTag[]
  selected: boolean
  status: ImageStatus
  local?: boolean
}

type LocalTagResponse = {
  provider: string
  results: Array<{ name: string; tags: DanbooruTag[] }>
}

const desktopApi = getDesktopApi()

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
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [threshold, setThreshold] = useState(.35)
  const [notice, setNotice] = useState('暗房已准备好')
  const [localFolderName, setLocalFolderName] = useState('')
  const [hasLoadedLocalFolder, setHasLoadedLocalFolder] = useState(false)
  const [currentProject, setCurrentProject] = useState<ProjectDto | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const noiseSourceRef = useRef<AudioBufferSourceNode | null>(null)
  const noiseGainRef = useRef<GainNode | null>(null)
  const ambientOscillatorsRef = useRef<OscillatorNode[]>([])
  const deferredSearch = useDeferredValue(search)

  const activeImage = images.find((image) => image.id === activeId) ?? images[0]
  const selectedCount = images.reduce((count, image) => count + Number(image.selected), 0)
  const taggedCount = images.reduce((count, image) => count + Number(image.tags.length > 0), 0)
  const visibleImages = useMemo(() => {
    const query = normalizeDanbooruTag(deferredSearch)
    if (!query) return images
    return images.filter((image) => image.name.toLowerCase().includes(query) || image.tags.some((tag) => tag.name.includes(query)))
  }, [images, deferredSearch])

  const updateImage = (id: string, patch: Partial<DatasetImage>) => {
    setImages((current) => current.map((image) => image.id === id ? { ...image, ...patch } : image))
  }

  const applyProject = (project: ProjectDto) => {
    const projectImages: DatasetImage[] = project.images.map((image) => ({
      id: image.id,
      name: image.name,
      url: image.previewUrl,
      tags: image.tags,
      originalTags: image.originalTags,
      selected: image.selected,
      status: image.status,
      local: true,
    }))
    startTransition(() => setImages(projectImages))
    setActiveId(projectImages[0]?.id ?? '')
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

  useEffect(() => {
    if (view === 'workspace' && !hasLoadedLocalFolder) void loadProject()
  }, [view, hasLoadedLocalFolder])

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
      })),
    }
    const saveTimer = window.setTimeout(() => {
      void desktopApi.saveProject(project).catch((error) => {
        setNotice(error instanceof Error ? error.message : '无法保存项目')
      })
    }, 350)
    return () => window.clearTimeout(saveTimer)
  }, [images, currentProject?.id, hasLoadedLocalFolder])

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    const added = Array.from(files).flatMap((file) => file.type.startsWith('image/') ? [{
      id: crypto.randomUUID(),
      name: file.name,
      url: URL.createObjectURL(file),
      tags: [],
      originalTags: [],
      selected: false,
      status: 'queued' as ImageStatus,
    }] : [])
    startTransition(() => setImages((current) => [...current, ...added]))
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
    images.forEach((image) => zip.file(`${image.name.replace(/\.[^.]+$/, '')}.txt`, serializeDanbooruTags(image.tags)))
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
          <button className="quiet-button folder-button" type="button" disabled={isTagging} onClick={selectImageFolder}><FolderOpen size={18} />选择图片文件夹</button>
          <button className="quiet-button" type="button" onClick={() => fileInput.current?.click()}><ImagePlus size={18} />添加图片</button>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => handleFiles(event.target.files)} />
        </div>

        <section className="light-table" aria-label="图片灯箱">
          <div className="ambient ambient-one" /><div className="ambient ambient-two" />
          <div className="table-heading">
            <div><span className="table-kicker">数字灯箱</span><h1>选择图片，然后让模型帮你写标签。</h1></div>
            <button className="generate-button" type="button" disabled={isTagging} onClick={runTagging}>
              {isTagging ? <LoaderCircle className="spin" size={19} /> : <WandSparkles size={19} />}
              <span><strong>{isTagging ? '正在读取图片…' : selectedCount ? `为选中的 ${selectedCount} 张生成标签` : '为全部图片生成标签'}</strong><small>{isTagging ? '图片会依次亮起' : '生成后只需简单检查'}</small></span>
            </button>
          </div>

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
                <div className="film-caption"><strong>{image.name}</strong><span className={image.tags.length ? 'ready' : ''}>{image.tags.length ? <><CircleCheck size={14} />{image.tags.length} 个标签</> : '等待生成标签'}</span></div>
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
            <div className={`large-preview demo-${Math.max(0, images.indexOf(activeImage)) % 4} ${activeImage.local ? 'local-image' : ''}`} style={activeImage.url ? { backgroundImage: `url("${activeImage.url}")` } : undefined}>
              {activeImage.status === 'tagging' ? <div className="preview-scan"><span /></div> : null}
            </div>
            <span>{strategies[trainingType].label} · {activeImage.name}</span>
          </div>

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
            {showAdvanced ? <div className="advanced-body"><label>触发词<input value={strategies[trainingType].trigger} readOnly /></label><label>标签筛选<input type="range" min=".1" max=".95" step=".05" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} /></label><p>向右调会减少不确定的标签。默认设置适合大多数情况。</p></div> : null}
          </section>
          <button className="remove-button" type="button" onClick={removeActiveImage}><Trash2 size={16} />从项目中移除</button>
        </> : <div className="empty-panel"><Images size={36} /><p>放入图片后，就可以在这里检查标签。</p></div>}
      </aside>

      <div className="toast" aria-live="polite">{notice}</div>
      </div>
    </div>
  )
}

export default App
