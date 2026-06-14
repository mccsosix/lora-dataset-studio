import { useEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { Maximize2, Minus, Plus, X } from 'lucide-react'

type LightboxImage = {
  name: string
  url: string
}

type ImageLightboxProps = {
  image: LightboxImage | null
  onClose: () => void
}

const minimumScale = 1
const maximumScale = 5
const scaleStep = .5

export function ImageLightbox({ image, onClose }: ImageLightboxProps) {
  const [scale, setScale] = useState(minimumScale)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragStart = useRef<{ pointerX: number; pointerY: number; offsetX: number; offsetY: number } | null>(null)

  useEffect(() => {
    if (!image) return
    setScale(minimumScale)
    setOffset({ x: 0, y: 0 })
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [image, onClose])

  if (!image) return null

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

  return (
    <div className="image-lightbox" role="dialog" aria-modal="true" aria-label={`查看大图 ${image.name}`} onClick={onClose}>
      <div
        className={`lightbox-stage ${scale > minimumScale ? 'zoomed' : ''}`}
        onClick={(event) => event.stopPropagation()}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
      >
        <img
          src={image.url}
          alt={image.name}
          draggable={false}
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
        />
      </div>
      <div className="lightbox-title"><Maximize2 size={15} /><strong>{image.name}</strong><span>滚轮缩放 · 拖动查看 · Esc 退出</span></div>
      <div className="lightbox-controls" onClick={(event) => event.stopPropagation()}>
        <button type="button" aria-label="缩小图片" disabled={scale === minimumScale} onClick={() => updateScale(scale - scaleStep)}><Minus size={17} /></button>
        <button type="button" aria-label="恢复原始大小" onClick={resetView}>{Math.round(scale * 100)}%</button>
        <button type="button" aria-label="放大图片" disabled={scale === maximumScale} onClick={() => updateScale(scale + scaleStep)}><Plus size={17} /></button>
      </div>
      <button className="lightbox-close" type="button" aria-label="关闭大图" onClick={onClose}><X size={20} /></button>
    </div>
  )
}
