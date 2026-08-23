const logger = require('./logger')

// 客户端断开判定的单一实现。
//
// 为什么不能用 req.on('close')：Node >= 16 起 IncomingMessage 的 'close' 表示「请求体读完、流已关闭」，
// 不是「客户端断开」。实测裸 http.Server 与纯 Express 下正常请求都会在 +0ms 收到 req 'close'
// （此时 req.complete === true），故拿它当断开信号会把每个正常请求都误判成断开：
// 上游请求被提前 abort（返回 ERR_CANCELED/502）或上游流被提前 destroy。
//
// 正确判据是 res 'close' 且响应尚未写完（!res.writableEnded）：
//   正常结束 → 先 res.end() 使 writableEnded=true，再触发 close → 不算断开
//   真断开   → 连接先断，close 触发时 writableEnded 仍为 false → 算断开
// 判据只看 res，不再看 req，故注册时机不再敏感（上游请求发出前后注册均可）。
//
// 返回 detach()，用于响应正常收尾时摘掉监听器（幂等，可重复调用）。
const onClientDisconnect = (res, onDisconnect, label = 'request') => {
  let detached = false

  const handleClose = () => {
    if (detached) {
      return
    }
    detached = true
    // 响应已写完 = 正常收尾，不是客户端断开
    if (res.writableEnded) {
      return
    }
    logger.info(`🔌 Client disconnected, aborting ${label}`)
    onDisconnect()
  }

  // 注册前就已断开的补偿：'close' 是一次性过去事件，晚注册的监听器不会被补发。
  // 调用点常在 await 上游响应之后才注册（此时才有可回收的上游流），若客户端在等上游期间断开，
  // 光靠 once('close') 会永久漏掉、上游流不回收。故此处先判一次终态。
  if (res.destroyed && !res.writableEnded) {
    handleClose()
    return () => {}
  }

  res.once('close', handleClose)

  return () => {
    detached = true
    res.removeListener('close', handleClose)
  }
}

module.exports = {
  onClientDisconnect
}
