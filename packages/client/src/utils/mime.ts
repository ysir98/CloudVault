/** 根据 MIME 类型或文件扩展名判断文件类别 */

export type FileCategory = 'image' | 'video' | 'audio' | 'document' | 'code' | 'archive' | 'other'

const EXT_MAP: Record<string, FileCategory> = {
  // 图片
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image',
  webp: 'image', svg: 'image', bmp: 'image', ico: 'image', avif: 'image',
  // 视频（MPEG-TS 使用 .m2ts，不用 .ts 避免与 TypeScript 冲突）
  mp4: 'video', webm: 'video', mkv: 'video', mov: 'video',
  avi: 'video', flv: 'video', wmv: 'video', m2ts: 'video', mts: 'video',
  // 音频
  mp3: 'audio', flac: 'audio', wav: 'audio', aac: 'audio',
  ogg: 'audio', m4a: 'audio', opus: 'audio',
  // 文档
  pdf: 'document', txt: 'document', md: 'document',
  doc: 'document', docx: 'document', xls: 'document', xlsx: 'document',
  ppt: 'document', pptx: 'document',
  // 代码
  js: 'code', ts: 'code', jsx: 'code', tsx: 'code',
  vue: 'code', html: 'code', css: 'code', scss: 'code',
  py: 'code', rb: 'code', go: 'code', rs: 'code',
  java: 'code', c: 'code', cpp: 'code', h: 'code',
  json: 'code', yaml: 'code', yml: 'code', toml: 'code',
  xml: 'code', sh: 'code', bash: 'code', zsh: 'code',
  // 压缩包
  zip: 'archive', gz: 'archive', tar: 'archive', rar: 'archive',
  '7z': 'archive', bz2: 'archive',
}

export function getFileCategory(key: string, contentType?: string): FileCategory {
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  if (EXT_MAP[ext]) return EXT_MAP[ext]

  if (contentType) {
    if (contentType.startsWith('image/')) return 'image'
    if (contentType.startsWith('video/')) return 'video'
    if (contentType.startsWith('audio/')) return 'audio'
    if (contentType.startsWith('text/')) return 'code'
    if (contentType === 'application/pdf') return 'document'
  }

  return 'other'
}

/** 判断是否可预览（前端能处理的类型） */
export function isPreviewable(key: string, contentType?: string): boolean {
  const cat = getFileCategory(key, contentType)
  return cat === 'image' || cat === 'video' || cat === 'audio'
    || cat === 'document' || cat === 'code'
}

/** 判断是否是文本类型（可在线编辑） */
export function isTextEditable(key: string, contentType?: string): boolean {
  const cat = getFileCategory(key, contentType)
  return cat === 'code' || (cat === 'document' && !key.endsWith('.pdf'))
}

/** 文件类型图标名称（对应 Naive UI 图标集） */
export function getCategoryIcon(category: FileCategory): string {
  const map: Record<FileCategory, string> = {
    image: 'image-outline',
    video: 'videocam-outline',
    audio: 'musical-notes-outline',
    document: 'document-text-outline',
    code: 'code-slash-outline',
    archive: 'archive-outline',
    other: 'document-outline',
  }
  return map[category]
}
