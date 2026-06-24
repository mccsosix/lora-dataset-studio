type TextRemovalPrepareOptions = {
  isDesktop: boolean
  textRemovalEnabled: boolean
  manualRegionCount: number
}

export function getTextRemovalPrepareBlockReason({
  isDesktop,
  textRemovalEnabled,
  manualRegionCount,
}: TextRemovalPrepareOptions): string | null {
  if (!textRemovalEnabled) return null
  if (!isDesktop) return '网页模式只能预览框选区域；要运行 LaMA 去水印，请打开桌面应用。'
  if (manualRegionCount === 0) return '已开启去水印，请先在右侧大图上点击或拖拽框选要清理的文字或水印。'
  return null
}
