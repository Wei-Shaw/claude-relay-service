# API Keys 页面分类管理优化 - 实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 优化 API Keys 管理页面，将 key 分为"活跃"、"过期/禁用"、"已删除"三个 Tab，默认显示活跃 key 并按最后使用时间排序。

**Architecture:** 前端新增 Tab 切换逻辑，后端新增 `statusFilter` 参数支持按活跃状态筛选。活跃 Tab 显示 `isActive=true` 且未过期的 key，过期/禁用 Tab 显示 `isActive=false` 或已过期的 key。

**Tech Stack:** Vue 3, Express.js, Redis

---

## Task 1: 后端 - 新增 statusFilter 参数支持

**Files:**
- Modify: `src/routes/admin/apiKeys.js:176-346`
- Modify: `src/models/redis.js:833-993`

**Step 1: 更新路由层参数解析**

在 `src/routes/admin/apiKeys.js` 的 `router.get('/api-keys', ...)` 中添加 `statusFilter` 参数：

```javascript
// 在 req.query 解构中添加（约 line 178-198）
const {
  // 分页参数
  page = 1,
  pageSize = 20,
  // 搜索参数
  searchMode = 'apiKey',
  search = '',
  // 筛选参数
  tag = '',
  isActive = '',
  models = '', // 模型筛选（逗号分隔）
  statusFilter = '', // 新增：状态筛选 ('active' | 'inactive')
  // 排序参数
  sortBy = 'createdAt',
  sortOrder = 'desc',
  // ... 其他参数
} = req.query
```

**Step 2: 更新 redis.getApiKeysPaginated 调用**

在 `src/routes/admin/apiKeys.js` 约 line 335-345 处，传递 `statusFilter` 参数：

```javascript
result = await redis.getApiKeysPaginated({
  page: pageNum,
  pageSize: pageSizeNum,
  searchMode,
  search,
  tag,
  isActive,
  statusFilter, // 新增
  sortBy: validSortBy,
  sortOrder: validSortOrder,
  modelFilter
})
```

**Step 3: 更新 redis.getApiKeysPaginated 函数**

在 `src/models/redis.js` 的 `getApiKeysPaginated` 函数中添加 `statusFilter` 参数处理：

```javascript
// 在 options 解构中添加（约 line 833-845）
async getApiKeysPaginated(options = {}) {
  const {
    page = 1,
    pageSize = 20,
    searchMode = 'apiKey',
    search = '',
    tag = '',
    isActive = '',
    statusFilter = '', // 新增
    sortBy = 'createdAt',
    sortOrder = 'desc',
    excludeDeleted = true,
    modelFilter = []
  } = options

  // ... 现有代码 ...

  // 在状态筛选后添加（约 line 898 之后）
  // 状态组合筛选（active: 活跃且未过期, inactive: 禁用或已过期）
  if (statusFilter) {
    const now = Date.now()
    if (statusFilter === 'active') {
      // 活跃：isActive=true 且未过期（无过期时间或过期时间大于当前时间）
      filteredKeys = filteredKeys.filter((k) => {
        if (!k.isActive) return false
        if (!k.expiresAt) return true
        return new Date(k.expiresAt).getTime() > now
      })
    } else if (statusFilter === 'inactive') {
      // 非活跃：isActive=false 或已过期
      filteredKeys = filteredKeys.filter((k) => {
        if (!k.isActive) return true
        if (k.expiresAt && new Date(k.expiresAt).getTime() <= now) return true
        return false
      })
    }
  }

  // ... 后续代码 ...
}
```

**Step 4: 更新费用排序函数**

在 `src/routes/admin/apiKeys.js` 的 `getApiKeysSortedByCostPrecomputed` 和 `getApiKeysSortedByCostCustom` 函数中添加相同的筛选逻辑。

**Step 5: 验证后端改动**

Run: `npm run lint`
Expected: 无错误

---

## Task 2: 前端 - Tab 结构调整

**Files:**
- Modify: `web/admin-spa/src/views/ApiKeysView.vue:14-56`

**Step 1: 更新 Tab 导航模板**

将现有的两 Tab 结构改为三 Tab：

```vue
<!-- Tab Navigation -->
<div class="border-b border-gray-200 dark:border-gray-700">
  <nav aria-label="Tabs" class="-mb-px flex space-x-8">
    <!-- 活跃 Keys Tab -->
    <button
      :class="[
        'whitespace-nowrap border-b-2 px-1 py-2 text-sm font-medium',
        activeTab === 'active'
          ? 'border-blue-500 text-blue-600'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-300'
      ]"
      @click="switchToActiveTab"
    >
      活跃 Keys
      <span
        v-if="activeKeyCount > 0"
        class="ml-2 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300"
      >
        {{ activeKeyCount }}
      </span>
    </button>
    <!-- 过期/禁用 Keys Tab -->
    <button
      :class="[
        'whitespace-nowrap border-b-2 px-1 py-2 text-sm font-medium',
        activeTab === 'inactive'
          ? 'border-blue-500 text-blue-600'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-300'
      ]"
      @click="switchToInactiveTab"
    >
      过期/禁用
      <span
        v-if="inactiveKeyCount > 0"
        class="ml-2 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-300"
      >
        {{ inactiveKeyCount }}
      </span>
    </button>
    <!-- 已删除 Keys Tab -->
    <button
      :class="[
        'whitespace-nowrap border-b-2 px-1 py-2 text-sm font-medium',
        activeTab === 'deleted'
          ? 'border-blue-500 text-blue-600'
          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:text-gray-300'
      ]"
      @click="loadDeletedApiKeys"
    >
      已删除
      <span
        v-if="deletedApiKeys.length > 0"
        class="ml-2 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-900 dark:bg-gray-700 dark:text-gray-100"
      >
        {{ deletedApiKeys.length }}
      </span>
    </button>
  </nav>
</div>
```

**Step 2: 更新 Tab 内容区域条件**

将 `v-if="activeTab === 'active'"` 保持不变，确保过期/禁用 Tab 使用相同的内容区域但不同数据。

---

## Task 3: 前端 - 默认排序调整

**Files:**
- Modify: `web/admin-spa/src/views/ApiKeysView.vue:2292`

**Step 1: 修改默认排序字段**

将默认排序从 `createdAt` 改为 `lastUsedAt`：

```javascript
// 约 line 2292
const apiKeysSortBy = ref('lastUsedAt') // 默认排序为最后使用时间
const apiKeysSortOrder = ref('desc') // 倒序（最近使用的在前）
```

**Step 2: 添加 Tab 切换时的排序逻辑**

新增排序状态管理，不同 Tab 使用不同默认排序：

```javascript
// 新增响应式变量
const inactiveSortBy = ref('expiresAt') // 过期/禁用 Tab 默认按过期时间排序
const inactiveSortOrder = ref('asc') // 升序（先过期的在前）

// Tab 切换函数
const switchToActiveTab = () => {
  if (activeTab.value === 'active') return
  activeTab.value = 'active'
  // 恢复活跃 Tab 的默认排序
  apiKeysSortBy.value = 'lastUsedAt'
  apiKeysSortOrder.value = 'desc'
  loadApiKeys()
}

const switchToInactiveTab = () => {
  if (activeTab.value === 'inactive') return
  activeTab.value = 'inactive'
  // 切换到过期/禁用 Tab 的默认排序
  apiKeysSortBy.value = 'expiresAt'
  apiKeysSortOrder.value = 'asc'
  loadApiKeys()
}
```

---

## Task 4: 前端 - loadApiKeys 函数更新

**Files:**
- Modify: `web/admin-spa/src/views/ApiKeysView.vue:2667-2778`

**Step 1: 添加 statusFilter 参数**

在 `loadApiKeys` 函数中根据当前 Tab 设置 `statusFilter`：

```javascript
// 在构建请求参数部分添加（约 line 2690 附近）
// 状态筛选参数
if (activeTab.value === 'active') {
  params.set('statusFilter', 'active')
} else if (activeTab.value === 'inactive') {
  params.set('statusFilter', 'inactive')
}
```

**Step 2: 移除 isActive 筛选逻辑**

由于 `statusFilter` 已包含 isActive 逻辑，移除重复的 `isActive` 参数：

```javascript
// 删除或注释掉这行（如果存在）
// params.set('isActive', ...)
```

---

## Task 5: 前端 - 数量统计

**Files:**
- Modify: `web/admin-spa/src/views/ApiKeysView.vue`

**Step 1: 添加后端 API 返回计数**

后端需要在分页响应中返回各状态的 key 数量。修改 `src/models/redis.js` 的 `getApiKeysPaginated` 返回值：

```javascript
// 在返回对象中添加
return {
  items,
  pagination: { ... },
  availableTags,
  statusCounts: {
    active: activeCount,   // 活跃且未过期
    inactive: inactiveCount // 禁用或已过期
  }
}
```

**Step 2: 前端接收并显示计数**

```javascript
// 新增响应式变量
const activeKeyCount = ref(0)
const inactiveKeyCount = ref(0)

// 在 loadApiKeys 中更新
if (data.data?.statusCounts) {
  activeKeyCount.value = data.data.statusCounts.active || 0
  inactiveKeyCount.value = data.data.statusCounts.inactive || 0
}
```

---

## Task 6: 格式化并验证

**Files:**
- Modify: `web/admin-spa/src/views/ApiKeysView.vue`
- Modify: `src/routes/admin/apiKeys.js`
- Modify: `src/models/redis.js`

**Step 1: 格式化修改的文件**

Run: `npx prettier --write web/admin-spa/src/views/ApiKeysView.vue src/routes/admin/apiKeys.js src/models/redis.js`

**Step 2: 运行 lint 检查**

Run: `npm run lint`
Expected: 无错误

**Step 3: 运行测试**

Run: `npm test`
Expected: 所有测试通过

**Step 4: 手动验证**

1. 启动开发服务器：`npm run dev`
2. 访问 `/admin-next/api-keys` 页面
3. 验证默认显示"活跃 Keys" Tab
4. 验证排序按最后使用时间倒序
5. 点击"过期/禁用" Tab，验证数据正确
6. 验证排序按过期时间升序

**Step 5: 提交**

```bash
git add web/admin-spa/src/views/ApiKeysView.vue src/routes/admin/apiKeys.js src/models/redis.js
git commit -m "feat(api-keys): add tab categorization for active/inactive/deleted keys

- Add statusFilter parameter to backend API
- Default sort by lastUsedAt (desc) for active tab
- Default sort by expiresAt (asc) for inactive tab
- Show status counts in tab badges"
```
