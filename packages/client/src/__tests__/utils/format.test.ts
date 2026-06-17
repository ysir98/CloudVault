/**
 * utils/format 单元测试
 *
 * 覆盖所有格式化函数的边界情况。
 */

import { describe, it, expect } from 'vitest'
import {
  formatSize, formatDate, formatSpeed, formatEta,
  keyToName, keyToPrefix,
} from '../../utils/format'

describe('formatSize', () => {
  it('0 字节显示 "0 B"', () => {
    expect(formatSize(0)).toBe('0 B')
  })

  it('小于 1KB 显示字节', () => {
    expect(formatSize(512)).toBe('512 B')
  })

  it('1024 字节显示 "1.0 KB"', () => {
    expect(formatSize(1024)).toBe('1.0 KB')
  })

  it('1.5 MB 正确格式化', () => {
    expect(formatSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
  })

  it('1 GB 正确格式化', () => {
    expect(formatSize(1024 * 1024 * 1024)).toBe('1.0 GB')
  })

  it('小数位数：字节无小数，其他保留 1 位', () => {
    expect(formatSize(1500)).toMatch(/\d+\.\d KB/)
    expect(formatSize(100)).not.toContain('.')
  })
})

describe('formatDate', () => {
  it('有效日期返回格式化字符串', () => {
    const result = formatDate(new Date('2024-06-01T12:00:00'))
    expect(result).not.toBe('—')
    expect(result).toContain('2024')
  })

  it('Date 对象、字符串、时间戳均可接受', () => {
    const ts = new Date('2024-01-15').getTime()
    expect(formatDate(new Date('2024-01-15'))).not.toBe('—')
    expect(formatDate('2024-01-15')).not.toBe('—')
    expect(formatDate(ts)).not.toBe('—')
  })

  it('无效日期返回 "—"', () => {
    expect(formatDate('invalid-date')).toBe('—')
    expect(formatDate(NaN)).toBe('—')
  })
})

describe('formatSpeed', () => {
  it('< 1KB/s 显示 B/s', () => {
    expect(formatSpeed(500)).toContain('B/s')
    expect(formatSpeed(500)).not.toContain('KB')
  })

  it('>= 1KB/s < 1MB/s 显示 KB/s', () => {
    expect(formatSpeed(1536)).toContain('KB/s')
  })

  it('>= 1MB/s 显示 MB/s', () => {
    expect(formatSpeed(2.5 * 1024 * 1024)).toBe('2.5 MB/s')
  })

  it('0 显示 0 B/s', () => {
    expect(formatSpeed(0)).toContain('B/s')
  })
})

describe('formatEta', () => {
  it('Infinity 返回 "—"', () => {
    expect(formatEta(Infinity)).toBe('—')
  })

  it('NaN 返回 "—"', () => {
    expect(formatEta(NaN)).toBe('—')
  })

  it('0 或负数返回 "—"', () => {
    expect(formatEta(0)).toBe('—')
    expect(formatEta(-5)).toBe('—')
  })

  it('< 60s 显示秒', () => {
    expect(formatEta(30)).toBe('30s')
    expect(formatEta(59)).toBe('59s')
  })

  it('60-3599s 显示分钟和秒', () => {
    const result = formatEta(90)
    expect(result).toContain('m')
    expect(result).toContain('s')
  })

  it('>= 3600s 显示小时和分钟', () => {
    const result = formatEta(3661)
    expect(result).toContain('h')
    expect(result).toContain('m')
  })
})

describe('keyToName', () => {
  it('提取最后一段路径', () => {
    expect(keyToName('folder/sub/file.txt')).toBe('file.txt')
  })

  it('根目录文件', () => {
    expect(keyToName('file.txt')).toBe('file.txt')
  })

  it('以斜线结尾的目录（去掉斜线后取最后段）', () => {
    expect(keyToName('folder/sub/')).toBe('sub')
  })

  it('空字符串返回空字符串', () => {
    expect(keyToName('')).toBe('')
  })

  it('中文文件名', () => {
    expect(keyToName('文件夹/图片.jpg')).toBe('图片.jpg')
  })
})

describe('keyToPrefix', () => {
  it('提取父目录（含末尾斜线）', () => {
    expect(keyToPrefix('folder/sub/file.txt')).toBe('folder/sub/')
  })

  it('根目录文件没有前缀', () => {
    expect(keyToPrefix('file.txt')).toBe('')
  })

  it('一级目录', () => {
    expect(keyToPrefix('folder/file.txt')).toBe('folder/')
  })
})
