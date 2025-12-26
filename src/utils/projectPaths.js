const path = require('path')

// 该文件位于 src/utils 下，向上两级即项目根目录。
function getProjectRoot() {
  return path.resolve(__dirname, '..', '..')
}

module.exports = {
  getProjectRoot
}
