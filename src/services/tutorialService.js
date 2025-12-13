const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const ALLOWED_MODELS = ['claude', 'codex', 'gemini', 'droid']
const ALLOWED_SYSTEMS = ['windows', 'macos', 'linux']

const TUTORIAL_BASE_DIR = path.join(__dirname, '..', '..', 'data', 'tutorials')
const DOCS_BASE_DIR = path.join(TUTORIAL_BASE_DIR, 'docs')
const ASSETS_BASE_DIR = path.join(TUTORIAL_BASE_DIR, 'assets')

const normalizeKey = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()

const ensureAllowed = (value, allowed, label) => {
  const normalized = normalizeKey(value)
  if (!allowed.includes(normalized)) {
    throw new Error(`无效的${label}`)
  }
  return normalized
}

const ensureDir = async (dirPath) => {
  await fs.promises.mkdir(dirPath, { recursive: true })
}

const mimeToExt = (mime) => {
  const normalized = String(mime || '')
    .trim()
    .toLowerCase()
  if (normalized === 'image/png') {
    return 'png'
  }
  if (normalized === 'image/jpeg') {
    return 'jpg'
  }
  if (normalized === 'image/webp') {
    return 'webp'
  }
  if (normalized === 'image/gif') {
    return 'gif'
  }
  return ''
}

const safeBasename = (value) =>
  String(value || '')
    .trim()
    .replace(/[/\\]+/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 120)

class TutorialService {
  getAllowedModels() {
    return [...ALLOWED_MODELS]
  }

  getAllowedSystems() {
    return [...ALLOWED_SYSTEMS]
  }

  _resolveDocPath(model, system, fileName = 'index.md') {
    const safeModel = ensureAllowed(model, ALLOWED_MODELS, '模型')
    const safeSystem = ensureAllowed(system, ALLOWED_SYSTEMS, '系统')
    const safeFile = safeBasename(fileName || 'index.md') || 'index.md'

    const docDir = path.join(DOCS_BASE_DIR, safeModel, safeSystem)
    const docPath = path.join(docDir, safeFile.endsWith('.md') ? safeFile : `${safeFile}.md`)

    return { safeModel, safeSystem, docDir, docPath }
  }

  async getTutorialContent(model, system, fileName = 'index.md') {
    const { safeModel, safeSystem, docDir, docPath } = this._resolveDocPath(model, system, fileName)

    await ensureDir(docDir)

    try {
      const content = await fs.promises.readFile(docPath, 'utf8')
      const stat = await fs.promises.stat(docPath)
      return {
        success: true,
        data: {
          model: safeModel,
          system: safeSystem,
          fileName: path.basename(docPath),
          content,
          updatedAtMs: stat.mtimeMs
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
      return {
        success: true,
        data: {
          model: safeModel,
          system: safeSystem,
          fileName: path.basename(docPath),
          content: '',
          updatedAtMs: 0
        }
      }
    }
  }

  async saveTutorialContent(model, system, content, fileName = 'index.md') {
    const { safeModel, safeSystem, docDir, docPath } = this._resolveDocPath(model, system, fileName)

    await ensureDir(docDir)

    const next = String(content || '')
    await fs.promises.writeFile(docPath, next, 'utf8')

    const stat = await fs.promises.stat(docPath)

    return {
      success: true,
      data: {
        model: safeModel,
        system: safeSystem,
        fileName: path.basename(docPath),
        updatedAtMs: stat.mtimeMs
      }
    }
  }

  async saveTutorialImage(model, system, buffer, mimeType, originalName = '') {
    const safeModel = ensureAllowed(model, ALLOWED_MODELS, '模型')
    const safeSystem = ensureAllowed(system, ALLOWED_SYSTEMS, '系统')

    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new Error('图片内容为空')
    }

    const extFromMime = mimeToExt(mimeType)
    const extFromName = safeBasename(originalName).toLowerCase().split('.').pop()
    const ext =
      extFromMime ||
      (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extFromName) ? extFromName : '')

    const finalExt = ext === 'jpeg' ? 'jpg' : ext
    if (!finalExt) {
      throw new Error('不支持的图片格式（仅支持 png/jpg/webp/gif）')
    }

    const assetDir = path.join(ASSETS_BASE_DIR, safeModel, safeSystem)
    await ensureDir(assetDir)

    const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '')
    const rand = crypto.randomBytes(6).toString('hex')
    const fileName = `${stamp}-${rand}.${finalExt}`
    const absPath = path.join(assetDir, fileName)

    await fs.promises.writeFile(absPath, buffer)

    return {
      success: true,
      data: {
        model: safeModel,
        system: safeSystem,
        fileName,
        size: buffer.length,
        mimeType: mimeType || '',
        url: `/tutorial-assets/${safeModel}/${safeSystem}/${fileName}`
      }
    }
  }
}

module.exports = new TutorialService()
