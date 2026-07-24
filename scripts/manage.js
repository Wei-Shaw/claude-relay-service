#!/usr/bin/env node

const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT_DIR = path.join(__dirname, '..')
const PID_FILE = path.join(ROOT_DIR, 'claude-relay-service.pid')
const LOG_FILE = path.join(ROOT_DIR, 'logs', 'service.log')
const ERROR_LOG_FILE = path.join(ROOT_DIR, 'logs', 'service-error.log')
const APP_FILE = path.join(ROOT_DIR, 'src', 'app.js')

class ServiceManager {
  constructor() {
    this.ensureLogDir()
  }

  ensureLogDir() {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true })
  }

  getPid() {
    if (!fs.existsSync(PID_FILE)) {
      return null
    }

    const pid = Number.parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10)
    return Number.isFinite(pid) ? pid : null
  }

  isProcessRunning(pid) {
    if (!pid) {
      return false
    }

    try {
      process.kill(pid, 0)
      return true
    } catch (_error) {
      return false
    }
  }

  writePid(pid) {
    fs.writeFileSync(PID_FILE, String(pid))
    console.log(`PID ${pid} saved to ${PID_FILE}`)
  }

  removePidFile() {
    if (fs.existsSync(PID_FILE)) {
      fs.unlinkSync(PID_FILE)
    }
  }

  getStatus() {
    const pid = this.getPid()
    return pid && this.isProcessRunning(pid)
      ? { running: true, pid }
      : { running: false, pid: null }
  }

  start(daemon = false) {
    const status = this.getStatus()
    if (status.running) {
      console.log(`Service is already running (PID: ${status.pid})`)
      return false
    }

    if (daemon) {
      const stdout = fs.openSync(LOG_FILE, 'a')
      const stderr = fs.openSync(ERROR_LOG_FILE, 'a')
      const child = spawn(process.execPath, [APP_FILE], {
        cwd: ROOT_DIR,
        detached: true,
        stdio: ['ignore', stdout, stderr],
        windowsHide: true
      })

      child.unref()
      this.writePid(child.pid)
      console.log(`Service started in background (PID: ${child.pid})`)
      console.log(`Log file: ${LOG_FILE}`)
      console.log(`Error log: ${ERROR_LOG_FILE}`)
      return true
    }

    const child = spawn(process.execPath, [APP_FILE], {
      cwd: ROOT_DIR,
      stdio: 'inherit'
    })

    this.writePid(child.pid)
    console.log(`Service started (PID: ${child.pid})`)

    child.on('exit', (code, signal) => {
      this.removePidFile()
      if (code !== 0) {
        console.log(`Process exited (code: ${code}, signal: ${signal})`)
      }
    })

    child.on('error', (error) => {
      this.removePidFile()
      console.error('Start failed:', error.message)
    })

    return true
  }

  stop() {
    const status = this.getStatus()
    if (!status.running) {
      console.log('Service is not running')
      this.removePidFile()
      return false
    }

    console.log(`Stopping service (PID: ${status.pid})...`)
    try {
      process.kill(status.pid, 'SIGTERM')
    } catch (error) {
      console.error('Stop failed:', error.message)
      this.removePidFile()
      return false
    }

    const startedAt = Date.now()
    const timeoutMs = 30000
    const timer = setInterval(() => {
      if (!this.isProcessRunning(status.pid)) {
        clearInterval(timer)
        this.removePidFile()
        console.log('Service stopped')
        return
      }

      if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer)
        try {
          process.kill(status.pid, 'SIGKILL')
          console.log('Service killed after graceful shutdown timeout')
        } catch (error) {
          console.error('Force stop failed:', error.message)
        }
        this.removePidFile()
      }
    }, 1000)

    return true
  }

  restart(daemon = false) {
    const status = this.getStatus()
    if (!status.running) {
      return this.start(daemon)
    }

    this.stop()
    setTimeout(() => this.start(daemon), 2500)
    return true
  }

  status() {
    const status = this.getStatus()
    if (status.running) {
      console.log(`Service is running (PID: ${status.pid})`)
      return true
    }

    console.log('Service is not running')
    return false
  }

  logs(lines = 50) {
    if (!fs.existsSync(LOG_FILE)) {
      console.log(`Log file does not exist: ${LOG_FILE}`)
      return
    }

    const content = fs.readFileSync(LOG_FILE, 'utf8')
    const output = content.split(/\r?\n/).slice(-lines).join('\n')
    console.log(output)
  }

  help() {
    console.log(`
Claude Relay Service process manager

Usage:
  node scripts/manage.js start [-d|--daemon]
  node scripts/manage.js stop
  node scripts/manage.js restart [-d|--daemon]
  node scripts/manage.js status
  node scripts/manage.js logs [lines]

Files:
  PID: ${PID_FILE}
  Log: ${LOG_FILE}
  Error log: ${ERROR_LOG_FILE}
`)
  }
}

function main() {
  const manager = new ServiceManager()
  const args = process.argv.slice(2)
  const command = args[0]
  const daemon = args.includes('-d') || args.includes('--daemon')

  switch (command) {
    case 'start':
    case 's':
      manager.start(daemon)
      break
    case 'stop':
    case 'halt':
      manager.stop()
      break
    case 'restart':
    case 'r':
      manager.restart(daemon)
      break
    case 'status':
    case 'st':
      manager.status()
      break
    case 'logs':
    case 'log':
    case 'l':
      manager.logs(Number.parseInt(args[1], 10) || 50)
      break
    case 'help':
    case '--help':
    case '-h':
    case 'h':
      manager.help()
      break
    default:
      console.log(`Unknown command: ${command || ''}`)
      manager.help()
      process.exit(1)
  }
}

if (require.main === module) {
  main()
}

module.exports = ServiceManager
