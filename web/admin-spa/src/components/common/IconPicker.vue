<template>
  <div class="icon-picker">
    <!-- 当前图标显示 -->
    <div
      class="icon-display"
      :class="[{ 'has-icon': currentIcon }, `size-${size}`]"
      :title="currentIcon ? '点击更换图标' : '点击选择图标'"
      @click="showPicker = true"
    >
      <img v-if="currentIcon" alt="icon" class="current-icon" :src="currentIcon" />
      <div
        v-else
        class="flex h-full w-full items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600"
      >
        <i class="fas fa-key text-[14px] text-white"></i>
      </div>
    </div>

    <!-- 图标选择器弹窗 -->
    <Teleport to="body">
      <div v-if="showPicker" class="picker-overlay">
        <div class="picker-modal" @click.stop>
          <div class="picker-header">
            <h3 class="picker-title">选择图标</h3>
            <button class="close-btn" @click="closePicker">
              <i class="fas fa-times"></i>
            </button>
          </div>

          <div class="picker-tabs">
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'emoji' }"
              @click="activeTab = 'emoji'"
            >
              <i class="fas fa-smile mr-1"></i>
              表情符号
            </button>
            <button
              class="tab-btn"
              :class="{ active: activeTab === 'upload' }"
              @click="activeTab = 'upload'"
            >
              <i class="fas fa-upload mr-1"></i>
              上传图片
            </button>
          </div>

          <div class="picker-content">
            <!-- 表情符号选择 -->
            <div v-if="activeTab === 'emoji'" class="emoji-grid">
              <div
                v-for="emoji in emojis"
                :key="emoji"
                class="emoji-item"
                :title="emoji"
                @click="selectEmoji(emoji)"
              >
                {{ emoji }}
              </div>
            </div>

            <!-- 图片上传 -->
            <div v-else-if="activeTab === 'upload'" class="upload-section">
              <!-- 上传区域 -->
              <div
                v-if="!originalImage"
                class="upload-area"
                @click="triggerFileInput"
                @dragover.prevent
                @drop.prevent="handleDrop"
              >
                <input
                  ref="fileInput"
                  accept="image/*"
                  class="hidden"
                  type="file"
                  @change="handleFileSelect"
                />
                <i class="fas fa-cloud-upload-alt mb-2 text-4xl text-gray-400"></i>
                <p class="text-gray-600 dark:text-gray-400">点击或拖拽图片到此处</p>
                <p class="mt-1 text-xs text-gray-500 dark:text-gray-500">
                  支持 JPG, PNG, GIF - 可裁剪选择区域
                </p>
              </div>

              <!-- 裁剪区域 -->
              <div v-if="originalImage" class="crop-container">
                <div class="crop-canvas-wrapper">
                  <canvas
                    ref="cropCanvas"
                    class="crop-canvas"
                    @mousedown="startCrop"
                    @mouseleave="endCrop"
                    @mousemove="moveCrop"
                    @mouseup="endCrop"
                    @touchend="endCrop"
                    @touchmove="moveCrop"
                    @touchstart="startCrop"
                  ></canvas>
                  <div class="crop-info">
                    <span class="text-xs text-gray-500">拖动方框调整裁剪位置</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="picker-footer">
            <div class="footer-actions">
              <button class="btn-cancel-modal" @click="closePicker">取消</button>
              <button v-if="currentIcon || originalImage" class="btn-save" @click="saveAndClose">
                <i class="fas fa-save mr-1"></i>
                保存
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, watch, nextTick } from 'vue'

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  size: {
    type: String,
    default: 'medium' // small, medium, large
  }
})

const emit = defineEmits(['update:modelValue'])

const showPicker = ref(false)
const activeTab = ref('emoji')
const currentIcon = ref(props.modelValue)
const fileInput = ref(null)
const cropCanvas = ref(null)
const originalImage = ref(null)
const cropData = ref({
  x: 0,
  y: 0,
  size: 0,
  isDragging: false,
  dragStartX: 0,
  dragStartY: 0,
  initialX: 0,
  initialY: 0,
  scale: 1
})

// 常用表情符号
const emojis = [
  // AI平台图标
  '🤖', // 通用AI/机器人
  '🧠', // 大脑/智能
  '🎓', // 学术/知识
  '📚', // 知识库
  '🔮', // 预测/魔法
  '🌐', // 全球/网络
  '💬', // 对话/聊天
  '🗨️', // 对话框
  '💭', // 思考
  '🎤', // 语音
  '🎧', // 音频
  '📝', // 文本/写作
  '✍️', // 书写
  '🖋️', // 钢笔
  '📖', // 阅读
  '👁️', // 视觉
  '🔍', // 搜索
  '🔎', // 放大镜
  '🧮', // 计算
  '🎛️', // 控制

  // 安全和密钥
  '🔑',
  '🔐',
  '🔒',
  '🔓',
  '🗝️',
  '🛡️',

  // 性能和速度
  '⚡',
  '🚀',
  '💫',
  '⚙️',
  '🔧',
  '🔨',

  // 星级和等级
  '💎',
  '🌟',
  '⭐',
  '✨',
  '🏆',
  '🥇',
  '🥈',
  '🥉',
  '🏅',

  // 颜色标识（可用于区分不同账户）
  '🔴',
  '🟠',
  '🟡',
  '🟢',
  '🔵',
  '🟣',
  '⚫',
  '⚪',
  '🟤',

  // 状态指示
  '✅',
  '❌',
  '⚠️',
  '❗',
  '❓',
  '💡',
  '🔥',
  '❄️',
  '🌈',

  // 数据和分析
  '📊',
  '📈',
  '📉',
  '💹',
  '📋',
  '📑',
  '📄',
  '📃',

  // 科技相关
  '💻',
  '🖥️',
  '📱',
  '⌨️',
  '🖱️',
  '💾',
  '💿',
  '📀',
  '🗄️',
  '🗂️',
  '📁',
  '📂',

  // 网络和连接
  '🔗',
  '📡',
  '📶',
  '📡',
  '🛰️',
  '🌍',
  '🌎',
  '🌏',

  // 实验和研究
  '🧪',
  '🧬',
  '🔬',
  '🔭',
  '⚗️',
  '🥼',

  // 金融相关
  '💰',
  '💵',
  '💴',
  '💶',
  '💷',
  '💳',
  '🏦',
  '💸',

  // 游戏和娱乐
  '🎮',
  '🎯',
  '🎲',
  '🎨',
  '🎭',
  '🎪',

  // 其他实用图标
  '📌',
  '📍',
  '🔖',
  '🏷️',
  '⏰',
  '⏱️',
  '⏳',
  '📅',
  '🗓️'
]

// 监听属性变化
watch(
  () => props.modelValue,
  (newVal) => {
    currentIcon.value = newVal
  }
)

// 关闭选择器
const closePicker = () => {
  showPicker.value = false
  resetImage()
}

// 选择表情
const selectEmoji = (emoji) => {
  // 将表情转换为base64 - 使用48x48获得更好的显示效果
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = 48
  canvas.height = 48

  // 使用更大的字体尺寸以获得更清晰的渲染
  ctx.font = '36px sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(emoji, 24, 24)

  const dataUrl = canvas.toDataURL('image/png')
  currentIcon.value = dataUrl
  emit('update:modelValue', dataUrl)
  closePicker()
}

// 触发文件选择
const triggerFileInput = () => {
  fileInput.value?.click()
}

// 处理文件选择
const handleFileSelect = (event) => {
  const file = event.target.files?.[0]
  if (file) {
    processFile(file)
  }
}

// 处理拖拽
const handleDrop = (event) => {
  const file = event.dataTransfer.files?.[0]
  if (file) {
    processFile(file)
  }
}

// 处理文件
const processFile = async (file) => {
  // 检查文件大小 - 允许最大10MB的原始文件
  if (file.size > 10 * 1024 * 1024) {
    alert('图片大小不能超过 10MB')
    return
  }

  // 检查文件类型
  if (!file.type.startsWith('image/')) {
    alert('请选择图片文件')
    return
  }

  // 读取图片准备裁剪
  const reader = new FileReader()
  reader.onload = async (e) => {
    const img = new Image()
    img.onload = () => {
      originalImage.value = img
      // 等待DOM更新后初始化裁剪画布
      nextTick(() => {
        initCropCanvas(img)
      })
    }
    img.src = e.target.result
  }
  reader.readAsDataURL(file)
}

// 初始化裁剪画布
const initCropCanvas = (img) => {
  if (!cropCanvas.value) return

  const canvas = cropCanvas.value

  // 设置画布大小
  const maxSize = 400
  let width = img.width
  let height = img.height

  if (width > height) {
    if (width > maxSize) {
      height = (height * maxSize) / width
      width = maxSize
    }
  } else {
    if (height > maxSize) {
      width = (width * maxSize) / height
      height = maxSize
    }
  }

  canvas.width = width
  canvas.height = height

  // 保存缩放比例
  cropData.value.scale = img.width / width

  // 初始化固定大小的裁剪框（居中）
  const cropSize = Math.min(width, height) * 0.8 // 裁剪框大小为较小边的80%
  const x = (width - cropSize) / 2
  const y = (height - cropSize) / 2

  cropData.value = {
    x: x,
    y: y,
    size: cropSize,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    initialX: 0,
    initialY: 0,
    scale: img.width / width
  }

  drawCropBox()
}

// 绘制裁剪框
const drawCropBox = () => {
  if (!cropCanvas.value || !originalImage.value) return

  const canvas = cropCanvas.value
  const ctx = canvas.getContext('2d')
  const img = originalImage.value

  // 重绘图片
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  // 半透明遮罩层
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // 清除裁剪区域，让其显示原图
  const { x, y, size } = cropData.value

  // 保存当前状态
  ctx.save()

  // 创建裁剪路径
  ctx.beginPath()
  ctx.rect(x, y, size, size)
  ctx.clip()

  // 在裁剪区域内重新绘制原图
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

  // 恢复状态
  ctx.restore()

  // 绘制裁剪框边框
  ctx.strokeStyle = '#3b82f6'
  ctx.lineWidth = 3
  ctx.strokeRect(x, y, size, size)

  // 绘制内边框（白色）
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
  ctx.lineWidth = 1
  ctx.strokeRect(x + 1, y + 1, size - 2, size - 2)

  // 绘制网格线（九宫格）
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'
  ctx.lineWidth = 1
  const thirdSize = size / 3
  // 垂直线
  ctx.beginPath()
  ctx.moveTo(x + thirdSize, y)
  ctx.lineTo(x + thirdSize, y + size)
  ctx.moveTo(x + thirdSize * 2, y)
  ctx.lineTo(x + thirdSize * 2, y + size)
  // 水平线
  ctx.moveTo(x, y + thirdSize)
  ctx.lineTo(x + size, y + thirdSize)
  ctx.moveTo(x, y + thirdSize * 2)
  ctx.lineTo(x + size, y + thirdSize * 2)
  ctx.stroke()

  // 绘制角标
  const cornerLength = 20
  ctx.strokeStyle = '#3b82f6'
  ctx.lineWidth = 3

  // 左上角
  ctx.beginPath()
  ctx.moveTo(x, y + cornerLength)
  ctx.lineTo(x, y)
  ctx.lineTo(x + cornerLength, y)
  ctx.stroke()

  // 右上角
  ctx.beginPath()
  ctx.moveTo(x + size - cornerLength, y)
  ctx.lineTo(x + size, y)
  ctx.lineTo(x + size, y + cornerLength)
  ctx.stroke()

  // 左下角
  ctx.beginPath()
  ctx.moveTo(x, y + size - cornerLength)
  ctx.lineTo(x, y + size)
  ctx.lineTo(x + cornerLength, y + size)
  ctx.stroke()

  // 右下角
  ctx.beginPath()
  ctx.moveTo(x + size - cornerLength, y + size)
  ctx.lineTo(x + size, y + size)
  ctx.lineTo(x + size, y + size - cornerLength)
  ctx.stroke()
}

// 开始拖动
const startCrop = (e) => {
  if (!cropCanvas.value) return

  const rect = cropCanvas.value.getBoundingClientRect()
  const mouseX = (e.clientX || e.touches?.[0]?.clientX) - rect.left
  const mouseY = (e.clientY || e.touches?.[0]?.clientY) - rect.top

  // 检查是否在裁剪框内
  const { x, y, size } = cropData.value
  if (mouseX >= x && mouseX <= x + size && mouseY >= y && mouseY <= y + size) {
    cropData.value.isDragging = true
    cropData.value.dragStartX = mouseX
    cropData.value.dragStartY = mouseY
    cropData.value.initialX = x
    cropData.value.initialY = y
  }
}

// 移动裁剪框
const moveCrop = (e) => {
  if (!cropData.value.isDragging || !cropCanvas.value) return

  const rect = cropCanvas.value.getBoundingClientRect()
  const mouseX = (e.clientX || e.touches?.[0]?.clientX) - rect.left
  const mouseY = (e.clientY || e.touches?.[0]?.clientY) - rect.top

  // 计算移动距离
  const deltaX = mouseX - cropData.value.dragStartX
  const deltaY = mouseY - cropData.value.dragStartY

  // 计算新位置
  let newX = cropData.value.initialX + deltaX
  let newY = cropData.value.initialY + deltaY

  // 限制在画布内
  const canvas = cropCanvas.value
  const maxX = canvas.width - cropData.value.size
  const maxY = canvas.height - cropData.value.size

  newX = Math.max(0, Math.min(newX, maxX))
  newY = Math.max(0, Math.min(newY, maxY))

  cropData.value.x = newX
  cropData.value.y = newY

  drawCropBox()
}

// 结束拖动
const endCrop = () => {
  cropData.value.isDragging = false
}

// 重置图片
const resetImage = () => {
  originalImage.value = null
  cropData.value = {
    x: 0,
    y: 0,
    size: 0,
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    initialX: 0,
    initialY: 0,
    scale: 1
  }
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

// 智能压缩图片
const compressImage = (img) => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  // 设置目标尺寸 - 因为是图标，48x48对高DPI屏幕更友好
  const targetSize = 48
  let width = img.width
  let height = img.height

  // 计算缩放比例，保持宽高比
  const scale = Math.min(targetSize / width, targetSize / height)
  if (scale < 1) {
    width = Math.round(width * scale)
    height = Math.round(height * scale)
  }

  canvas.width = width
  canvas.height = height

  // 设置高质量的图像渲染
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // 检测是否有透明背景（通过绘制一次并检查alpha通道）
  ctx.drawImage(img, 0, 0, width, height)
  const imageData = ctx.getImageData(0, 0, width, height)
  const hasTransparency = Array.from(imageData.data).some(
    (_, i) => i % 4 === 3 && imageData.data[i] < 255
  )

  // 目标大小：60KB（对于图标来说足够了）
  const targetBytes = 60 * 1024
  let compressedDataUrl

  if (hasTransparency) {
    // 如果有透明背景，使用PNG格式
    compressedDataUrl = canvas.toDataURL('image/png')

    // 如果PNG太大，尝试缩小尺寸
    if (compressedDataUrl.length > targetBytes * 1.37) {
      const smallerSize = 36
      const smallerScale = Math.min(smallerSize / img.width, smallerSize / img.height)
      width = Math.round(img.width * smallerScale)
      height = Math.round(img.height * smallerScale)

      canvas.width = width
      canvas.height = height
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, width, height)
      compressedDataUrl = canvas.toDataURL('image/png')
    }
  } else {
    // 没有透明背景，使用JPEG格式获得更好的压缩
    let quality = 0.92
    compressedDataUrl = canvas.toDataURL('image/jpeg', quality)

    // 逐步降低质量直到达到目标大小
    while (compressedDataUrl.length > targetBytes * 1.37 && quality > 0.3) {
      quality -= 0.1
      compressedDataUrl = canvas.toDataURL('image/jpeg', quality)
    }

    // 如果还是太大，缩小尺寸
    if (compressedDataUrl.length > targetBytes * 1.37) {
      const smallerSize = 36
      const smallerScale = Math.min(smallerSize / img.width, smallerSize / img.height)
      width = Math.round(img.width * smallerScale)
      height = Math.round(img.height * smallerScale)

      canvas.width = width
      canvas.height = height
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(img, 0, 0, width, height)

      compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7)
    }
  }

  // 输出压缩信息到控制台（开发时可用）
  console.log(
    `图片压缩完成: ${width}x${height}, 大小: ${Math.round(compressedDataUrl.length / 1024)}KB`
  )

  return compressedDataUrl
}

// 保存并关闭
const saveAndClose = () => {
  // 如果有原始图片（正在裁剪），先应用裁剪
  if (originalImage.value) {
    applyCropAndSave()
  } else if (currentIcon.value) {
    // 直接保存已选择的图标（表情）
    emit('update:modelValue', currentIcon.value)
    closePicker()
  } else {
    // 没有选择任何图标时，关闭弹窗
    closePicker()
  }
}

// 应用裁剪并保存
const applyCropAndSave = () => {
  if (!cropCanvas.value || !originalImage.value) return

  const { x, y, size, scale } = cropData.value

  // 计算原始图片上的裁剪区域
  const cropX = x * scale
  const cropY = y * scale
  const cropSize = size * scale

  // 创建裁剪后的图片
  const tempCanvas = document.createElement('canvas')
  const tempCtx = tempCanvas.getContext('2d')

  // 设置为正方形
  tempCanvas.width = cropSize
  tempCanvas.height = cropSize

  // 绘制裁剪的图片
  tempCtx.drawImage(originalImage.value, cropX, cropY, cropSize, cropSize, 0, 0, cropSize, cropSize)

  // 压缩并保存
  const tempImg = new Image()
  tempImg.onload = () => {
    const compressedDataUrl = compressImage(tempImg)
    emit('update:modelValue', compressedDataUrl)
    closePicker()
  }
  tempImg.src = tempCanvas.toDataURL('image/png')
}
</script>

<style scoped>
.icon-picker {
  display: inline-block;
}

.icon-display {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f3f4f6;
  border: 2px solid transparent;
  transition: all 0.2s;
}

.icon-display.size-small {
  width: 24px;
  height: 24px;
  border-radius: 4px;
}

.icon-display.size-large {
  width: 40px;
  height: 40px;
  border-radius: 8px;
}

.dark .icon-display {
  background: #374151;
}

.icon-display:hover {
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.icon-display.has-icon {
  background: white;
}

.dark .icon-display.has-icon {
  background: #1f2937;
}

.current-icon {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.picker-modal {
  background: white;
  border-radius: 12px;
  width: 100%;
  max-width: 500px;
  max-height: 600px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.dark .picker-modal {
  background: #1f2937;
}

.picker-header {
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.dark .picker-header {
  border-bottom-color: #374151;
}

.picker-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
}

.dark .picker-title {
  color: #f3f4f6;
}

.close-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #f3f4f6;
  color: #111827;
}

.dark .close-btn:hover {
  background: #374151;
  color: #f3f4f6;
}

.picker-tabs {
  padding: 0.5rem 1.5rem;
  display: flex;
  gap: 0.5rem;
  border-bottom: 1px solid #e5e7eb;
}

.dark .picker-tabs {
  border-bottom-color: #374151;
}

.tab-btn {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  transition: all 0.2s;
}

.tab-btn:hover {
  background: #f3f4f6;
  color: #111827;
}

.dark .tab-btn:hover {
  background: #374151;
  color: #f3f4f6;
}

.tab-btn.active {
  background: #3b82f6;
  color: white;
}

.picker-content {
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
}

.emoji-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
  gap: 0.5rem;
}

.emoji-item {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.emoji-item:hover {
  background: #f3f4f6;
  transform: scale(1.1);
}

.dark .emoji-item:hover {
  background: #374151;
}

.upload-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.upload-area {
  border: 2px dashed #d1d5db;
  border-radius: 8px;
  padding: 2rem;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}

.dark .upload-area {
  border-color: #4b5563;
}

.upload-area:hover {
  border-color: #3b82f6;
  background: #eff6ff;
}

.dark .upload-area:hover {
  background: #1e3a5f;
}

.crop-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
}

.crop-canvas-wrapper {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.crop-canvas {
  max-width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  cursor: move;
}

.dark .crop-canvas {
  border-color: #374151;
}

.crop-info {
  text-align: center;
}

.picker-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #e5e7eb;
}

.dark .picker-footer {
  border-top-color: #374151;
}

.footer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.btn-cancel-modal {
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  background: #6b7280;
  color: white;
  transition: all 0.2s;
}

.btn-cancel-modal:hover {
  background: #4b5563;
}

.btn-save {
  padding: 0.5rem 1.25rem;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  background: #10b981;
  color: white;
  transition: all 0.2s;
}

.btn-save:hover {
  background: #059669;
}

.hidden {
  display: none;
}
</style>
