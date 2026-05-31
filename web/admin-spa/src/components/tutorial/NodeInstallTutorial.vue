<template>
  <div class="mb-4 sm:mb-10 sm:mb-6">
    <h4
      class="mb-3 flex items-center text-lg font-semibold text-gray-800 dark:text-gray-300 sm:mb-4 sm:text-xl"
    >
      <span
        class="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-xs font-bold text-white sm:mr-3 sm:h-8 sm:w-8 sm:text-sm"
        >{{ stepNumber }}</span
      >
      {{ t('tutorial.auto.auto102') }}
    </h4>
    <p class="mb-4 text-sm text-gray-600 dark:text-gray-400 sm:mb-4 sm:mb-6 sm:text-base">
      {{ toolName }} {{ t('tutorial.auto.auto103') }}
    </p>

    <!-- Windows -->
    <div v-if="platform === 'windows'" class="node-install-section">
      <div
        class="mb-4 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 dark:border-blue-500/40 dark:from-blue-950/30 dark:to-indigo-950/30 sm:mb-6 sm:p-6"
      >
        <h5
          class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
        >
          <i class="fab fa-windows mr-2 text-blue-600" /> {{ t('tutorial.auto.auto104') }}
        </h5>
        <div class="mb-3 sm:mb-4">
          <p class="mb-2 text-sm text-gray-700 dark:text-gray-300 sm:mb-3 sm:text-base">
            {{ t('tutorial.auto.auto105') }}
          </p>
          <ol
            class="ml-2 list-inside list-decimal space-y-1 text-xs text-gray-600 dark:text-gray-400 sm:ml-4 sm:space-y-2 sm:text-sm"
          >
            <li>
              {{ t('tutorial.auto.auto106') }}
              <code
                class="rounded bg-gray-100 px-1 py-1 text-xs dark:bg-gray-800 dark:text-yellow-400 sm:px-2 sm:text-sm"
                >https://nodejs.org/</code
              >
            </li>
            <li>{{ t('tutorial.auto.auto107') }}</li>
            <li>
              {{ t('tutorial.auto.auto108') }}
              <code
                class="rounded bg-gray-100 px-1 py-1 text-xs dark:bg-gray-800 dark:text-yellow-400 sm:px-2 sm:text-sm"
                >.msi</code
              >
              {{ t('tutorial.auto.auto109') }}
            </li>
            <li>{{ t('tutorial.auto.auto110') }}</li>
          </ol>
        </div>
        <div class="mb-3 sm:mb-4">
          <p class="mb-2 text-sm text-gray-700 dark:text-gray-300 sm:mb-3 sm:text-base">
            {{ t('tutorial.auto.auto111') }}
          </p>
          <p class="mb-2 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
            {{ t('tutorial.auto.auto112') }}
          </p>
          <div
            class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 dark:border dark:border-gray-700 dark:bg-gray-900 sm:p-4 sm:text-sm"
          >
            <div class="mb-2">{{ t('tutorial.auto.auto113') }}</div>
            <div class="whitespace-nowrap text-gray-300">choco install nodejs</div>
            <div class="mb-2 mt-3">{{ t('tutorial.auto.auto114') }}</div>
            <div class="whitespace-nowrap text-gray-300">scoop install nodejs</div>
          </div>
        </div>
        <div
          class="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-500/40 dark:bg-blue-950/30 sm:p-4"
        >
          <h6 class="mb-2 text-sm font-medium text-blue-800 dark:text-blue-300 sm:text-base">
            {{ t('tutorial.auto.auto115') }}
          </h6>
          <ul class="space-y-1 text-xs text-blue-700 dark:text-blue-300 sm:text-sm">
            <li>{{ t('tutorial.auto.auto116') }}</li>
            <li>{{ t('tutorial.auto.auto117') }}</li>
            <li>{{ t('tutorial.auto.auto118') }}</li>
          </ul>
        </div>
      </div>
      <VerifyInstall :terminal="t('tutorial.auto.auto119')" />
    </div>

    <!-- macOS -->
    <div v-else-if="platform === 'macos'" class="node-install-section">
      <div
        class="mb-4 rounded-xl border border-gray-200 bg-gradient-to-r from-gray-50 to-gray-50 p-4 dark:border-gray-700 dark:from-gray-800 dark:to-gray-800 sm:mb-6 sm:p-6"
      >
        <h5
          class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
        >
          <i class="fab fa-apple mr-2 text-gray-700 dark:text-gray-400" />
          {{ t('tutorial.auto.auto120') }}
        </h5>
        <div class="mb-4">
          <p class="mb-3 text-gray-700 dark:text-gray-300">{{ t('tutorial.auto.auto121') }}</p>
          <p class="mb-2 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
            {{ t('tutorial.auto.auto122') }}
          </p>
          <div
            class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 dark:border dark:border-gray-700 dark:bg-gray-900 sm:p-4 sm:text-sm"
          >
            <div class="mb-2">{{ t('tutorial.auto.auto123') }}</div>
            <div class="whitespace-nowrap text-gray-300">brew update</div>
            <div class="mb-2 mt-3">{{ t('tutorial.auto.auto124') }}</div>
            <div class="whitespace-nowrap text-gray-300">brew install node</div>
          </div>
        </div>
        <div class="mb-4">
          <p class="mb-3 text-gray-700 dark:text-gray-300">{{ t('tutorial.auto.auto125') }}</p>
          <ol
            class="ml-2 list-inside list-decimal space-y-1 text-xs text-gray-600 dark:text-gray-400 sm:ml-4 sm:space-y-2 sm:text-sm"
          >
            <li>
              {{ t('tutorial.auto.auto126') }}
              <code
                class="rounded bg-gray-100 px-1 py-1 text-xs dark:bg-gray-700 sm:px-2 sm:text-sm"
                >https://nodejs.org/</code
              >
            </li>
            <li>{{ t('tutorial.auto.auto127') }}</li>
            <li>
              {{ t('tutorial.auto.auto128') }}
              <code
                class="rounded bg-gray-100 px-1 py-1 text-xs dark:bg-gray-700 sm:px-2 sm:text-sm"
                >.pkg</code
              >
              {{ t('tutorial.auto.auto109') }}
            </li>
            <li>{{ t('tutorial.auto.auto129') }}</li>
          </ol>
        </div>
        <div
          class="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-800 sm:p-4"
        >
          <h6 class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-300 sm:text-base">
            {{ t('tutorial.auto.auto130') }}
          </h6>
          <ul class="space-y-1 text-xs text-gray-700 dark:text-gray-300 sm:text-sm">
            <li>
              {{ t('tutorial.auto.auto131') }}
              <code class="rounded bg-gray-200 px-1 text-xs dark:bg-gray-700 sm:text-sm">sudo</code>
            </li>
            <li>{{ t('tutorial.auto.auto132') }}</li>
            <li>{{ t('tutorial.auto.auto133') }}</li>
          </ul>
        </div>
      </div>
      <VerifyInstall terminal="Terminal" />
    </div>

    <!-- Linux -->
    <div v-else class="node-install-section">
      <div
        class="mb-4 rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50 p-4 dark:border-orange-500/40 dark:from-orange-950/30 dark:to-amber-950/30 sm:mb-6 sm:p-6"
      >
        <h5
          class="mb-2 flex items-center text-base font-semibold text-gray-800 dark:text-gray-200 sm:mb-3 sm:text-lg"
        >
          <i class="fab fa-linux mr-2 text-orange-600" /> {{ t('tutorial.auto.auto134') }}
        </h5>
        <div class="mb-4">
          <p class="mb-3 text-gray-700 dark:text-gray-300">{{ t('tutorial.auto.auto135') }}</p>
          <p class="mb-2 text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
            {{ t('tutorial.auto.auto136') }}
          </p>
          <div
            class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 dark:border dark:border-gray-700 dark:bg-gray-900 sm:p-4 sm:text-sm"
          >
            <div class="mb-2">{{ t('tutorial.auto.auto137') }}</div>
            <div class="whitespace-nowrap text-gray-300">
              curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
            </div>
            <div class="mb-2 mt-3">{{ t('tutorial.auto.auto138') }}</div>
            <div class="whitespace-nowrap text-gray-300">source ~/.bashrc</div>
            <div class="mb-2 mt-3">{{ t('tutorial.auto.auto139') }}</div>
            <div class="whitespace-nowrap text-gray-300">nvm install --lts</div>
          </div>
        </div>
        <div class="mb-4">
          <p class="mb-3 text-gray-700 dark:text-gray-300">{{ t('tutorial.auto.auto111') }}</p>
          <div
            class="overflow-x-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 dark:border dark:border-gray-700 dark:bg-gray-900 sm:p-4 sm:text-sm"
          >
            <div class="mb-2"># Ubuntu/Debian</div>
            <div class="whitespace-nowrap text-gray-300">
              curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
            </div>
            <div class="whitespace-nowrap text-gray-300">sudo apt-get install -y nodejs</div>
            <div class="mb-2 mt-3"># Fedora</div>
            <div class="whitespace-nowrap text-gray-300">sudo dnf install nodejs</div>
            <div class="mb-2 mt-3"># Arch Linux</div>
            <div class="whitespace-nowrap text-gray-300">sudo pacman -S nodejs npm</div>
          </div>
        </div>
        <div
          class="rounded-lg border border-orange-200 bg-orange-50 p-3 dark:border-orange-500/40 dark:bg-orange-950/30 sm:p-4"
        >
          <h6 class="mb-2 text-sm font-medium text-orange-800 dark:text-orange-300 sm:text-base">
            {{ t('tutorial.auto.auto140') }}
          </h6>
          <ul class="space-y-1 text-xs text-orange-700 dark:text-orange-300 sm:text-sm">
            <li>{{ t('tutorial.auto.auto141') }}</li>
            <li>{{ t('tutorial.auto.auto142') }}</li>
            <li>{{ t('tutorial.auto.auto143') }}</li>
          </ul>
        </div>
      </div>
      <VerifyInstall :terminal="t('tutorial.auto.auto144')" />
    </div>
  </div>
</template>

<script setup>
import VerifyInstall from './VerifyInstall.vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
defineProps({
  platform: {
    type: String,
    required: true,
    validator: (value) => ['windows', 'macos', 'linux'].includes(value)
  },
  stepNumber: {
    type: [Number, String],
    default: 1
  },
  toolName: {
    type: String,
    default: 'CLI Tool'
  }
})
</script>
