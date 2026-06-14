import { CheckCircle2, Crop, Frame, LoaderCircle, ScanLine } from 'lucide-react'
import type { PreprocessMode } from '../types/preprocessing'

const modes: Array<{
  id: PreprocessMode
  label: string
  detail: string
  warning: string
  icon: typeof Frame
}> = [
  {
    id: 'preserve-aspect',
    label: '保留原图比例',
    detail: '推荐用于 SDXL bucket，不裁切、不加边。',
    warning: '小图默认不会放大，尽量保留原始细节。',
    icon: ScanLine,
  },
  {
    id: 'white-padding',
    label: '补成 1024 方图',
    detail: '完整保留画面，用白色填满空白区域。',
    warning: '白边可能会被 LoRA 学进去。',
    icon: Frame,
  },
  {
    id: 'center-crop',
    label: '居中裁成方图',
    detail: '铺满 1024 方图，适合主体位于中央的图片。',
    warning: '画面边缘的重要内容可能被裁掉。',
    icon: Crop,
  },
]

type PreprocessStepProps = {
  mode: PreprocessMode
  totalCount: number
  preparedCount: number
  isPreparing: boolean
  onModeChange: (mode: PreprocessMode) => void
  onPrepare: () => void
}

export function PreprocessStep({
  mode,
  totalCount,
  preparedCount,
  isPreparing,
  onModeChange,
  onPrepare,
}: PreprocessStepProps) {
  const selectedMode = modes.find((item) => item.id === mode) ?? modes[0]

  return (
    <section className="preprocess-step" aria-labelledby="preprocess-title">
      <div className="preprocess-copy">
        <span>打标前 · 准备训练图</span>
        <h2 id="preprocess-title">先统一图片尺寸，再让模型看图。</h2>
        <p>{selectedMode.warning}</p>
      </div>
      <div className="preprocess-modes" role="radiogroup" aria-label="图片准备方式">
        {modes.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={mode === item.id}
              className={mode === item.id ? 'active' : ''}
              onClick={() => onModeChange(item.id)}
            >
              <Icon size={17} />
              <span><strong>{item.label}</strong><small>{item.detail}</small></span>
            </button>
          )
        })}
      </div>
      <div className="preprocess-action">
        <span>{preparedCount === totalCount && totalCount > 0 ? <CheckCircle2 size={15} /> : null}已准备 {preparedCount} / {totalCount}</span>
        <button type="button" disabled={isPreparing || totalCount === 0} onClick={onPrepare}>
          {isPreparing ? <LoaderCircle className="spin" size={17} /> : null}
          {isPreparing ? '正在准备图片…' : `准备 ${totalCount} 张图片`}
        </button>
      </div>
    </section>
  )
}
