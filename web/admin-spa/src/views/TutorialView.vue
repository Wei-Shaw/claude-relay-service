<template>
  <section class="help-center">
    <header class="help-hero">
      <div class="help-kicker">SETUP FIELD GUIDE / 01</div>
      <div class="help-hero-copy">
        <p>从安装到连接</p>
        <h1>把你的终端接入 Relay</h1>
        <span> 选择正在使用的系统与 CLI，我们会给出对应路径、环境变量和验证步骤。 </span>
      </div>
      <div class="help-hero-meta">
        <div>
          <small>当前指南</small>
          <strong>{{ currentToolTitle }}</strong>
        </div>
        <div>
          <small>运行平台</small>
          <strong>{{ currentSystemTitle }}</strong>
        </div>
      </div>
    </header>

    <div class="help-layout">
      <aside class="help-sidebar">
        <div class="selector-group">
          <p>01 / 选择平台</p>
          <div class="platform-options">
            <button
              v-for="system in tutorialSystems"
              :key="system.key"
              :class="{ active: activeTutorialSystem === system.key }"
              type="button"
              @click="activeTutorialSystem = system.key"
            >
              <i :class="system.icon" />
              <span>{{ system.name }}</span>
              <i class="fas fa-arrow-right" />
            </button>
          </div>
        </div>

        <div class="selector-group">
          <p>02 / 选择工具</p>
          <div class="tool-options">
            <button
              v-for="tool in cliTools"
              :key="tool.key"
              :class="{ active: activeCliTool === tool.key }"
              type="button"
              @click="activeCliTool = tool.key"
            >
              <span class="tool-icon"><i :class="tool.icon" /></span>
              <span>
                <strong>{{ tool.name }}</strong>
                <small>{{ tool.description }}</small>
              </span>
              <i class="fas fa-chevron-right" />
            </button>
          </div>
        </div>

        <div class="help-sidebar-note">
          <i class="fas fa-key" />
          <p>教程中的“API 密钥”就是用量查询页验证的同一个 Key，无需另外创建凭据。</p>
        </div>
      </aside>

      <main class="help-document">
        <div class="document-heading">
          <div>
            <p>{{ currentSystemTitle }} / {{ currentToolTitle }}</p>
            <h2>{{ currentToolTitle }} 配置指南</h2>
          </div>
          <span><i class="fas fa-circle-check" />按顺序完成并验证</span>
        </div>

        <div class="tutorial-surface">
          <component :is="currentTutorialComponent" :platform="activeTutorialSystem" />
        </div>
      </main>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import ClaudeCodeTutorial from '@/components/tutorial/ClaudeCodeTutorial.vue'
import GeminiCliTutorial from '@/components/tutorial/GeminiCliTutorial.vue'
import CodexTutorial from '@/components/tutorial/CodexTutorial.vue'
import DroidCliTutorial from '@/components/tutorial/DroidCliTutorial.vue'

const activeTutorialSystem = ref('windows')
const activeCliTool = ref('claude-code')

const tutorialSystems = [
  { key: 'windows', name: 'Windows', icon: 'fab fa-windows' },
  { key: 'macos', name: 'macOS', icon: 'fab fa-apple' },
  { key: 'linux', name: 'Linux / WSL2', icon: 'fab fa-linux' }
]

const cliTools = [
  {
    key: 'claude-code',
    name: 'Claude Code',
    description: 'Anthropic CLI',
    icon: 'fas fa-robot',
    component: ClaudeCodeTutorial
  },
  {
    key: 'codex',
    name: 'Codex',
    description: 'OpenAI CLI',
    icon: 'fas fa-code',
    component: CodexTutorial
  },
  {
    key: 'gemini-cli',
    name: 'Gemini CLI',
    description: 'Google CLI',
    icon: 'fab fa-google',
    component: GeminiCliTutorial
  },
  {
    key: 'droid-cli',
    name: 'Droid CLI',
    description: 'Factory CLI',
    icon: 'fas fa-terminal',
    component: DroidCliTutorial
  }
]

const currentTool = computed(() => cliTools.find((tool) => tool.key === activeCliTool.value))
const currentSystem = computed(() =>
  tutorialSystems.find((system) => system.key === activeTutorialSystem.value)
)
const currentToolTitle = computed(() => currentTool.value?.name || 'CLI 工具')
const currentSystemTitle = computed(() => currentSystem.value?.name || '当前系统')
const currentTutorialComponent = computed(() => currentTool.value?.component || null)
</script>

<style scoped>
.help-center {
  --help-code-bg: #17211d;
  overflow: hidden;
  border: 1px solid var(--page-line);
  border-radius: 0.8rem;
  background: color-mix(in srgb, var(--page-card) 91%, transparent);
  box-shadow: 0 1.5rem 4rem rgba(24, 38, 31, 0.055);
}

.help-hero {
  position: relative;
  min-height: 15rem;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: end;
  gap: clamp(1.2rem, 4vw, 3.5rem);
  overflow: hidden;
  border-bottom: 1px solid var(--page-line);
  padding: clamp(2rem, 5vw, 3.8rem) clamp(1.2rem, 4vw, 3rem) 2rem;
  background:
    linear-gradient(115deg, color-mix(in srgb, var(--page-green) 9%, transparent), transparent 48%),
    radial-gradient(
      circle at 86% 8%,
      color-mix(in srgb, var(--page-green) 16%, transparent),
      transparent 17rem
    ),
    color-mix(in srgb, var(--page-bg) 75%, var(--page-card));
}

.help-hero::after {
  position: absolute;
  top: 1.5rem;
  right: 2.5rem;
  width: 5.8rem;
  height: 5.8rem;
  border: 1px solid color-mix(in srgb, var(--page-green) 34%, var(--page-line));
  border-radius: 50%;
  box-shadow:
    0 0 0 1.2rem color-mix(in srgb, var(--page-green) 4%, transparent),
    0 0 0 2.4rem color-mix(in srgb, var(--page-green) 3%, transparent);
  content: '';
}

.help-kicker {
  position: relative;
  z-index: 1;
  align-self: stretch;
  display: flex;
  align-items: flex-start;
  color: var(--page-green);
  font:
    700 0.58rem ui-monospace,
    monospace;
  letter-spacing: 0.12em;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
}

.help-hero-copy {
  position: relative;
  z-index: 1;
  max-width: 43rem;
}

.help-hero-copy p {
  margin: 0 0 0.55rem;
  color: var(--page-green);
  font-size: 0.68rem;
  font-weight: 700;
}

.help-hero-copy h1 {
  margin: 0;
  color: var(--page-ink);
  font-size: clamp(2.1rem, 5vw, 3.65rem);
  line-height: 0.98;
  letter-spacing: -0.065em;
}

.help-hero-copy > span {
  display: block;
  max-width: 34rem;
  margin-top: 1rem;
  color: var(--page-muted);
  font-size: 0.75rem;
  line-height: 1.75;
}

.help-hero-meta {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(2, minmax(7rem, 1fr));
  border: 1px solid var(--page-line);
  border-radius: 0.55rem;
  background: color-mix(in srgb, var(--page-card) 76%, transparent);
  backdrop-filter: blur(8px);
}

.help-hero-meta > div {
  padding: 0.9rem 1rem;
}

.help-hero-meta > div + div {
  border-left: 1px solid var(--page-line);
}

.help-hero-meta small,
.help-hero-meta strong {
  display: block;
}

.help-hero-meta small {
  color: var(--page-muted);
  font:
    600 0.52rem ui-monospace,
    monospace;
  letter-spacing: 0.08em;
}

.help-hero-meta strong {
  margin-top: 0.3rem;
  font-size: 0.72rem;
}

.help-layout {
  display: grid;
  grid-template-columns: minmax(15rem, 0.72fr) minmax(0, 2fr);
}

.help-sidebar {
  border-right: 1px solid var(--page-line);
  padding: 1.4rem;
  background: color-mix(in srgb, var(--page-bg) 58%, transparent);
}

.selector-group + .selector-group {
  margin-top: 1.6rem;
}

.selector-group > p {
  margin: 0 0 0.65rem;
  color: var(--page-muted);
  font:
    700 0.55rem ui-monospace,
    monospace;
  letter-spacing: 0.11em;
}

.platform-options,
.tool-options {
  display: grid;
  gap: 0.35rem;
}

.platform-options button,
.tool-options button {
  width: 100%;
  display: grid;
  align-items: center;
  border: 1px solid transparent;
  border-radius: 0.48rem;
  color: var(--page-muted);
  background: transparent;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    color 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease;
}

.platform-options button {
  grid-template-columns: 1.2rem 1fr auto;
  gap: 0.5rem;
  padding: 0.62rem 0.72rem;
  font-size: 0.67rem;
}

.platform-options button > i:last-child,
.tool-options button > i:last-child {
  font-size: 0.52rem;
  opacity: 0;
  transform: translateX(-0.3rem);
  transition: 0.18s ease;
}

.platform-options button:hover,
.tool-options button:hover {
  color: var(--page-ink);
  background: color-mix(in srgb, var(--page-card) 72%, transparent);
  transform: translateX(2px);
}

.platform-options button.active,
.tool-options button.active {
  color: var(--page-ink);
  border-color: var(--page-line);
  background: var(--page-card);
  box-shadow: 0 0.45rem 1.2rem rgba(23, 34, 29, 0.06);
}

.platform-options button.active > i:last-child,
.tool-options button.active > i:last-child {
  color: var(--page-green);
  opacity: 1;
  transform: translateX(0);
}

.tool-options button {
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.65rem;
  padding: 0.65rem;
}

.tool-icon {
  width: 2rem;
  height: 2rem;
  display: grid;
  place-items: center;
  border: 1px solid var(--page-line);
  border-radius: 0.42rem;
  color: var(--page-green);
  background: color-mix(in srgb, var(--page-bg) 70%, transparent);
  font-size: 0.7rem;
}

.tool-options strong,
.tool-options small {
  display: block;
}

.tool-options strong {
  font-size: 0.68rem;
}

.tool-options small {
  margin-top: 0.16rem;
  color: var(--page-muted);
  font:
    0.53rem ui-monospace,
    monospace;
}

.help-sidebar-note {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.65rem;
  margin-top: 1.8rem;
  border-top: 1px solid var(--page-line);
  padding-top: 1rem;
  color: var(--page-muted);
}

.help-sidebar-note i {
  color: var(--page-green);
  font-size: 0.68rem;
}

.help-sidebar-note p {
  margin: 0;
  font-size: 0.59rem;
  line-height: 1.65;
}

.help-document {
  min-width: 0;
  padding: clamp(1.2rem, 4vw, 2.6rem);
}

.document-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  border-bottom: 1px solid var(--page-line);
  padding-bottom: 1rem;
}

.document-heading p,
.document-heading h2 {
  margin: 0;
}

.document-heading p {
  color: var(--page-green);
  font:
    700 0.54rem ui-monospace,
    monospace;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.document-heading h2 {
  margin-top: 0.35rem;
  font-size: clamp(1.2rem, 2vw, 1.75rem);
  letter-spacing: -0.045em;
}

.document-heading > span {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: var(--page-muted);
  font-size: 0.58rem;
}

.document-heading > span i {
  color: var(--page-green);
}

.tutorial-surface {
  padding-top: 1.5rem;
}

.tutorial-surface :deep(.tutorial-content),
.tutorial-surface :deep(.tutorial-section) {
  color: var(--page-ink);
}

.tutorial-surface :deep(.mb-4.sm\:mb-10.sm\:mb-6),
.tutorial-surface :deep(.mb-6.sm\:mb-10),
.tutorial-surface :deep(.mb-6.sm\:mb-8),
.tutorial-surface :deep(.mb-8) {
  margin-bottom: 1.3rem !important;
  border: 1px solid var(--page-line) !important;
  border-radius: 0.58rem !important;
  padding: 1rem !important;
  background: color-mix(in srgb, var(--page-card) 82%, transparent) !important;
}

.tutorial-surface :deep(h4) {
  margin-bottom: 0.8rem !important;
  color: var(--page-ink) !important;
  font-size: 0.92rem !important;
  letter-spacing: -0.02em;
}

.tutorial-surface :deep(h4 > span) {
  width: 1.7rem !important;
  height: 1.7rem !important;
  flex: 0 0 auto;
  margin-right: 0.65rem !important;
  border: 1px solid color-mix(in srgb, var(--page-green) 48%, var(--page-line)) !important;
  border-radius: 50% !important;
  color: var(--page-green) !important;
  background: var(--page-card) !important;
  font:
    700 0.58rem ui-monospace,
    monospace !important;
}

.tutorial-surface :deep(h5),
.tutorial-surface :deep(h6) {
  color: var(--page-ink) !important;
}

.tutorial-surface :deep(p),
.tutorial-surface :deep(li) {
  color: var(--page-muted) !important;
  font-size: 0.7rem !important;
  line-height: 1.7 !important;
}

.tutorial-surface :deep(code) {
  color: var(--page-forest) !important;
  background: color-mix(in srgb, var(--page-green) 11%, var(--page-card)) !important;
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace !important;
}

:global(.dark .tutorial-surface code) {
  color: var(--page-green) !important;
}

.tutorial-surface :deep(.rounded-xl),
.tutorial-surface :deep(.rounded-lg) {
  border-color: var(--page-line) !important;
  border-radius: 0.48rem !important;
  background-color: color-mix(in srgb, var(--page-bg) 64%, var(--page-card)) !important;
  background-image: none !important;
}

.tutorial-surface :deep(.bg-gray-900) {
  border: 1px solid color-mix(in srgb, var(--page-green) 22%, #27332e) !important;
  border-radius: 0.42rem !important;
  color: #91d4ae !important;
  background: var(--help-code-bg) !important;
  box-shadow: inset 0 1px rgba(255, 255, 255, 0.035);
  font-size: 0.65rem !important;
  line-height: 1.65;
}

.tutorial-surface :deep(.bg-gray-900 > *) {
  color: #cbd6d0 !important;
}

.tutorial-surface :deep(details) {
  overflow: hidden;
  border: 1px solid var(--page-line) !important;
  border-radius: 0.45rem !important;
  background: color-mix(in srgb, var(--page-bg) 60%, transparent) !important;
}

.tutorial-surface :deep(summary) {
  color: var(--page-ink) !important;
  background: transparent !important;
  font-size: 0.7rem !important;
}

@media (max-width: 960px) {
  .help-hero {
    grid-template-columns: auto 1fr;
  }

  .help-hero-meta {
    grid-column: 2;
    width: min(100%, 22rem);
  }

  .help-layout {
    grid-template-columns: 1fr;
  }

  .help-sidebar {
    border-right: 0;
    border-bottom: 1px solid var(--page-line);
  }

  .platform-options {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .tool-options {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .help-hero {
    min-height: auto;
    grid-template-columns: 1fr;
    padding: 1.5rem 1rem;
  }

  .help-hero::after,
  .help-kicker {
    display: none;
  }

  .help-hero-copy h1 {
    font-size: 2.25rem;
  }

  .help-hero-meta {
    grid-column: 1;
    width: 100%;
  }

  .help-sidebar,
  .help-document {
    padding: 1rem;
  }

  .platform-options,
  .tool-options {
    grid-template-columns: 1fr;
  }

  .document-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .tutorial-surface :deep(.mb-4.sm\:mb-10.sm\:mb-6),
  .tutorial-surface :deep(.mb-6.sm\:mb-10),
  .tutorial-surface :deep(.mb-6.sm\:mb-8),
  .tutorial-surface :deep(.mb-8) {
    padding: 0.8rem !important;
  }
}
</style>
