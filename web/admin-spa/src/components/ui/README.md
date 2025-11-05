# UI Components Library - 使用文档

这是 Claude Relay Service 前端的现代化 UI 组件库，采用现代简约设计风格。

## 组件列表

### 1. GlassCard - 玻璃态卡片

具有毛玻璃效果的现代化卡片组件。

**Props:**
- `hover` (Boolean, 默认: false) - 是否启用悬停效果
- `clickable` (Boolean, 默认: false) - 是否可点击
- `variant` (String, 默认: 'default') - 变体: 'default' | 'primary' | 'secondary' | 'accent'
- `className` (String) - 自定义类名

**示例:**
```vue
<GlassCard hover clickable variant="primary" @click="handleClick">
  <h3>卡片标题</h3>
  <p>卡片内容</p>
</GlassCard>
```

---

### 2. ModernButton - 现代化按钮

带渐变色和动画效果的按钮组件。

**Props:**
- `variant` (String, 默认: 'primary') - 变体: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info' | 'ghost' | 'outline'
- `size` (String, 默认: 'md') - 尺寸: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
- `disabled` (Boolean, 默认: false) - 是否禁用
- `loading` (Boolean, 默认: false) - 是否显示加载状态
- `type` (String, 默认: 'button') - 按钮类型
- `rounded` (Boolean, 默认: false) - 是否完全圆角

**插槽:**
- `default` - 按钮文字
- `icon-left` - 左侧图标
- `icon-right` - 右侧图标

**示例:**
```vue
<ModernButton variant="primary" size="md" @click="handleClick">
  <template #icon-left>
    <i class="fas fa-save"></i>
  </template>
  保存
</ModernButton>

<ModernButton variant="danger" :loading="isLoading">
  删除
</ModernButton>
```

---

### 3. AnimatedStatCard - 动画统计卡片

带动画效果的统计数据展示卡片。

**Props:**
- `title` (String) - 标题
- `value` (String | Number) - 主要数值
- `subtitle` (String) - 副标题
- `icon` (String) - 图标类名
- `variant` (String, 默认: 'primary') - 变体: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info'
- `trend` (String) - 趋势数值（如 "+12%"）
- `trendDirection` (String, 默认: 'up') - 趋势方向: 'up' | 'down'
- `trendText` (String) - 趋势说明文字

**插槽:**
- `title` - 自定义标题
- `value` - 自定义数值
- `subtitle` - 自定义副标题
- `icon` - 自定义图标

**示例:**
```vue
<AnimatedStatCard
  title="总API Keys"
  :value="dashboardData.totalApiKeys"
  subtitle="活跃: 25"
  icon="fas fa-key"
  variant="primary"
  trend="+15%"
  trend-direction="up"
  trend-text="比上周"
/>
```

---

### 4. GradientBadge - 渐变徽章

带渐变色的徽章组件。

**Props:**
- `variant` (String, 默认: 'default') - 变体: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' | 'gradient-primary' | 'gradient-secondary'
- `size` (String, 默认: 'md') - 尺寸: 'sm' | 'md' | 'lg'
- `dot` (Boolean, 默认: false) - 是否显示状态点
- `className` (String) - 自定义类名

**示例:**
```vue
<GradientBadge variant="success" dot>
  正常
</GradientBadge>

<GradientBadge variant="gradient-primary" size="lg">
  Premium
</GradientBadge>
```

---

### 5. LoadingSpinner - 加载动画

多种样式的加载动画组件。

**Props:**
- `type` (String, 默认: 'spinner') - 类型: 'spinner' | 'dots' | 'pulse' | 'bars'
- `size` (String, 默认: 'md') - 尺寸: 'sm' | 'md' | 'lg' | 'xl'
- `variant` (String, 默认: 'primary') - 变体: 'primary' | 'secondary' | 'white' | 'gray'
- `text` (String) - 加载文字
- `containerClass` (String) - 容器类名

**示例:**
```vue
<LoadingSpinner type="spinner" size="md" variant="primary" text="加载中..." />

<LoadingSpinner type="dots" size="lg" variant="secondary" />

<LoadingSpinner type="bars" />
```

---

## 使用指南

### 1. 导入组件

```vue
<script setup>
import GlassCard from '@/components/ui/GlassCard.vue'
import ModernButton from '@/components/ui/ModernButton.vue'
import AnimatedStatCard from '@/components/ui/AnimatedStatCard.vue'
import GradientBadge from '@/components/ui/GradientBadge.vue'
import LoadingSpinner from '@/components/ui/LoadingSpinner.vue'
</script>
```

### 2. 组合使用示例

```vue
<template>
  <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
    <!-- 统计卡片 -->
    <AnimatedStatCard
      title="今日请求"
      :value="stats.todayRequests"
      icon="fas fa-chart-line"
      variant="primary"
      trend="+25%"
      trend-direction="up"
      trend-text="比昨天"
    />

    <!-- 玻璃态卡片中使用按钮 -->
    <GlassCard hover clickable variant="secondary">
      <h3 class="mb-4 text-lg font-bold">操作面板</h3>
      <div class="flex gap-2">
        <ModernButton variant="primary" size="sm">
          <template #icon-left>
            <i class="fas fa-plus"></i>
          </template>
          新增
        </ModernButton>
        <ModernButton variant="outline" size="sm">
          取消
        </ModernButton>
      </div>
    </GlassCard>
  </div>
</template>
```

### 3. 暗黑模式支持

所有组件都完全支持暗黑模式，会自动根据当前主题切换样式。

---

## Tailwind CSS 自定义配置

项目已扩展了 Tailwind CSS 配置，新增了以下内容：

### 颜色
- `primary-*` - 主色系（50-900）
- `secondary-*` - 辅助色系（50-900）
- `accent-*` - 强调色系（50-900）

### 动画
- `fade-in` - 淡入
- `fade-in-up` - 从下淡入
- `fade-in-down` - 从上淡入
- `slide-in-right` - 从右滑入
- `slide-in-left` - 从左滑入
- `scale-in` - 缩放进入
- `bounce-in` - 弹跳进入
- `shimmer` - 闪光效果
- `spin-slow` - 慢速旋转

### 阴影
- `shadow-glass` - 玻璃态阴影
- `shadow-glass-dark` - 暗色玻璃态阴影
- `shadow-glow-primary` - 主色光晕
- `shadow-glow-secondary` - 辅助色光晕

### 背景
- `bg-glass-gradient` - 玻璃态渐变
- `bg-dark-glass-gradient` - 暗色玻璃态渐变

---

## 设计规范

### 间距
- 卡片内边距: `p-6` (24px)
- 元素间距: `gap-4` 或 `gap-6`
- 组件圆角: `rounded-xl` (12px) 或 `rounded-2xl` (16px)

### 颜色使用
- 主要操作: `variant="primary"`
- 成功状态: `variant="success"`
- 警告: `variant="warning"`
- 危险操作: `variant="danger"`
- 信息提示: `variant="info"`

### 动画时长
- 快速交互: `duration-200` (200ms)
- 标准动画: `duration-300` (300ms)
- 缓慢过渡: `duration-500` (500ms)

---

## 注意事项

1. 所有组件都已经包含了响应式设计
2. 组件支持通过 `className` prop 添加自定义样式
3. 建议使用 Tailwind CSS 工具类进行布局和间距调整
4. 图标使用 Font Awesome 6
