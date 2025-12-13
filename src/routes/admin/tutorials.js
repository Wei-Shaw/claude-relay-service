const express = require('express')
const { authenticateAdmin } = require('../../middleware/auth')
const tutorialService = require('../../services/tutorialService')
const logger = require('../../utils/logger')

const router = express.Router()

router.get('/tutorials/content', authenticateAdmin, async (req, res) => {
  try {
    const { model, system, fileName } = req.query
    const result = await tutorialService.getTutorialContent(model, system, fileName || 'index.md')
    return res.json(result)
  } catch (error) {
    logger.error('❌ Failed to load tutorial content:', error)
    return res.status(400).json({ success: false, message: error.message || '加载失败' })
  }
})

router.put('/tutorials/content', authenticateAdmin, async (req, res) => {
  try {
    const { model, system, fileName, content } = req.body || {}
    const result = await tutorialService.saveTutorialContent(
      model,
      system,
      content,
      fileName || 'index.md'
    )
    return res.json(result)
  } catch (error) {
    logger.error('❌ Failed to save tutorial content:', error)
    return res.status(400).json({ success: false, message: error.message || '保存失败' })
  }
})

router.post(
  '/tutorials/assets/upload',
  authenticateAdmin,
  express.raw({
    type: ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/octet-stream'],
    limit: '25mb'
  }),
  async (req, res) => {
    try {
      const { model, system } = req.query
      const originalName = req.get('x-file-name') || req.get('x-filename') || ''
      const mimeType =
        req.get('content-type') && req.get('content-type') !== 'application/octet-stream'
          ? req.get('content-type')
          : ''

      const result = await tutorialService.saveTutorialImage(
        model,
        system,
        req.body,
        mimeType,
        originalName
      )
      return res.json(result)
    } catch (error) {
      logger.error('❌ Failed to upload tutorial image:', error)
      return res.status(400).json({ success: false, message: error.message || '上传失败' })
    }
  }
)

module.exports = router

