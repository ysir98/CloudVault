/**
 * AK/SK 凭证加密模块
 *
 * 使用 AES-256-GCM 对称加密，主密钥来自环境变量 CRYPTO_SECRET。
 * 每次加密随机生成 IV，密文格式：iv(hex):authTag(hex):ciphertext(hex)
 */

import crypto from 'crypto'
import { config } from '../config'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12   // GCM 推荐 96-bit IV
const KEY_LENGTH = 32  // AES-256 需要 32 字节密钥

/** 从环境变量派生 32 字节密钥（HKDF-SHA256） */
function deriveKey(): Buffer {
  const secret = Buffer.from(config.cryptoSecret, 'utf8')
  return crypto.createHash('sha256').update(secret).digest()
}

const KEY = deriveKey()

/**
 * 加密明文字符串
 * @returns `iv:authTag:ciphertext` 格式的 hex 字符串
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':')
}

/**
 * 解密 `iv:authTag:ciphertext` 格式的 hex 字符串
 * @throws 若格式非法或密钥不匹配则抛出错误
 */
export function decrypt(ciphertext: string): string {
  const parts = ciphertext.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format')
  }

  const [ivHex, authTagHex, encryptedHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const encrypted = Buffer.from(encryptedHex, 'hex')

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(authTag)

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8')
}

/**
 * 加密 JSON 对象（存储账户配置时使用）
 */
export function encryptObject(obj: Record<string, unknown>): string {
  return encrypt(JSON.stringify(obj))
}

/**
 * 解密并还原 JSON 对象
 */
export function decryptObject<T = Record<string, unknown>>(ciphertext: string): T {
  return JSON.parse(decrypt(ciphertext)) as T
}
