import { CheckCircle2, Copy, Crop, Eraser, Frame, LoaderCircle, ScanLine } from 'lucide-react'
import type { PreprocessMode } from '../types/preprocessing'
import type { TextRemovalEngineStatus } from '../types/text-removal'

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
  selectedCount: number
  batchScope: 'all' | 'selected'
  preparedCount: number
  isPreparing: boolean
  isDetectingTextRegions?: boolean
  batchProgress?: {
    phase: 'detect-text' | 'prepare'
    completed: number
    total: number
    fileName?: string
  } | null
  completionMessage?: string
  completionItems?: Array<{
    imageId: string
    name: string
    status: 'cleaned' | 'prepared' | 'skipped' | 'failed'
    detail: string
  }>
  pendingItems?: Array<{
    imageId: string
    name: string
    status: 'will-clean' | 'skipped'
    detail: string
  }>
  textRemovalEnabled: boolean
  manualRegionCount: number
  autoRegionCount?: number
  activeRegionCount?: number
  textRemovalStatus?: TextRemovalEngineStatus
  isCheckingTextRemovalStatus?: boolean
  onModeChange: (mode: PreprocessMode) => void
  onBatchScopeChange: (scope: 'all' | 'selected') => void
  onTextRemovalChange: (enabled: boolean) => void
  onAutoDetectTextRegions: () => void
  onClearAutoTextRegions?: () => void
  onApplyActiveTextRegionsToBatch?: () => void
  onRefreshTextRemovalStatus?: () => void
  onPrepare: () => void
}

export function PreprocessStep({
  mode,
  totalCount,
  selectedCount,
  batchScope,
  preparedCount,
  isPreparing,
  isDetectingTextRegions = false,
  batchProgress,
  completionMessage,
  completionItems = [],
  pendingItems = [],
  textRemovalEnabled,
  manualRegionCount,
  autoRegionCount = 0,
  activeRegionCount = 0,
  textRemovalStatus,
  isCheckingTextRemovalStatus = false,
  onModeChange,
  onBatchScopeChange,
  onTextRemovalChange,
  onAutoDetectTextRegions,
  onClearAutoTextRegions,
  onApplyActiveTextRegionsToBatch,
  onRefreshTextRemovalStatus,
  onPrepare,
}: PreprocessStepProps) {
  const selectedMode = modes.find((item) => item.id === mode) ?? modes[0]
  const batchCount = batchScope === 'selected' ? selectedCount : totalCount
  const progressPercent = batchProgress?.total ? Math.max(0, Math.min(100, Math.round((batchProgress.completed / batchProgress.total) * 100))) : 0
  const progressIsFinishing = Boolean(batchProgress?.total && batchProgress.completed >= batchProgress.total)
  const pendingCleanCount = pendingItems.filter((item) => item.status === 'will-clean').length
  const pendingSkipCount = pendingItems.filter((item) => item.status === 'skipped').length

  return (
    <section className="preprocess-step" aria-labelledby="preprocess-title">
      <div className="preprocess-copy">
        <span>打标前 · 准备训练图</span>
        <h2 id="preprocess-title">先统一图片尺寸，再让模型看图。</h2>
        <p>{selectedMode.warning}</p>
        <dl className="preprocess-summary">
          <div>
            <dt>本次范围</dt>
            <dd>{batchScope === 'selected' ? `已勾选 ${batchCount} 张` : `全部 ${batchCount} 张`}</dd>
          </div>
          <div>
            <dt>水印框</dt>
            <dd>{textRemovalEnabled ? `${manualRegionCount} 个` : '未开启'}</dd>
          </div>
        </dl>
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
        <div className="batch-scope-control" role="radiogroup" aria-label="处理范围">
          <span>处理范围</span>
          <button type="button" role="radio" aria-checked={batchScope === 'all'} className={batchScope === 'all' ? 'active' : ''} onClick={() => onBatchScopeChange('all')}>
            全部 {totalCount} 张
          </button>
          <button type="button" role="radio" aria-checked={batchScope === 'selected'} className={batchScope === 'selected' ? 'active' : ''} disabled={selectedCount === 0} onClick={() => onBatchScopeChange('selected')}>
            仅已勾选 {selectedCount} 张
          </button>
        </div>
        <label className="text-removal-toggle" title={textRemovalStatus?.detail}>
          <input type="checkbox" checked={textRemovalEnabled} onChange={(event) => onTextRemovalChange(event.target.checked)} />
          <span>Remove text / watermark</span>
          <small>本次 {manualRegionCount} 个框 · {textRemovalStatus?.label ?? '检测修复器...'}</small>
        </label>
        {textRemovalEnabled && textRemovalStatus?.state === 'fallback' ? (
          <div className="text-removal-recovery">
            <strong>{textRemovalStatus.label}</strong>
            <span>{textRemovalStatus.detail}</span>
            {onRefreshTextRemovalStatus ? (
              <button type="button" onClick={onRefreshTextRemovalStatus} disabled={isCheckingTextRemovalStatus}>
                {isCheckingTextRemovalStatus ? <LoaderCircle className="spin" size={13} /> : null}
                {isCheckingTextRemovalStatus ? '正在检查...' : '重新检查'}
              </button>
            ) : null}
          </div>
        ) : null}
        <button
          className="detect-text-button"
          type="button"
          disabled={isPreparing || isDetectingTextRegions || batchCount === 0 || !textRemovalEnabled}
          onClick={onAutoDetectTextRegions}
        >
          {isDetectingTextRegions ? <LoaderCircle className="spin" size={16} /> : <ScanLine size={16} />}
          {isDetectingTextRegions ? '正在检测...' : '批量自动检测'}
        </button>
        {textRemovalEnabled ? (
          <div className="text-region-bulk-tools">
            <div>
              <strong>批量框选</strong>
              <span>自动 {autoRegionCount} 个 · 当前图 {activeRegionCount} 个</span>
            </div>
            <button
              type="button"
              disabled={isPreparing || isDetectingTextRegions || autoRegionCount === 0}
              onClick={onClearAutoTextRegions}
            >
              <Eraser size={14} />
              清空自动检测框
            </button>
            <button
              type="button"
              disabled={isPreparing || isDetectingTextRegions || activeRegionCount === 0 || batchCount === 0}
              onClick={onApplyActiveTextRegionsToBatch}
            >
              <Copy size={14} />
              套用当前图区域
            </button>
          </div>
        ) : null}
        {batchProgress ? (
          <div className="batch-progress-panel" aria-live="polite">
            <div>
              <strong>
                {progressIsFinishing
                  ? (batchProgress.phase === 'detect-text' ? '检测完成，正在刷新' : '准备完成，正在刷新')
                  : (batchProgress.phase === 'detect-text' ? '正在自动检测' : '正在准备图片')}
              </strong>
              <span>{batchProgress.completed} / {batchProgress.total}</span>
            </div>
            <i><b style={{ width: `${progressPercent}%` }} /></i>
            {batchProgress.fileName ? <small>{batchProgress.fileName}</small> : null}
          </div>
        ) : null}
        {completionMessage && !batchProgress ? (
          <div className="preprocess-completion" aria-live="polite">
            <CheckCircle2 size={15} />
            <span>{completionMessage}</span>
          </div>
        ) : null}
        {completionItems.length && !batchProgress ? (
          <div className="preprocess-result-list">
            {completionItems.map((item) => (
              <div key={item.imageId} className={`preprocess-result-item ${item.status}`}>
                <strong>{item.name}</strong>
                <span>{item.detail}</span>
              </div>
            ))}
          </div>
        ) : null}
        {pendingItems.length && !batchProgress && !completionItems.length ? (
          <details className="preprocess-result-list pending">
            <summary>
              <strong>准备前检查</strong>
              <span>{pendingCleanCount} 张待去水印 · {pendingSkipCount} 张无框跳过</span>
            </summary>
            {pendingItems.map((item) => (
              <div key={item.imageId} className={`preprocess-result-item ${item.status}`}>
                <strong>{item.name}</strong>
                <span>{item.detail}</span>
              </div>
            ))}
          </details>
        ) : null}
        <span>{preparedCount === totalCount && totalCount > 0 ? <CheckCircle2 size={15} /> : null}已准备 {preparedCount} / {totalCount}</span>
        <button type="button" disabled={isPreparing || isDetectingTextRegions || batchCount === 0} onClick={() => onPrepare()}>
          {isPreparing ? <LoaderCircle className="spin" size={17} /> : null}
          {isPreparing ? '正在准备图片...' : `准备 ${batchCount} 张图片`}
        </button>
      </div>
    </section>
  )
}
