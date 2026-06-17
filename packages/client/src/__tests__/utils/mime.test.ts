/**
 * utils/mime 单元测试
 */

import { describe, it, expect } from 'vitest'
import {
  getFileCategory, isPreviewable, isTextEditable, getCategoryIcon,
  type FileCategory,
} from '../../utils/mime'

describe('getFileCategory — 按扩展名分类', () => {
  const cases: Array<[string, FileCategory]> = [
    ['photo.jpg', 'image'],
    ['image.PNG', 'image'],
    ['animation.gif', 'image'],
    ['graphic.svg', 'image'],
    ['movie.mp4', 'video'],
    ['clip.webm', 'video'],
    ['video.mkv', 'video'],
    ['song.mp3', 'audio'],
    ['lossless.flac', 'audio'],
    ['voice.wav', 'audio'],
    ['document.pdf', 'document'],
    ['readme.md', 'document'],
    ['notes.txt', 'document'],
    ['script.js', 'code'],
    ['component.vue', 'code'],
    ['config.json', 'code'],
    ['styles.css', 'code'],
    ['archive.zip', 'archive'],
    ['backup.tar', 'archive'],
    ['unknown.xyz', 'other'],
    ['no-extension', 'other'],
  ]

  for (const [filename, expected] of cases) {
    it(`"${filename}" → ${expected}`, () => {
      expect(getFileCategory(filename)).toBe(expected)
    })
  }
})

describe('getFileCategory — contentType 优先（当扩展名无法识别时）', () => {
  it('content-type=image/webp 按 contentType 识别', () => {
    expect(getFileCategory('unknown-file', 'image/webp')).toBe('image')
  })

  it('content-type=video/mp4 按 contentType 识别', () => {
    expect(getFileCategory('download', 'video/mp4')).toBe('video')
  })

  it('content-type=audio/ogg 按 contentType 识别', () => {
    expect(getFileCategory('file', 'audio/ogg')).toBe('audio')
  })

  it('content-type=text/plain 按 contentType 识别为 code', () => {
    expect(getFileCategory('file', 'text/plain')).toBe('code')
  })

  it('content-type=application/pdf 识别为 document', () => {
    expect(getFileCategory('file', 'application/pdf')).toBe('document')
  })

  it('扩展名已知时优先于 contentType', () => {
    // .mp3 是 audio，即使 contentType 说是 application/octet-stream
    expect(getFileCategory('song.mp3', 'application/octet-stream')).toBe('audio')
  })
})

describe('isPreviewable', () => {
  it('图片可预览', () => {
    expect(isPreviewable('photo.jpg')).toBe(true)
    expect(isPreviewable('image.svg')).toBe(true)
  })

  it('视频可预览', () => {
    expect(isPreviewable('movie.mp4')).toBe(true)
  })

  it('音频可预览', () => {
    expect(isPreviewable('song.mp3')).toBe(true)
  })

  it('文档可预览（pdf、md、txt）', () => {
    expect(isPreviewable('doc.pdf')).toBe(true)
    expect(isPreviewable('readme.md')).toBe(true)
    expect(isPreviewable('notes.txt')).toBe(true)
  })

  it('代码文件可预览', () => {
    expect(isPreviewable('app.vue')).toBe(true)
    expect(isPreviewable('index.ts')).toBe(true)
  })

  it('压缩包不可预览', () => {
    expect(isPreviewable('archive.zip')).toBe(false)
  })

  it('未知文件类型不可预览', () => {
    expect(isPreviewable('data.bin')).toBe(false)
  })
})

describe('isTextEditable', () => {
  it('代码文件可编辑', () => {
    expect(isTextEditable('script.py')).toBe(true)
    expect(isTextEditable('config.yaml')).toBe(true)
    expect(isTextEditable('README.md')).toBe(true)
  })

  it('普通文本可编辑', () => {
    expect(isTextEditable('notes.txt')).toBe(true)
  })

  it('PDF 不可编辑（document 但非文本）', () => {
    expect(isTextEditable('report.pdf')).toBe(false)
  })

  it('图片不可编辑', () => {
    expect(isTextEditable('photo.jpg')).toBe(false)
  })

  it('视频不可编辑', () => {
    expect(isTextEditable('video.mp4')).toBe(false)
  })
})

describe('getCategoryIcon', () => {
  it('每种类别返回非空字符串', () => {
    const categories: FileCategory[] = ['image', 'video', 'audio', 'document', 'code', 'archive', 'other']
    for (const cat of categories) {
      const icon = getCategoryIcon(cat)
      expect(typeof icon).toBe('string')
      expect(icon.length).toBeGreaterThan(0)
    }
  })

  it('各类别图标不同', () => {
    const icons = ['image', 'video', 'audio', 'document', 'code', 'archive', 'other']
      .map(c => getCategoryIcon(c as FileCategory))
    const unique = new Set(icons)
    expect(unique.size).toBe(icons.length)
  })
})
