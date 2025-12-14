const express = require('express')
const tutorialService = require('../services/tutorialService')
const logger = require('../utils/logger')

const router = express.Router()

// 📖 教程内容读取（公开只读，用于未登录页面展示）
router.get('/content', async (req, res) => {
  try {
    const { model, system, fileName } = req.query
    const result = await tutorialService.getTutorialContent(model, system, fileName || 'index.md')
    return res.json(result)
  } catch (error) {
    logger.error('❌ Failed to load tutorial content (public):', error)
    return res.status(400).json({ success: false, message: error.message || '加载失败' })
  }
})

module.exports = router
