<template>
  <div class="tab-content">
    <!-- 去掉内层 .card：外层 MainLayout 已是卡片，避免卡片套卡片 -->
    <div class="relative flex flex-col">
      <!-- 概览卡片 -->
      <div class="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        <div class="stat-card">
          <p class="text-sm font-semibold text-gray-600 dark:text-gray-400">代理总数</p>
          <p class="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">
            {{ store.overview?.total ?? 0 }}
          </p>
        </div>
        <div class="stat-card">
          <p class="text-sm font-semibold text-gray-600 dark:text-gray-400">健康</p>
          <p class="text-lg font-bold text-green-600 dark:text-green-400 sm:text-xl">
            {{ store.overview?.healthy ?? 0 }}
          </p>
        </div>
        <div class="stat-card">
          <p class="text-sm font-semibold text-gray-600 dark:text-gray-400">不健康</p>
          <p class="text-lg font-bold text-red-500 dark:text-red-400 sm:text-xl">
            {{ store.overview?.unhealthy ?? 0 }}
          </p>
        </div>
        <div class="stat-card">
          <p class="text-sm font-semibold text-gray-600 dark:text-gray-400">分组 / 版本</p>
          <p class="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl">
            {{ store.overview?.groups ?? 0 }} / {{ store.overview?.routeVersion ?? 0 }}
          </p>
        </div>
      </div>

      <!-- 区域切换：移动端纵向堆叠，桌面端单行（操作靠右） -->
      <div class="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <!-- 左侧：列表 / 分组切换 -->
        <div class="flex gap-2">
          <button
            v-for="tab in ['proxies', 'groups']"
            :key="tab"
            :class="[
              'flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none',
              activeTab === tab
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            ]"
            @click="activeTab = tab"
          >
            {{ tab === 'proxies' ? '代理列表' : '分组管理' }}
          </button>
        </div>
        <!-- 右侧：操作随 tab 切换（窄屏可换行，桌面靠右） -->
        <div class="flex flex-wrap gap-2 sm:ml-auto">
          <button
            class="inline-flex items-center rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            @click="openSettingsModal()"
          >
            <i class="fas fa-gear mr-2" />设置
          </button>
          <button
            class="inline-flex items-center rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            @click="refreshAll"
          >
            <i class="fas fa-rotate mr-1.5" :class="{ 'fa-spin': refreshing }" />刷新
          </button>
          <button
            v-if="activeTab === 'proxies'"
            class="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            @click="openProxyModal()"
          >
            <i class="fas fa-plus mr-2" />添加代理
          </button>
          <button
            v-if="activeTab === 'groups'"
            class="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            @click="openGroupModal()"
          >
            <i class="fas fa-plus mr-2" />添加分组
          </button>
        </div>
      </div>

      <!-- 代理列表 -->
      <div v-show="activeTab === 'proxies'" class="flex min-h-0 flex-1 flex-col">
        <!-- 桌面：表格（横向滚动） -->
        <div
          class="hidden min-h-0 flex-1 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 md:block"
        >
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="sticky top-0 z-10 bg-gray-100 dark:bg-gray-700">
              <tr>
                <th class="th-cell">名称 / 地址</th>
                <th class="th-cell">状态</th>
                <th class="th-cell">质量</th>
                <th class="th-cell">出口 IP</th>
                <th class="th-cell">分组</th>
                <th class="th-cell text-right">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              <tr v-if="store.loadingProxies">
                <td
                  class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                  colspan="6"
                >
                  <i class="fas fa-spinner fa-spin mr-2 text-blue-500" />加载中...
                </td>
              </tr>
              <tr v-else-if="store.proxies.length === 0">
                <td
                  class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                  colspan="6"
                >
                  暂无代理，点击左上角添加
                </td>
              </tr>
              <tr
                v-for="proxy in store.proxies"
                v-else
                :key="proxy.id"
                class="hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <td class="px-4 py-3">
                  <div class="font-medium text-gray-900 dark:text-gray-100">{{ proxy.name }}</div>
                  <div class="font-mono text-sm text-gray-500 dark:text-gray-400">
                    {{ proxy.url }}
                  </div>
                </td>
                <td class="px-4 py-3">
                  <span :class="['badge', statusClass(proxy)]">{{ statusLabel(proxy) }}</span>
                </td>
                <td class="px-4 py-3">
                  <span v-if="proxy.quality" :class="['badge', gradeClass(proxy.quality.grade)]">
                    {{ proxy.quality.grade }} ({{ proxy.quality.score }})
                  </span>
                  <span v-else class="text-sm text-gray-400">未检测</span>
                </td>
                <td class="px-4 py-3 font-mono text-sm text-gray-600 dark:text-gray-300">
                  {{ proxy.exitInfo?.ip || '-' }}
                </td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                  {{ groupNames(proxy.groupIds) }}
                </td>
                <td class="px-4 py-3 text-right text-sm">
                  <div class="flex flex-wrap items-center justify-end gap-1">
                    <button class="op-btn op-cyan" @click="runHealthCheck(proxy)">
                      <i class="fas fa-heart-pulse" />健康检查
                    </button>
                    <button class="op-btn op-violet" @click="runQualityCheck(proxy)">
                      <i class="fas fa-gauge-high" />质量检测
                    </button>
                    <button class="op-btn op-blue" @click="openDetail(proxy)">
                      <i class="fas fa-circle-info" />详情
                    </button>
                    <button class="op-btn op-gray" @click="openProxyModal(proxy)">
                      <i class="fas fa-pen" />编辑
                    </button>
                    <button class="op-btn op-red" @click="removeProxy(proxy)">
                      <i class="fas fa-trash" />删除
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 移动端：卡片 -->
        <div class="space-y-3 md:hidden">
          <div
            v-if="store.loadingProxies"
            class="card p-6 text-center text-sm text-gray-500 dark:text-gray-400"
          >
            <i class="fas fa-spinner fa-spin mr-2 text-blue-500" />加载中...
          </div>
          <div
            v-else-if="store.proxies.length === 0"
            class="card p-6 text-center text-sm text-gray-500 dark:text-gray-400"
          >
            暂无代理，点击左上角添加
          </div>
          <div v-for="proxy in store.proxies" v-else :key="proxy.id" class="card p-4">
            <div class="mb-3 flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="truncate font-medium text-gray-900 dark:text-gray-100">
                  {{ proxy.name }}
                </div>
                <div class="break-all font-mono text-sm text-gray-500 dark:text-gray-400">
                  {{ proxy.url }}
                </div>
              </div>
              <span :class="['badge flex-shrink-0', statusClass(proxy)]">
                {{ statusLabel(proxy) }}
              </span>
            </div>
            <div class="mb-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <p class="mb-1 text-gray-500 dark:text-gray-400">质量</p>
                <span v-if="proxy.quality" :class="['badge', gradeClass(proxy.quality.grade)]">
                  {{ proxy.quality.grade }} ({{ proxy.quality.score }})
                </span>
                <span v-else class="text-gray-400">未检测</span>
              </div>
              <div>
                <p class="mb-1 text-gray-500 dark:text-gray-400">出口 IP</p>
                <p class="font-mono text-gray-700 dark:text-gray-200">
                  {{ proxy.exitInfo?.ip || '-' }}
                </p>
              </div>
              <div class="col-span-2">
                <p class="mb-1 text-gray-500 dark:text-gray-400">分组</p>
                <p class="text-gray-700 dark:text-gray-200">{{ groupNames(proxy.groupIds) }}</p>
              </div>
            </div>
            <div
              class="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-700"
            >
              <button class="op-btn op-cyan" @click="runHealthCheck(proxy)">
                <i class="fas fa-heart-pulse" />健康检查
              </button>
              <button class="op-btn op-violet" @click="runQualityCheck(proxy)">
                <i class="fas fa-gauge-high" />质量检测
              </button>
              <button class="op-btn op-blue" @click="openDetail(proxy)">
                <i class="fas fa-circle-info" />详情
              </button>
              <button class="op-btn op-gray" @click="openProxyModal(proxy)">
                <i class="fas fa-pen" />编辑
              </button>
              <button class="op-btn op-red" @click="removeProxy(proxy)">
                <i class="fas fa-trash" />删除
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 分组列表 -->
      <div v-show="activeTab === 'groups'" class="flex min-h-0 flex-1 flex-col">
        <!-- 桌面：表格（横向滚动） -->
        <div
          class="hidden min-h-0 flex-1 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 md:block"
        >
          <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead class="sticky top-0 z-10 bg-gray-100 dark:bg-gray-700">
              <tr>
                <th class="th-cell">名称</th>
                <th class="th-cell">描述</th>
                <th class="th-cell">成员数</th>
                <th class="th-cell">状态</th>
                <th class="th-cell text-right">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
              <tr v-if="store.loadingGroups">
                <td
                  class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                  colspan="5"
                >
                  <i class="fas fa-spinner fa-spin mr-2 text-blue-500" />加载中...
                </td>
              </tr>
              <tr v-else-if="store.groups.length === 0">
                <td
                  class="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400"
                  colspan="5"
                >
                  暂无分组
                </td>
              </tr>
              <tr
                v-for="group in store.groups"
                v-else
                :key="group.id"
                class="hover:bg-gray-50 dark:hover:bg-gray-700/50"
              >
                <td class="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                  {{ group.name }}
                </td>
                <td class="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                  {{ group.description || '-' }}
                </td>
                <td class="px-4 py-3 text-gray-700 dark:text-gray-200">{{ group.memberCount }}</td>
                <td class="px-4 py-3">
                  <span :class="['badge', group.status === 1 ? 'badge-green' : 'badge-gray']">
                    {{ group.status === 1 ? '启用' : '禁用' }}
                  </span>
                </td>
                <td class="px-4 py-3 text-right text-sm">
                  <div class="flex flex-wrap items-center justify-end gap-1">
                    <button class="op-btn op-gray" @click="openGroupModal(group)">
                      <i class="fas fa-pen" />编辑
                    </button>
                    <button class="op-btn op-red" @click="removeGroup(group)">
                      <i class="fas fa-trash" />删除
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 移动端：卡片 -->
        <div class="space-y-3 md:hidden">
          <div
            v-if="store.loadingGroups"
            class="card p-6 text-center text-sm text-gray-500 dark:text-gray-400"
          >
            <i class="fas fa-spinner fa-spin mr-2 text-blue-500" />加载中...
          </div>
          <div
            v-else-if="store.groups.length === 0"
            class="card p-6 text-center text-sm text-gray-500 dark:text-gray-400"
          >
            暂无分组
          </div>
          <div v-for="group in store.groups" v-else :key="group.id" class="card p-4">
            <div class="mb-3 flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="truncate font-medium text-gray-900 dark:text-gray-100">
                  {{ group.name }}
                </div>
                <div class="text-sm text-gray-500 dark:text-gray-400">
                  {{ group.description || '-' }}
                </div>
              </div>
              <span
                :class="['badge flex-shrink-0', group.status === 1 ? 'badge-green' : 'badge-gray']"
              >
                {{ group.status === 1 ? '启用' : '禁用' }}
              </span>
            </div>
            <div class="mb-3 text-sm text-gray-600 dark:text-gray-300">
              成员数：{{ group.memberCount }}
            </div>
            <div
              class="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-700"
            >
              <button class="op-btn op-gray" @click="openGroupModal(group)">
                <i class="fas fa-pen" />编辑
              </button>
              <button class="op-btn op-red" @click="removeGroup(group)">
                <i class="fas fa-trash" />删除
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 代理增改弹窗 -->
    <ModalTransition :teleport="false">
      <div v-if="proxyModal" class="modal fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="modal-content mx-auto max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
          <div class="mb-5 flex items-center justify-between">
            <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">
              {{ proxyForm.id ? '编辑代理' : '添加代理' }}
            </h3>
            <button
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              @click="proxyModal = false"
            >
              <i class="fas fa-times text-xl" />
            </button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="form-label">代理地址</label>
              <input
                v-model="proxyForm.url"
                class="form-input font-mono"
                placeholder="socks5://user:pass@host:1080"
              />
              <p class="mt-1 text-sm text-gray-400">支持 http/https/socks4/socks5</p>
              <p v-if="proxyForm.id" class="mt-1 text-sm text-amber-600 dark:text-amber-400">
                出于安全，地址中的账号密码已脱敏（***）。保持脱敏地址不变即沿用原凭据；要更换请输入完整地址。
              </p>
            </div>
            <div>
              <label class="form-label">名称</label>
              <input v-model="proxyForm.name" class="form-input" placeholder="可选，默认用地址" />
            </div>
            <div>
              <label class="form-label">基础权重 (0-100)</label>
              <input
                v-model.number="proxyForm.baseWeight"
                class="form-input"
                max="100"
                min="0"
                type="number"
              />
              <p class="mt-1 text-sm text-gray-400">
                权重越高被选中概率越大；动态权重在此基础上按健康/延迟/成功率自动调整
              </p>
            </div>
            <div v-if="proxyForm.id">
              <label class="form-label">状态</label>
              <CustomDropdown
                v-model="proxyForm.status"
                accent="green"
                icon="fa-toggle-on"
                :options="proxyStatusOptions"
                placeholder="选择状态"
              />
            </div>
            <div>
              <label class="form-label">所属分组</label>
              <div class="flex flex-wrap gap-2">
                <label
                  v-for="group in store.groups"
                  :key="group.id"
                  class="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-gray-300 px-2 py-1 text-sm dark:border-gray-600"
                >
                  <input v-model="proxyForm.groupIds" type="checkbox" :value="group.id" />
                  {{ group.name }}
                </label>
                <span v-if="store.groups.length === 0" class="text-sm text-gray-400">暂无分组</span>
              </div>
            </div>
          </div>
          <div class="mt-6 flex gap-3">
            <button class="btn-cancel" @click="proxyModal = false">取消</button>
            <button class="btn-primary" :disabled="saving" @click="saveProxy">
              <i v-if="saving" class="fas fa-spinner fa-spin mr-2" />{{
                saving ? '提交中...' : '确定'
              }}
            </button>
          </div>
        </div>
      </div>
    </ModalTransition>

    <!-- 分组增改弹窗 -->
    <ModalTransition :teleport="false">
      <div v-if="groupModal" class="modal fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="modal-content mx-auto w-full max-w-md overflow-y-auto p-6">
          <div class="mb-5 flex items-center justify-between">
            <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">
              {{ groupForm.id ? '编辑分组' : '添加分组' }}
            </h3>
            <button
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              @click="groupModal = false"
            >
              <i class="fas fa-times text-xl" />
            </button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="form-label">分组名称</label>
              <input v-model="groupForm.name" class="form-input" placeholder="如：美国节点" />
            </div>
            <div>
              <label class="form-label">描述</label>
              <input v-model="groupForm.description" class="form-input" placeholder="可选" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="form-label">状态</label>
                <CustomDropdown
                  v-model="groupForm.status"
                  accent="green"
                  icon="fa-toggle-on"
                  :options="groupStatusOptions"
                  placeholder="选择状态"
                />
              </div>
              <div>
                <label class="form-label">排序</label>
                <input v-model.number="groupForm.sort" class="form-input" type="number" />
              </div>
            </div>
          </div>
          <div class="mt-6 flex gap-3">
            <button class="btn-cancel" @click="groupModal = false">取消</button>
            <button class="btn-primary" :disabled="saving" @click="saveGroup">
              <i v-if="saving" class="fas fa-spinner fa-spin mr-2" />{{
                saving ? '提交中...' : '确定'
              }}
            </button>
          </div>
        </div>
      </div>
    </ModalTransition>

    <!-- 详情弹窗 -->
    <ModalTransition :teleport="false">
      <div v-if="detailModal" class="modal fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="modal-content mx-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto p-6">
          <div class="mb-5 flex items-center justify-between">
            <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">
              {{ detailProxy?.name }} — 运行时状态
            </h3>
            <button
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              @click="detailModal = false"
            >
              <i class="fas fa-times text-xl" />
            </button>
          </div>
          <div v-if="detailProxy">
            <h4 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              各上下文权重
            </h4>
            <div v-if="detailProxy.states?.length" class="mb-4 overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead>
                  <tr class="text-left text-sm text-gray-500 dark:text-gray-400">
                    <th class="py-1 pr-4">上下文</th>
                    <th class="py-1 pr-4">权重</th>
                    <th class="py-1 pr-4">熔断</th>
                    <th class="py-1 pr-4">成功率(5m)</th>
                    <th class="py-1 pr-4">P99(ms)</th>
                    <th class="py-1 pr-4">请求(5m)</th>
                  </tr>
                </thead>
                <tbody class="text-gray-700 dark:text-gray-200">
                  <tr v-for="state in detailProxy.states" :key="state.contextKey">
                    <td class="py-1 pr-4 font-mono">{{ state.contextKey }}</td>
                    <td class="py-1 pr-4">{{ state.weight }}</td>
                    <td class="py-1 pr-4">{{ state.circuitState }}</td>
                    <td class="py-1 pr-4">{{ (state.successRate5m * 100).toFixed(1) }}%</td>
                    <td class="py-1 pr-4">{{ state.p99LatencyMs }}</td>
                    <td class="py-1 pr-4">{{ state.requests5m }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-else class="mb-4 text-sm text-gray-400">暂无业务流量统计</p>

            <h4
              v-if="detailProxy.quality"
              class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300"
            >
              质量检测 — {{ detailProxy.quality.grade }} ({{ detailProxy.quality.score }})
            </h4>
            <div v-if="detailProxy.quality" class="flex flex-wrap gap-2">
              <span
                v-for="item in detailProxy.quality.items"
                :key="item.target"
                :class="[
                  'badge',
                  item.status === 'pass'
                    ? 'badge-green'
                    : item.status === 'warn'
                      ? 'badge-yellow'
                      : 'badge-red'
                ]"
              >
                {{ item.target }}: {{ item.httpStatus || 'x' }} ({{ item.latencyMs }}ms)
              </span>
            </div>
          </div>
        </div>
      </div>
    </ModalTransition>

    <!-- 全局设置弹窗 -->
    <ModalTransition :teleport="false">
      <div
        v-if="settingsModal"
        class="modal fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div class="modal-content mx-auto max-h-[90vh] w-full max-w-lg overflow-y-auto p-6">
          <div class="mb-5 flex items-center justify-between">
            <h3 class="text-lg font-bold text-gray-900 dark:text-gray-100">全局设置</h3>
            <button
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              @click="settingsModal = false"
            >
              <i class="fas fa-times text-xl" />
            </button>
          </div>
          <p class="mb-4 text-sm text-gray-500 dark:text-gray-400">
            调优参数保存后立即生效，无需重启
          </p>

          <!-- 健康检查 -->
          <div class="mb-4">
            <h4 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">健康检查</h4>
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-sm text-gray-700 dark:text-gray-200">定时健康检查</span>
                <button
                  :aria-checked="settingsForm.healthCheckEnabled"
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                  :class="
                    settingsForm.healthCheckEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                  "
                  role="switch"
                  type="button"
                  @click="settingsForm.healthCheckEnabled = !settingsForm.healthCheckEnabled"
                >
                  <span
                    class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                    :class="settingsForm.healthCheckEnabled ? 'translate-x-6' : 'translate-x-1'"
                  />
                </button>
              </div>
              <div>
                <label class="form-label">探测目标 URL</label>
                <input
                  v-model="settingsForm.healthCheckUrl"
                  class="form-input font-mono"
                  placeholder="https://api.anthropic.com"
                />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="form-label">检查间隔（秒）</label>
                  <input
                    v-model.number="settingsForm.healthCheckIntervalSec"
                    class="form-input"
                    min="5"
                    type="number"
                  />
                </div>
                <div>
                  <label class="form-label">探测超时（秒）</label>
                  <input
                    v-model.number="settingsForm.healthCheckTimeoutSec"
                    class="form-input"
                    min="1"
                    type="number"
                  />
                </div>
                <div>
                  <label class="form-label">并发数</label>
                  <input
                    v-model.number="settingsForm.healthConcurrency"
                    class="form-input"
                    min="1"
                    type="number"
                  />
                </div>
                <div>
                  <label class="form-label">连续失败隔离阈值</label>
                  <input
                    v-model.number="settingsForm.healthFailureThreshold"
                    class="form-input"
                    min="1"
                    type="number"
                  />
                </div>
              </div>
            </div>
          </div>

          <!-- 熔断 -->
          <div class="mb-4">
            <h4 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">熔断</h4>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="form-label">触发失败次数</label>
                <input
                  v-model.number="settingsForm.circuitFailureThreshold"
                  class="form-input"
                  min="1"
                  type="number"
                />
              </div>
              <div>
                <label class="form-label">失败计数窗口（秒）</label>
                <input
                  v-model.number="settingsForm.circuitFailureWindowSec"
                  class="form-input"
                  min="1"
                  type="number"
                />
              </div>
              <div>
                <label class="form-label">冷却期（秒）</label>
                <input
                  v-model.number="settingsForm.circuitCooldownSec"
                  class="form-input"
                  min="1"
                  type="number"
                />
              </div>
            </div>
          </div>

          <!-- 慢启动 -->
          <div class="mb-2">
            <h4 class="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">慢启动</h4>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="form-label">爬坡时长（秒）</label>
                <input
                  v-model.number="settingsForm.slowStartDurationSec"
                  class="form-input"
                  min="0"
                  type="number"
                />
              </div>
            </div>
          </div>

          <div class="mt-6 flex gap-3">
            <button class="btn-cancel" @click="settingsModal = false">取消</button>
            <button class="btn-primary" :disabled="settingsSaving" @click="saveSettings">
              <i v-if="settingsSaving" class="fas fa-spinner fa-spin mr-2" />{{
                settingsSaving ? '保存中...' : '保存'
              }}
            </button>
          </div>
        </div>
      </div>
    </ModalTransition>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'

import ModalTransition from '@/components/common/ModalTransition.vue'
import { useProxyPoolStore } from '@/stores/proxyPool'
import { showToast } from '@/utils/tools'

const store = useProxyPoolStore()

const activeTab = ref('proxies')
const refreshing = ref(false)
const saving = ref(false)

const proxyModal = ref(false)
const groupModal = ref(false)
const detailModal = ref(false)
const detailProxy = ref(null)

const settingsModal = ref(false)
const settingsSaving = ref(false)
const settingsForm = ref({
  healthCheckEnabled: true,
  healthCheckUrl: '',
  healthCheckIntervalSec: 30,
  healthCheckTimeoutSec: 10,
  healthConcurrency: 10,
  healthFailureThreshold: 3,
  circuitFailureThreshold: 5,
  circuitFailureWindowSec: 10,
  circuitCooldownSec: 30,
  slowStartDurationSec: 60
})

const proxyForm = ref({
  id: null,
  url: '',
  name: '',
  baseWeight: 50,
  status: 1,
  groupIds: []
})
const groupForm = ref({ id: null, name: '', description: '', status: 1, sort: 0 })
const proxyStatusOptions = [
  { value: 1, label: '启用' },
  { value: 2, label: '禁用' }
]
const groupStatusOptions = [
  { value: 1, label: '启用' },
  { value: 0, label: '禁用' }
]

const statusLabel = (proxy) => {
  if (proxy.status !== 1) {
    return '禁用'
  }
  return proxy.isHealthy ? '健康' : '隔离'
}
const statusClass = (proxy) => {
  if (proxy.status !== 1) {
    return 'badge-gray'
  }
  return proxy.isHealthy ? 'badge-green' : 'badge-red'
}

const gradeClass = (grade) =>
  ({ A: 'badge-green', B: 'badge-green', C: 'badge-yellow', D: 'badge-orange', F: 'badge-red' })[
    grade
  ] || 'badge-gray'

const groupNames = (groupIds) => {
  if (!groupIds || groupIds.length === 0) {
    return '-'
  }
  return groupIds.map((id) => store.groups.find((group) => group.id === id)?.name || id).join(', ')
}

const refreshAll = async () => {
  refreshing.value = true
  await Promise.all([store.fetchOverview(), store.fetchProxies(), store.fetchGroups()])
  refreshing.value = false
}

const openProxyModal = (proxy) => {
  if (proxy) {
    proxyForm.value = {
      id: proxy.id,
      url: proxy.url,
      name: proxy.name,
      baseWeight: proxy.baseWeight,
      status: proxy.status,
      groupIds: [...(proxy.groupIds || [])]
    }
  } else {
    proxyForm.value = {
      id: null,
      url: '',
      name: '',
      baseWeight: 50,
      status: 1,
      groupIds: []
    }
  }
  proxyModal.value = true
}

const saveProxy = async () => {
  saving.value = true
  const { id, ...data } = proxyForm.value
  const res = id ? await store.updateProxy(id, data) : await store.createProxy(data)
  saving.value = false
  if (res.success) {
    showToast(id ? '代理已更新' : '代理已添加', 'success')
    proxyModal.value = false
    await refreshAll()
  } else {
    showToast(res.message || '保存失败', 'error')
  }
}

const removeProxy = async (proxy) => {
  if (!window.confirm(`确认删除代理 ${proxy.name}？`)) {
    return
  }
  const res = await store.deleteProxy(proxy.id)
  if (res.success) {
    showToast('已删除', 'success')
    await refreshAll()
  } else {
    showToast(res.message || '删除失败', 'error')
  }
}

const runHealthCheck = async (proxy) => {
  showToast('健康检查中...', 'info')
  const res = await store.healthCheckProxy(proxy.id)
  if (res.success) {
    showToast(
      `健康检查完成：${res.data.healthy ? '健康' : '不健康'} (${res.data.latencyMs}ms)`,
      res.data.healthy ? 'success' : 'warning'
    )
    await refreshAll()
  } else {
    showToast(res.message || '检查失败', 'error')
  }
}

const runQualityCheck = async (proxy) => {
  showToast('质量检测中（约 10-30s）...', 'info')
  const res = await store.qualityCheckProxy(proxy.id)
  if (res.success) {
    showToast(`质量检测完成：${res.data.grade} (${res.data.score}分)`, 'success')
    await refreshAll()
  } else {
    showToast(res.message || '检测失败', 'error')
  }
}

const openDetail = (proxy) => {
  detailProxy.value = proxy
  detailModal.value = true
}

const openGroupModal = (group) => {
  if (group) {
    groupForm.value = {
      id: group.id,
      name: group.name,
      description: group.description,
      status: group.status,
      sort: group.sort
    }
  } else {
    groupForm.value = { id: null, name: '', description: '', status: 1, sort: 0 }
  }
  groupModal.value = true
}

const saveGroup = async () => {
  if (!groupForm.value.name) {
    showToast('请填写分组名称', 'warning')
    return
  }
  saving.value = true
  const { id, ...data } = groupForm.value
  const res = id ? await store.updateGroup(id, data) : await store.createGroup(data)
  saving.value = false
  if (res.success) {
    showToast(id ? '分组已更新' : '分组已添加', 'success')
    groupModal.value = false
    await refreshAll()
  } else {
    showToast(res.message || '保存失败', 'error')
  }
}

const removeGroup = async (group) => {
  if (!window.confirm(`确认删除分组 ${group.name}？组内代理将解除关联`)) {
    return
  }
  const res = await store.deleteGroup(group.id)
  if (res.success) {
    showToast('已删除', 'success')
    await refreshAll()
  } else {
    showToast(res.message || '删除失败', 'error')
  }
}

// 时间字段在弹窗里用秒展示，存取时与后端的毫秒互转
const openSettingsModal = async () => {
  const res = await store.fetchSettings()
  if (!res.success) {
    showToast(res.message || '加载设置失败', 'error')
    return
  }
  const s = res.data
  settingsForm.value = {
    healthCheckEnabled: s.healthCheckEnabled,
    healthCheckUrl: s.healthCheckUrl,
    healthCheckIntervalSec: Math.round(s.healthCheckIntervalMs / 1000),
    healthCheckTimeoutSec: Math.round(s.healthCheckTimeoutMs / 1000),
    healthConcurrency: s.healthConcurrency,
    healthFailureThreshold: s.healthFailureThreshold,
    circuitFailureThreshold: s.circuitFailureThreshold,
    circuitFailureWindowSec: Math.round(s.circuitFailureWindowMs / 1000),
    circuitCooldownSec: Math.round(s.circuitCooldownMs / 1000),
    slowStartDurationSec: Math.round(s.slowStartDurationMs / 1000)
  }
  settingsModal.value = true
}

const saveSettings = async () => {
  const f = settingsForm.value
  const payload = {
    healthCheckEnabled: f.healthCheckEnabled,
    healthCheckUrl: f.healthCheckUrl,
    healthCheckIntervalMs: f.healthCheckIntervalSec * 1000,
    healthCheckTimeoutMs: f.healthCheckTimeoutSec * 1000,
    healthConcurrency: f.healthConcurrency,
    healthFailureThreshold: f.healthFailureThreshold,
    circuitFailureThreshold: f.circuitFailureThreshold,
    circuitFailureWindowMs: f.circuitFailureWindowSec * 1000,
    circuitCooldownMs: f.circuitCooldownSec * 1000,
    slowStartDurationMs: f.slowStartDurationSec * 1000
  }
  settingsSaving.value = true
  const res = await store.updateSettings(payload)
  settingsSaving.value = false
  if (res.success) {
    showToast('设置已保存并生效', 'success')
    settingsModal.value = false
  } else {
    showToast(res.message || '保存失败', 'error')
  }
}

onMounted(refreshAll)
</script>

<style scoped>
.th-cell {
  @apply px-4 py-3 text-left text-sm font-medium uppercase tracking-wider text-gray-500 dark:text-gray-300;
}

.stat-card {
  @apply rounded-xl border border-gray-100 bg-white/60 p-3 backdrop-blur-sm dark:border-gray-700 dark:bg-gray-800/60;
}

.badge {
  @apply inline-flex rounded-full px-2 py-1 text-sm font-medium;
}
.badge-green {
  @apply bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300;
}
.badge-red {
  @apply bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300;
}
.badge-yellow {
  @apply bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300;
}
.badge-orange {
  @apply bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300;
}
.badge-gray {
  @apply bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300;
}

/* 操作按钮：彩色胶囊，与账户 / ApiKey 等 tab 的操作按钮保持一致 */
.op-btn {
  @apply inline-flex items-center justify-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors;
}
.op-cyan {
  @apply bg-cyan-100 text-cyan-700 hover:bg-cyan-200 dark:bg-cyan-900/40 dark:text-cyan-300 dark:hover:bg-cyan-800/50;
}
.op-violet {
  @apply bg-violet-100 text-violet-700 hover:bg-violet-200 dark:bg-violet-900/40 dark:text-violet-300 dark:hover:bg-violet-800/50;
}
.op-blue {
  @apply bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-800/50;
}
.op-gray {
  @apply bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600;
}
.op-red {
  @apply bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-300 dark:hover:bg-red-800/50;
}

.form-label {
  @apply mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300;
}
.form-input {
  @apply w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white;
}

.btn-cancel {
  @apply flex-1 rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600;
}
.btn-primary {
  @apply flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50;
}

.modal {
  background-color: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}
.modal-content {
  background: white;
  border-radius: 12px;
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
}
:root[class~='dark'] .modal-content {
  background: #1f2937;
  color: #f3f4f6;
}
</style>
