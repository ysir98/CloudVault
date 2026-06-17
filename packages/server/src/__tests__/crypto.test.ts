/**
 * crypto 模块单元测试
 *
 * 覆盖：加密/解密往返一致、格式校验、篡改检测、对象加解密。
 * 测试环境通过 vitest.config.ts 注入 CRYPTO_SECRET。
 */

import { describe, it, expect } from 'vitest'
import { encrypt, decrypt, encryptObject, decryptObject } from '../crypto'

describe('encrypt / decrypt', () => {
  it('往返一致：明文加密后可完整解密', () => {
    const plain = 'hello world 123!@#'
    expect(decrypt(encrypt(plain))).toBe(plain)
  })

  it('中文字符往返一致', () => {
    const plain = '阿里云 AccessKey: LTAI_test_key_12345'
    expect(decrypt(encrypt(plain))).toBe(plain)
  })

  it('空字符串往返一致', () => {
    expect(decrypt(encrypt(''))).toBe('')
  })

  it('每次加密产生不同密文（随机 IV）', () => {
    const plain = 'same input'
    expect(encrypt(plain)).not.toBe(encrypt(plain))
  })

  it('密文格式为 iv:authTag:ciphertext（3 段冒号分隔）', () => {
    const cipher = encrypt('test')
    const parts = cipher.split(':')
    expect(parts).toHaveLength(3)
    // IV 为 12 字节 = 24 hex 字符
    expect(parts[0]).toMatch(/^[0-9a-f]{24}$/)
    // AuthTag 为 16 字节 = 32 hex 字符
    expect(parts[1]).toMatch(/^[0-9a-f]{32}$/)
  })

  it('密文格式非法时 decrypt 抛出错误', () => {
    expect(() => decrypt('invalid')).toThrow('Invalid encrypted format')
    expect(() => decrypt('a:b')).toThrow('Invalid encrypted format')
  })

  it('篡改密文内容时 decrypt 抛出错误（GCM 认证失败）', () => {
    const cipher = encrypt('secret')
    const parts = cipher.split(':')
    // 篡改最后一个字符
    parts[2] = parts[2].slice(0, -1) + (parts[2].endsWith('0') ? '1' : '0')
    expect(() => decrypt(parts.join(':'))).toThrow()
  })

  it('篡改 authTag 时 decrypt 抛出错误', () => {
    const cipher = encrypt('secret')
    const parts = cipher.split(':')
    parts[1] = '0'.repeat(32)
    expect(() => decrypt(parts.join(':'))).toThrow()
  })
})

describe('encryptObject / decryptObject', () => {
  it('对象往返一致', () => {
    const obj = { accessKeyId: 'AKID123', secretKey: 'sk_secret', region: 'us-east-1' }
    expect(decryptObject(encryptObject(obj))).toEqual(obj)
  })

  it('嵌套对象往返一致', () => {
    const obj = { a: 1, b: { c: [1, 2, 3], d: true } }
    expect(decryptObject(encryptObject(obj))).toEqual(obj)
  })

  it('decryptObject 返回正确类型', () => {
    interface Cfg { key: string; val: number }
    const orig: Cfg = { key: 'k', val: 42 }
    const result = decryptObject<Cfg>(encryptObject(orig))
    expect(result.key).toBe('k')
    expect(result.val).toBe(42)
  })
})
