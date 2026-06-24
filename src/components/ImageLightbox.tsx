import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { CircleCheck, LoaderCircle, Maximize2, Minus, Plus, ScanLine, X } from 'lucide-react'
import { finalizeDraftTextRegion } from '../text-regions'
import type { TextRegion } from '../types/text-removal'

type LightboxImage = {
  id?: string
  name: string
  url: string
}

type ImageLightboxProps = {
  image: LightboxImage | null
  textRemoval?: {
    regions: TextRegion[]
    prepareStatus?: string
    prepareDisabled?: boolean
    prepareBusy?: boolean
    prepareTone?: 'info' | 'success' | 'error'
    onAddRegion: (region: TextRegion) => void
    onRemoveRegion: (regionId: string) => void
    onClearRegions: () => void
    onPrepare: (regions: TextRegion[]) => string | void | Promise<string | void>
  }
  onClose: () => void
}

const minimumScale = 1
const maximumScale = 5
const scaleStep = .5

export function ImageLightbox({ image, textRemoval, onClose }: ImageLightboxProps) {
  const [scale, setScale] = useState(minimumScale)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [draftRegion, setDraftRegion] = useState<TextRegion | null>(null)
  const [prepareFeedback, setPrepareFeedback] = useState('')
  const [isPreparing, setIsPreparing] = useState(false)
  const dragStart = useRef<{ pointerX: number; pointerY: number; offsetX: number; offsetY: number } | null>(null)

  useEffect(() => {
    if (!image) return
    setScale(minimumScale)
    setOffset({ x: 0, y: 0 })
    setDraftRegion(null)
    setPrepareFeedback('')
    setIsPreparing(false)
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [image, onClose])

  if (!image) return null

  const textRemovalEnabled = Boolean(textRemoval && image.id)
  const editableRegions = textRemoval?.regions ?? []
  const prepareIsBusy = isPreparing || Boolean(textRemoval?.prepareBusy)
  const visiblePrepareStatus = prepareFeedback || textRemoval?.prepareStatus
  const visiblePrepareTone = prepareIsBusy
    ? 'loading'
    : textRemoval?.prepareTone
      ?? (visiblePrepareStatus?.includes('失败') || visiblePrepareStatus?.includes('错误')
        ? 'error'
        : visiblePrepareStatus?.includes('已用') || visiblePrepareStatus?.includes('完成')
          ? 'success'
          : 'info')

  const updateScale = (nextScale: number) => {
    const clampedScale = Math.min(maximumScale, Math.max(minimumScale, nextScale))
    setScale(clampedScale)
    if (clampedScale === minimumScale) setOffset({ x: 0, y: 0 })
  }

  const resetView = () => {
    setScale(minimumScale)
    setOffset({ x: 0, y: 0 })
  }

  const handleWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    updateScale(scale + (event.deltaY < 0 ? scaleStep : -scaleStep))
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (scale === minimumScale) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStart.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return
    setOffset({
      x: dragStart.current.offsetX + event.clientX - dragStart.current.pointerX,
      y: dragStart.current.offsetY + event.clientY - dragStart.current.pointerY,
    })
  }

  const stopDragging = () => {
    dragStart.current = null
  }

  const getRegionPoint = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    }
  }

  const beginTextRegion = (event: PointerEvent<HTMLDivElement>) => {
    if (!textRemovalEnabled || !image.id || scale !== minimumScale) return
    event.stopPropagation()
    const point = getRegionPoint(event)
    setDraftRegion({ id: `${image.id}-${Date.now()}-lightbox`, box: { x: point.x, y: point.y, width: 0, height: 0 }, confidence: 1 })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const updateTextRegion = (event: PointerEvent<HTMLDivElement>) => {
    if (!textRemovalEnabled || !draftRegion?.box || scale !== minimumScale) return
    event.stopPropagation()
    const point = getRegionPoint(event)
    setDraftRegion({
      ...draftRegion,
      box: {
        x: Math.min(draftRegion.box.x, point.x),
        y: Math.min(draftRegion.box.y, point.y),
        width: Math.abs(point.x - draftRegion.box.x),
        height: Math.abs(point.y - draftRegion.box.y),
      },
    })
  }

  const commitTextRegion = () => {
    if (!textRemoval || !image.id || !draftRegion?.box) {
      setDraftRegion(null)
      return
    }
    const finalizedRegion = finalizeDraftTextRegion(image.id, draftRegion, `${image.id}-${Date.now()}-lightbox-click`)
    if (finalizedRegion) textRemoval.onAddRegion(finalizedRegion)
    setDraftRegion(null)
  }

  const handlePrepare = async () => {
    if (!textRemoval || prepareIsBusy) return
    setIsPreparing(true)
    setPrepareFeedback('正在准备图片，请稍等。LaMA 修复通常需要十几秒。')
    try {
      const message = await textRemoval.onPrepare(editableRegions)
      setPrepareFeedback(message || '准备请求已发送。')
    } catch (error) {
      setPrepareFeedback(error instanceof Error ? error.message : '准备图片失败。')
    } finally {
      setIsPreparing(false)
    }
  }

  return (
    <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={`查看大图 ${image.name}`} onClick={onClose}>
      <div
        className={`lightbox-stage ${scale > minimumScale ? 'zoomed' : ''} ${textRemovalEnabled ? 'editing' : ''}`}
        onClick={(event) => event.stopPropagation()}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        <div
          className="lightbox-image-frame"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
          onPointerDown={beginTextRegion}
          onPointerMove={updateTextRegion}
          onPointerUp={commitTextRegion}
          onPointerCancel={() => setDraftRegion(null)}
        >
          <img src={image.url} alt={image.name} draggable={false} />
          {[...editableRegions, ...(draftRegion ? [draftRegion] : [])].map((region) => region.box ? (
            <span
              key={region.id}
              className={`manual-text-region lightbox-region ${region.id === draftRegion?.id ? 'draft' : ''}`}
              style={{
                left: `${region.box.x * 100}%`,
                top: `${region.box.y * 100}%`,
                width: `${region.box.width * 100}%`,
                height: `${region.box.height * 100}%`,
              }}
            />
          ) : null)}
        </div>
      </div>
      <div className="lightbox-title">
        <Maximize2 size={15} />
        <strong>{image.name}</strong>
        <span>{textRemovalEnabled ? '点击或拖拽图片框选文字 / 水印 · Esc 退出' : '滚轮缩放 · 拖动查看 · Esc 退出'}</span>
      </div>
      {textRemoval ? (
        <div className="lightbox-edit-panel" onClick={(event) => event.stopPropagation()}>
          <div>
            <strong><ScanLine size={15} />大图去水印编辑</strong>
            <span>{editableRegions.length ? `已选 ${editableRegions.length} 个区域，下一步点准备图片。` : '点击或拖拽图片框选文字 / 水印。'}</span>
          </div>
          {prepareIsBusy ? (
            <div className="lightbox-progress" aria-live="polite">
              <span className="lightbox-progress-icon"><LoaderCircle className="spin" size={15} /></span>
              <strong>LaMA 正在修复</strong>
              <small>正在根据选中的区域生成干净图，通常需要十几秒。</small>
              <i />
            </div>
          ) : null}
          {visiblePrepareTone === 'success' ? (
            <div className="lightbox-success" aria-live="polite"><CircleCheck size={15} />修复完成</div>
          ) : null}
          {visiblePrepareStatus ? <p className={`lightbox-edit-status ${visiblePrepareTone}`}>{visiblePrepareStatus}</p> : null}
          <button type="button" disabled={textRemoval.prepareDisabled || prepareIsBusy} onClick={handlePrepare}>
            {prepareIsBusy ? '正在准备...' : '准备图片'}
          </button>
          {editableRegions.length ? <button type="button" onClick={textRemoval.onClearRegions}>清空区域</button> : null}
          {editableRegions.map((region, index) => (
            <button key={region.id} type="button" onClick={() => textRemoval.onRemoveRegion(region.id)}>
              删除区域 {index + 1}
            </button>
          ))}
        </div>
      ) : null}
      <div className="lightbox-controls" onClick={(event) => event.stopPropagation()}>
        <button type="button" aria-label="缩小图片" disabled={scale === minimumScale} onClick={() => updateScale(scale - scaleStep)}><Minus size={17} /></button>
        <button type="button" aria-label="恢复原始大小" onClick={resetView}>{Math.round(scale * 100)}%</button>
        <button type="button" aria-label="放大图片" disabled={scale === maximumScale} onClick={() => updateScale(scale + scaleStep)}><Plus size={17} /></button>
      </div>
      <button className="lightbox-close" type="button" aria-label="关闭大图" onClick={onClose}><X size={20} /></button>
    </div>
  )
}
