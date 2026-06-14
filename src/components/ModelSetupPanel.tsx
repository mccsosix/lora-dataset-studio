import { CircleCheck, Download, ExternalLink, FolderSearch, LoaderCircle, RotateCw, Trash2, TriangleAlert } from 'lucide-react'
import type { ModelDownloadProgress, ModelStatus } from '../types/model'

type ModelSetupPanelProps = {
  status: ModelStatus
  progress: ModelDownloadProgress | null
  isBusy: boolean
  allowSelectExisting?: boolean
  allowRemove?: boolean
  onInstall: () => void
  onSelectExisting: () => void
  onRemove: () => void
}

const statusCopy: Record<ModelStatus['state'], string> = {
  unavailable: '网页模式暂不管理本地模型',
  absent: '尚未下载本地模型',
  partial: '上次下载尚未完成',
  ready: '本地模型已就绪',
  external: '检测到已有本地模型',
  corrupt: '模型文件损坏，需要重新下载',
  'upgrade-available': '有推荐模型更新',
  'upgrade-failed': '更新失败，旧版本仍然可用',
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

export function ModelSetupPanel({ status, progress, isBusy, allowSelectExisting = true, allowRemove = true, onInstall, onSelectExisting, onRemove }: ModelSetupPanelProps) {
  const percent = progress ? Math.min(100, Math.round(progress.downloadedBytes / progress.totalBytes * 100)) : 0
  const canInstall = status.state !== 'ready' && status.state !== 'external' && status.state !== 'unavailable'
  const retry = status.state === 'partial' || status.state === 'corrupt' || status.state === 'upgrade-failed'

  return (
    <section className="model-setup-panel" aria-label="本地 WD14 模型">
      <div className="model-setup-heading">
        <span>{status.state === 'ready' || status.state === 'external' ? <CircleCheck size={16} /> : <TriangleAlert size={16} />}</span>
        <div><strong>{statusCopy[status.state]}</strong><small>{status.name}</small></div>
      </div>
      {status.state !== 'unavailable' ? <>
        <dl>
          <div><dt>推荐版本</dt><dd>{status.recommendedVersion.slice(0, 12)}</dd></div>
          {status.installedVersion ? <div><dt>已安装</dt><dd>{status.installedVersion.slice(0, 12)}</dd></div> : null}
          <div><dt>下载大小</dt><dd>{formatBytes(status.totalBytes)}</dd></div>
        </dl>
        {progress ? <div className="model-progress"><span style={{ width: `${percent}%` }} /><strong>{percent}% · {progress.fileName}</strong></div> : null}
        {status.error ? <p className="model-error">{status.error}</p> : null}
        <div className="model-actions">
          <a href={status.licenseUrl} target="_blank" rel="noreferrer">查看模型许可 <ExternalLink size={12} /></a>
          {canInstall ? <button type="button" disabled={isBusy} onClick={onInstall}>{isBusy ? <LoaderCircle className="spin" size={14} /> : retry ? <RotateCw size={14} /> : <Download size={14} />}{retry ? '重试下载' : '下载推荐模型'}</button> : null}
          {allowSelectExisting ? <button type="button" disabled={isBusy} onClick={onSelectExisting}><FolderSearch size={14} />选择已有模型</button> : null}
          {status.installedVersion && allowRemove ? <button className="model-remove" type="button" disabled={isBusy} onClick={onRemove}><Trash2 size={14} />移除模型</button> : null}
        </div>
      </> : <p>网页工作台可以继续整理图片；本地 WD14 下载将在桌面应用中提供。</p>}
    </section>
  )
}
