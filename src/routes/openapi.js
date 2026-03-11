const express = require('express')
const { adminAgentOpenApiSpec, toYaml } = require('../openapi/adminAgentSpec')

const router = express.Router()

router.get('/admin-agent.json', (req, res) => {
  res.json(adminAgentOpenApiSpec)
})

router.get('/admin-agent.yaml', (req, res) => {
  const yaml = toYaml(adminAgentOpenApiSpec)
  res.set('Content-Type', 'application/yaml; charset=utf-8')
  res.send(`${yaml}\n`)
})

module.exports = router
