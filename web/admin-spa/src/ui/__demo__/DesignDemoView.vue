<template>
  <div class="design-demo-container">
    <!-- Header -->
    <div class="demo-header">
      <h1 class="demo-title">Vercel-Inspired Design System</h1>
      <p class="demo-subtitle">
        Bold contrast with black and white. Sharp edges and maximum clarity.
      </p>
    </div>

    <!-- Navigation -->
    <div class="demo-nav">
      <button
        v-for="section in sections"
        :key="section.id"
        :class="['nav-btn', { active: activeSection === section.id }]"
        @click="activeSection = section.id"
      >
        {{ section.name }}
      </button>
    </div>

    <!-- Demo Content -->
    <div class="demo-content">
      <!-- Typography Section -->
      <section v-if="activeSection === 'typography'" class="demo-section">
        <h2 class="section-title">Typography</h2>

        <div class="component-group">
          <div class="component-label">Headings</div>
          <div class="typography-examples">
            <h1 class="heading-1">Heading 1 - The quick brown fox</h1>
            <h2 class="heading-2">Heading 2 - The quick brown fox</h2>
            <h3 class="heading-3">Heading 3 - The quick brown fox</h3>
            <h4 class="heading-4">Heading 4 - The quick brown fox</h4>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Body Text</div>
          <div class="typography-examples">
            <p class="text-large">
              Large text - This is a paragraph with larger text size. Used for emphasis or
              introductions.
            </p>
            <p class="text-normal">
              Normal text - This is the standard paragraph text used throughout the application.
              It's optimized for readability.
            </p>
            <p class="text-small">
              Small text - Used for secondary information, captions, or metadata.
            </p>
            <p class="text-caption">
              Caption text - Used for labels, table headers, and small UI elements.
            </p>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Text Styles</div>
          <div class="typography-examples">
            <p class="text-normal"><strong>Bold text</strong> for emphasis</p>
            <p class="text-normal"><em>Italic text</em> for subtle emphasis</p>
            <p class="text-normal">
              <code class="inline-code">inline code</code> for technical terms
            </p>
            <p class="text-normal"><a class="text-link" href="#">Link text</a> for navigation</p>
            <p class="text-muted">Muted text for less important information</p>
            <p class="text-error">Error text for validation messages</p>
            <p class="text-success">Success text for confirmation messages</p>
          </div>
        </div>
      </section>

      <!-- Buttons Section -->
      <section v-if="activeSection === 'buttons'" class="demo-section">
        <h2 class="section-title">Buttons</h2>

        <div class="component-group">
          <div class="component-label">Primary Buttons</div>
          <div class="button-row">
            <button class="btn btn-primary">Primary</button>
            <button class="btn btn-primary btn-sm">Small</button>
            <button class="btn btn-primary btn-lg">Large</button>
            <button class="btn btn-primary" disabled>Disabled</button>
            <button class="btn btn-primary btn-loading">
              <span class="loading-spinner"></span>
              Loading
            </button>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Secondary Buttons</div>
          <div class="button-row">
            <button class="btn btn-secondary">Secondary</button>
            <button class="btn btn-secondary btn-sm">Small</button>
            <button class="btn btn-secondary btn-lg">Large</button>
            <button class="btn btn-secondary" disabled>Disabled</button>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Outline Buttons</div>
          <div class="button-row">
            <button class="btn btn-outline">Outline</button>
            <button class="btn btn-outline btn-sm">Small</button>
            <button class="btn btn-outline btn-lg">Large</button>
            <button class="btn btn-outline" disabled>Disabled</button>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Danger Buttons</div>
          <div class="button-row">
            <button class="btn btn-danger">Delete</button>
            <button class="btn btn-danger-outline">Remove</button>
            <button class="btn btn-danger" disabled>Disabled</button>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Ghost Buttons</div>
          <div class="button-row">
            <button class="btn btn-ghost">Ghost</button>
            <button class="btn btn-ghost btn-sm">Small</button>
            <button class="btn btn-ghost btn-lg">Large</button>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Icon Buttons</div>
          <div class="button-row">
            <button class="btn btn-icon">✓</button>
            <button class="btn btn-icon btn-primary">+</button>
            <button class="btn btn-icon btn-danger">×</button>
            <button class="btn btn-icon btn-secondary">⋯</button>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Button Groups</div>
          <div class="button-group">
            <button class="btn btn-secondary">Left</button>
            <button class="btn btn-secondary active">Center</button>
            <button class="btn btn-secondary">Right</button>
          </div>
        </div>
      </section>

      <!-- Form Inputs Section -->
      <section v-if="activeSection === 'inputs'" class="demo-section">
        <h2 class="section-title">Form Inputs</h2>

        <div class="component-group">
          <div class="component-label">Text Inputs</div>
          <div class="form-examples">
            <div class="form-field">
              <label class="form-label">Default Input</label>
              <input class="form-input" placeholder="Enter text..." type="text" />
            </div>
            <div class="form-field">
              <label class="form-label">With Value</label>
              <input class="form-input" type="text" value="Sample value" />
            </div>
            <div class="form-field">
              <label class="form-label">Disabled</label>
              <input class="form-input" disabled placeholder="Disabled input" type="text" />
            </div>
            <div class="form-field">
              <label class="form-label">With Error</label>
              <input class="form-input error" type="text" value="Invalid value" />
              <span class="form-error">This field is required</span>
            </div>
            <div class="form-field">
              <label class="form-label">With Help Text</label>
              <input class="form-input" placeholder="username" type="text" />
              <span class="form-help">Choose a unique username</span>
            </div>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Textarea</div>
          <div class="form-examples">
            <div class="form-field">
              <label class="form-label">Default Textarea</label>
              <textarea
                class="form-textarea"
                placeholder="Enter description..."
                rows="4"
              ></textarea>
            </div>
            <div class="form-field">
              <label class="form-label">With Content</label>
              <textarea class="form-textarea" rows="4">
This is some sample content in a textarea.</textarea
              >
            </div>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Select Dropdown</div>
          <div class="form-examples">
            <div class="form-field">
              <label class="form-label">Default Select</label>
              <select class="form-select">
                <option>Select an option...</option>
                <option>Option 1</option>
                <option>Option 2</option>
                <option>Option 3</option>
              </select>
            </div>
            <div class="form-field">
              <label class="form-label">Disabled Select</label>
              <select class="form-select" disabled>
                <option>Disabled</option>
              </select>
            </div>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Checkbox</div>
          <div class="form-examples">
            <label class="checkbox-label">
              <input checked class="form-checkbox" type="checkbox" />
              <span>Checked checkbox</span>
            </label>
            <label class="checkbox-label">
              <input class="form-checkbox" type="checkbox" />
              <span>Unchecked checkbox</span>
            </label>
            <label class="checkbox-label">
              <input class="form-checkbox" disabled type="checkbox" />
              <span>Disabled checkbox</span>
            </label>
            <label class="checkbox-label">
              <input checked class="form-checkbox" disabled type="checkbox" />
              <span>Disabled checked</span>
            </label>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Radio Buttons</div>
          <div class="form-examples">
            <label class="radio-label">
              <input checked class="form-radio" name="radio-demo" type="radio" />
              <span>Option 1 (selected)</span>
            </label>
            <label class="radio-label">
              <input class="form-radio" name="radio-demo" type="radio" />
              <span>Option 2</span>
            </label>
            <label class="radio-label">
              <input class="form-radio" name="radio-demo" type="radio" />
              <span>Option 3</span>
            </label>
            <label class="radio-label">
              <input class="form-radio" disabled name="radio-disabled" type="radio" />
              <span>Disabled option</span>
            </label>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Toggle Switch</div>
          <div class="form-examples">
            <label class="toggle-label">
              <input checked class="toggle-input" type="checkbox" />
              <span class="toggle-slider"></span>
              <span class="toggle-text">Enabled</span>
            </label>
            <label class="toggle-label">
              <input class="toggle-input" type="checkbox" />
              <span class="toggle-slider"></span>
              <span class="toggle-text">Disabled</span>
            </label>
            <label class="toggle-label">
              <input checked class="toggle-input" disabled type="checkbox" />
              <span class="toggle-slider"></span>
              <span class="toggle-text">Disabled (on)</span>
            </label>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Input with Icon</div>
          <div class="form-examples">
            <div class="form-field">
              <label class="form-label">Search</label>
              <div class="input-with-icon">
                <span class="input-icon">🔍</span>
                <input class="form-input with-icon" placeholder="Search..." type="text" />
              </div>
            </div>
            <div class="form-field">
              <label class="form-label">Email</label>
              <div class="input-with-icon">
                <span class="input-icon">✉</span>
                <input class="form-input with-icon" placeholder="email@example.com" type="email" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Cards Section -->
      <section v-if="activeSection === 'cards'" class="demo-section">
        <h2 class="section-title">Cards & Panels</h2>

        <div class="component-group">
          <div class="component-label">Stat Cards</div>
          <div class="cards-grid">
            <div class="stat-card">
              <div class="stat-label">Total Requests</div>
              <div class="stat-value">1,234,567</div>
              <div class="stat-trend positive">↑ 12.5%</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">API Keys</div>
              <div class="stat-value">42</div>
              <div class="stat-trend neutral">—</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Active Accounts</div>
              <div class="stat-value">8</div>
              <div class="stat-trend positive">↑ 2</div>
            </div>
            <div class="stat-card">
              <div class="stat-label">Error Rate</div>
              <div class="stat-value">0.3%</div>
              <div class="stat-trend negative">↓ 0.1%</div>
            </div>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Content Cards</div>
          <div class="cards-grid-2">
            <div class="content-card">
              <div class="card-header">
                <h3 class="card-title">Card Title</h3>
                <button class="btn btn-ghost btn-sm">Action</button>
              </div>
              <div class="card-body">
                <p>
                  This is a content card with a header, body, and footer. It can contain any
                  content.
                </p>
              </div>
              <div class="card-footer">
                <span class="text-small text-muted">Updated 2 hours ago</span>
              </div>
            </div>

            <div class="content-card">
              <div class="card-header">
                <h3 class="card-title">Another Card</h3>
              </div>
              <div class="card-body">
                <p>Cards maintain consistent spacing and hierarchy across the interface.</p>
                <button class="btn btn-primary btn-sm">Learn More</button>
              </div>
            </div>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Interactive Card</div>
          <div class="interactive-card">
            <div class="card-icon">🔑</div>
            <h3 class="card-title">Production API Key</h3>
            <p class="card-description">This key has full access to all endpoints</p>
            <div class="card-meta">
              <span class="badge badge-success">Active</span>
              <span class="text-small text-muted">Created 14 days ago</span>
            </div>
            <div class="card-actions">
              <button class="btn btn-secondary btn-sm">Edit</button>
              <button class="btn btn-outline btn-sm">View Details</button>
            </div>
          </div>
        </div>
      </section>

      <!-- Tables Section -->
      <section v-if="activeSection === 'tables'" class="demo-section">
        <h2 class="section-title">Tables</h2>

        <div class="component-group">
          <div class="component-label">Default Table</div>
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Usage</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <div class="table-cell-main">Production Key</div>
                    <div class="table-cell-sub">pk_live_1234567890</div>
                  </td>
                  <td><span class="badge badge-success">Active</span></td>
                  <td>1.2M tokens</td>
                  <td>2024-01-15</td>
                  <td>
                    <button class="btn btn-ghost btn-sm">Edit</button>
                  </td>
                </tr>
                <tr>
                  <td>
                    <div class="table-cell-main">Development Key</div>
                    <div class="table-cell-sub">pk_dev_9876543210</div>
                  </td>
                  <td><span class="badge badge-inactive">Inactive</span></td>
                  <td>45K tokens</td>
                  <td>2024-01-10</td>
                  <td>
                    <button class="btn btn-ghost btn-sm">Edit</button>
                  </td>
                </tr>
                <tr>
                  <td>
                    <div class="table-cell-main">Testing Key</div>
                    <div class="table-cell-sub">pk_test_1122334455</div>
                  </td>
                  <td><span class="badge badge-warning">Limited</span></td>
                  <td>892 tokens</td>
                  <td>2024-01-20</td>
                  <td>
                    <button class="btn btn-ghost btn-sm">Edit</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Compact Table</div>
          <div class="table-container">
            <table class="table-compact table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Requests</th>
                  <th>Tokens</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>claude-3-opus</td>
                  <td>1,234</td>
                  <td>456K</td>
                  <td>$12.34</td>
                </tr>
                <tr>
                  <td>claude-3-sonnet</td>
                  <td>5,678</td>
                  <td>1.2M</td>
                  <td>$45.67</td>
                </tr>
                <tr>
                  <td>claude-3-haiku</td>
                  <td>9,012</td>
                  <td>2.8M</td>
                  <td>$23.45</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- Badges & Status Section -->
      <section v-if="activeSection === 'badges'" class="demo-section">
        <h2 class="section-title">Badges & Status Indicators</h2>

        <div class="component-group">
          <div class="component-label">Status Badges</div>
          <div class="badge-row">
            <span class="badge badge-success">Active</span>
            <span class="badge badge-inactive">Inactive</span>
            <span class="badge badge-warning">Pending</span>
            <span class="badge badge-error">Error</span>
            <span class="badge badge-info">Info</span>
            <span class="badge badge-neutral">Neutral</span>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Dot Badges</div>
          <div class="badge-row">
            <span class="badge badge-dot badge-success">
              <span class="dot"></span>
              Online
            </span>
            <span class="badge badge-dot badge-error">
              <span class="dot"></span>
              Offline
            </span>
            <span class="badge badge-dot badge-warning">
              <span class="dot"></span>
              Away
            </span>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Count Badges</div>
          <div class="badge-row">
            <button class="btn btn-secondary">
              Messages <span class="badge badge-count">3</span>
            </button>
            <button class="btn btn-secondary">
              Notifications <span class="badge badge-count badge-error">99+</span>
            </button>
            <button class="btn btn-secondary">
              Updates <span class="badge badge-count badge-success">12</span>
            </button>
          </div>
        </div>
      </section>

      <!-- Alerts Section -->
      <section v-if="activeSection === 'alerts'" class="demo-section">
        <h2 class="section-title">Alerts & Messages</h2>

        <div class="component-group">
          <div class="component-label">Alert Types</div>
          <div class="alerts-stack">
            <div class="alert alert-success">
              <strong>Success!</strong> Your changes have been saved successfully.
            </div>
            <div class="alert alert-error">
              <strong>Error!</strong> Something went wrong. Please try again.
            </div>
            <div class="alert alert-warning">
              <strong>Warning!</strong> Your API key will expire in 3 days.
            </div>
            <div class="alert alert-info">
              <strong>Info:</strong> New features are available. Check the changelog.
            </div>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Dismissible Alerts</div>
          <div class="alerts-stack">
            <div class="alert alert-info alert-dismissible">
              <div class="alert-content">
                <strong>Tip:</strong> You can use keyboard shortcuts to navigate faster.
              </div>
              <button class="alert-close">×</button>
            </div>
          </div>
        </div>
      </section>

      <!-- Loading Section -->
      <section v-if="activeSection === 'loading'" class="demo-section">
        <h2 class="section-title">Loading States</h2>

        <div class="component-group">
          <div class="component-label">Spinners</div>
          <div class="loading-examples">
            <div class="spinner spinner-sm"></div>
            <div class="spinner"></div>
            <div class="spinner spinner-lg"></div>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Skeleton Loaders</div>
          <div class="skeleton-examples">
            <div class="skeleton skeleton-text"></div>
            <div class="skeleton skeleton-text" style="width: 60%"></div>
            <div class="skeleton skeleton-text" style="width: 80%"></div>
            <div class="skeleton skeleton-rect" style="height: 200px"></div>
            <div class="skeleton skeleton-circle"></div>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Loading Cards</div>
          <div class="content-card loading-card">
            <div class="skeleton skeleton-text" style="width: 40%; margin-bottom: 1rem"></div>
            <div class="skeleton skeleton-text"></div>
            <div class="skeleton skeleton-text" style="width: 80%"></div>
            <div class="skeleton skeleton-text" style="width: 60%"></div>
          </div>
        </div>
      </section>

      <!-- Misc Components Section -->
      <section v-if="activeSection === 'misc'" class="demo-section">
        <h2 class="section-title">Miscellaneous</h2>

        <div class="component-group">
          <div class="component-label">Progress Bars</div>
          <div class="progress-examples">
            <div class="progress-bar">
              <div class="progress-fill" style="width: 25%"></div>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: 50%"></div>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: 75%"></div>
            </div>
            <div class="progress-bar progress-bar-success">
              <div class="progress-fill" style="width: 100%"></div>
            </div>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Dividers</div>
          <div class="divider-examples">
            <p>Content above</p>
            <hr class="divider" />
            <p>Content below</p>
            <div class="divider-with-text">
              <span>OR</span>
            </div>
            <p>Content after divider with text</p>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Code Block</div>
          <pre class="code-block"><code>{
  "api_key": "cr_1234567890",
  "name": "Production Key",
  "status": "active",
  "created_at": "2024-01-15T10:30:00Z"
}</code></pre>
        </div>

        <div class="component-group">
          <div class="component-label">Tooltips (Hover over buttons)</div>
          <div class="button-row">
            <button class="btn btn-secondary tooltip" data-tooltip="This is a tooltip">
              Hover me
            </button>
            <button class="btn btn-secondary tooltip" data-tooltip="Another tooltip">And me</button>
          </div>
        </div>

        <div class="component-group">
          <div class="component-label">Breadcrumbs</div>
          <nav class="breadcrumbs">
            <a class="breadcrumb-item" href="#">Dashboard</a>
            <span class="breadcrumb-separator">›</span>
            <a class="breadcrumb-item" href="#">API Keys</a>
            <span class="breadcrumb-separator">›</span>
            <span class="breadcrumb-item active">Details</span>
          </nav>
        </div>

        <div class="component-group">
          <div class="component-label">Pagination</div>
          <nav class="pagination">
            <button class="pagination-btn" disabled>Previous</button>
            <button class="pagination-btn active">1</button>
            <button class="pagination-btn">2</button>
            <button class="pagination-btn">3</button>
            <span class="pagination-ellipsis">...</span>
            <button class="pagination-btn">10</button>
            <button class="pagination-btn">Next</button>
          </nav>
        </div>

        <div class="component-group">
          <div class="component-label">Tabs</div>
          <div class="tabs">
            <button class="tab active">Overview</button>
            <button class="tab">Settings</button>
            <button class="tab">Security</button>
            <button class="tab" disabled>Disabled</button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const activeSection = ref('typography')

const sections = [
  { id: 'typography', name: 'Typography' },
  { id: 'buttons', name: 'Buttons' },
  { id: 'inputs', name: 'Inputs' },
  { id: 'cards', name: 'Cards' },
  { id: 'tables', name: 'Tables' },
  { id: 'badges', name: 'Badges' },
  { id: 'alerts', name: 'Alerts' },
  { id: 'loading', name: 'Loading' },
  { id: 'misc', name: 'Misc' }
]
</script>

<style scoped>
/* ============================================
   BASE STYLES - Vercel-Inspired
   ============================================ */
* {
  box-sizing: border-box;
}

.design-demo-container {
  min-height: 100vh;
  padding: 2rem;
  background: #fafafa;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell',
    sans-serif;
}

.demo-header {
  text-align: center;
  margin-bottom: 3rem;
  padding-bottom: 2rem;
  border-bottom: 1px solid #eaeaea;
}

.demo-title {
  font-size: 3rem;
  font-weight: 700;
  color: #000;
  margin: 0 0 0.5rem;
  letter-spacing: -0.05em;
}

.demo-subtitle {
  font-size: 1.25rem;
  color: #666;
  margin: 0;
  font-weight: 400;
}

/* Navigation */
.demo-nav {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  margin-bottom: 3rem;
  flex-wrap: wrap;
  padding: 0.5rem;
  background: white;
  border: 1px solid #eaeaea;
  border-radius: 5px;
  max-width: fit-content;
  margin-left: auto;
  margin-right: auto;
}

.nav-btn {
  padding: 0.5rem 1rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 5px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.25s ease,
    border-color 0.25s ease,
    color 0.25s ease,
    transform 0.15s ease,
    box-shadow 0.25s ease;
  color: #666;
  box-shadow: 0 0 0 0 rgba(0, 0, 0, 0);
}

.nav-btn:hover {
  color: #000;
  background: #fafafa;
  transform: translateY(-1px);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.nav-btn:active {
  transform: translateY(0);
  box-shadow: 0 0 0 0 rgba(0, 0, 0, 0);
}

.nav-btn.active {
  background: #000;
  color: white;
  border-color: #000;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.nav-btn.active:hover {
  background: #333;
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.2);
}

/* Demo Content */
.demo-content {
  max-width: 1200px;
  margin: 0 auto;
}

.demo-section {
  background: white;
  border: 1px solid #eaeaea;
  border-radius: 0;
  padding: 3rem;
  margin-bottom: 2rem;
}

.section-title {
  font-size: 2rem;
  font-weight: 700;
  color: #000;
  margin: 0 0 2rem;
  letter-spacing: -0.03em;
}

.component-group {
  margin-bottom: 3rem;
}

.component-group:last-child {
  margin-bottom: 0;
}

.component-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #000;
  margin-bottom: 1rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* ============================================
   TYPOGRAPHY
   ============================================ */
.typography-examples {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.heading-1 {
  font-size: 3rem;
  font-weight: 700;
  color: #000;
  margin: 0;
  letter-spacing: -0.05em;
  line-height: 1.1;
}

.heading-2 {
  font-size: 2.5rem;
  font-weight: 700;
  color: #000;
  margin: 0;
  letter-spacing: -0.04em;
  line-height: 1.2;
}

.heading-3 {
  font-size: 2rem;
  font-weight: 600;
  color: #000;
  margin: 0;
  letter-spacing: -0.03em;
  line-height: 1.3;
}

.heading-4 {
  font-size: 1.5rem;
  font-weight: 600;
  color: #000;
  margin: 0;
  letter-spacing: -0.02em;
  line-height: 1.4;
}

.text-large {
  font-size: 1.25rem;
  line-height: 1.6;
  color: #000;
  margin: 0;
}

.text-normal {
  font-size: 1rem;
  line-height: 1.6;
  color: #000;
  margin: 0;
}

.text-small {
  font-size: 0.875rem;
  line-height: 1.5;
  color: #666;
  margin: 0;
}

.text-caption {
  font-size: 0.75rem;
  line-height: 1.4;
  color: #666;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 500;
}

.text-link {
  color: #0070f3;
  text-decoration: none;
  transition: color 0.2s;
}

.text-link:hover {
  color: #0051bb;
  text-decoration: underline;
}

.text-muted {
  color: #666;
}

.text-error {
  color: #e00;
}

.text-success {
  color: #0070f3;
}

.inline-code {
  background: #fafafa;
  border: 1px solid #eaeaea;
  padding: 0.125rem 0.375rem;
  border-radius: 3px;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 0.875em;
}

/* ============================================
   BUTTONS
   ============================================ */
.button-row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  align-items: center;
}

.btn {
  padding: 0.625rem 1.25rem;
  border-radius: 5px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.25s ease,
    border-color 0.25s ease,
    color 0.25s ease,
    transform 0.15s ease,
    box-shadow 0.25s ease;
  border: 1px solid;
  background: white;
  color: #000;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  white-space: nowrap;
  position: relative;
  box-shadow: 0 0 0 0 rgba(0, 0, 0, 0);
}

.btn:focus-visible {
  outline: 2px solid #0070f3;
  outline-offset: 2px;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

.btn-primary {
  background: #000;
  color: white;
  border-color: #000;
}

.btn-primary:hover:not(:disabled) {
  background: #333;
  border-color: #333;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.btn-primary:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
}

.btn-secondary {
  background: white;
  color: #000;
  border-color: #eaeaea;
}

.btn-secondary:hover:not(:disabled) {
  background: #fafafa;
  border-color: #000;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.btn-secondary:active:not(:disabled) {
  transform: translateY(0);
  background: #f5f5f5;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.btn-secondary.active {
  background: #000;
  color: white;
  border-color: #000;
}

.btn-outline {
  background: transparent;
  color: #000;
  border-color: #eaeaea;
}

.btn-outline:hover:not(:disabled) {
  background: #fafafa;
  border-color: #000;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
}

.btn-outline:active:not(:disabled) {
  transform: translateY(0);
  background: #f5f5f5;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.btn-danger {
  background: #e00;
  color: white;
  border-color: #e00;
}

.btn-danger:hover:not(:disabled) {
  background: #c00;
  border-color: #c00;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(238, 0, 0, 0.25);
}

.btn-danger:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 2px 6px rgba(238, 0, 0, 0.15);
}

.btn-danger-outline {
  background: white;
  color: #e00;
  border-color: #eaeaea;
}

.btn-danger-outline:hover:not(:disabled) {
  background: #e00;
  color: white;
  border-color: #e00;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(238, 0, 0, 0.15);
}

.btn-danger-outline:active:not(:disabled) {
  transform: translateY(0);
  box-shadow: 0 1px 4px rgba(238, 0, 0, 0.1);
}

.btn-ghost {
  background: transparent;
  color: #666;
  border-color: transparent;
}

.btn-ghost:hover:not(:disabled) {
  background: #fafafa;
  color: #000;
  transform: translateY(-1px);
}

.btn-ghost:active:not(:disabled) {
  transform: translateY(0);
  background: #f5f5f5;
}

.btn-icon {
  width: 2.5rem;
  height: 2.5rem;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 5px;
}

.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.8125rem;
}

.btn-icon.btn-sm {
  width: 2rem;
  height: 2rem;
}

.btn-lg {
  padding: 0.875rem 1.75rem;
  font-size: 1rem;
}

.btn-loading {
  position: relative;
  color: transparent;
}

.loading-spinner {
  position: absolute;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  border-top-color: white;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.button-group {
  display: inline-flex;
  border: 1px solid #eaeaea;
  border-radius: 5px;
  overflow: hidden;
}

.button-group .btn {
  border-radius: 0;
  border: none;
  border-right: 1px solid #eaeaea;
}

.button-group .btn:last-child {
  border-right: none;
}

/* ============================================
   FORM INPUTS
   ============================================ */
.form-examples {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  max-width: 500px;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #000;
}

.form-input,
.form-textarea,
.form-select {
  padding: 0.75rem;
  border: 1px solid #eaeaea;
  border-radius: 5px;
  font-size: 0.875rem;
  color: #000;
  transition: all 0.2s;
  font-family: inherit;
  background: white;
}

.form-input:focus,
.form-textarea:focus,
.form-select:focus {
  outline: none;
  border-color: #000;
}

.form-input:disabled,
.form-textarea:disabled,
.form-select:disabled {
  background: #fafafa;
  color: #999;
  cursor: not-allowed;
}

.form-input.error {
  border-color: #e00;
}

.form-input.error:focus {
  border-color: #e00;
}

.form-textarea {
  resize: vertical;
  min-height: 100px;
}

.form-error {
  font-size: 0.8125rem;
  color: #e00;
}

.form-help {
  font-size: 0.8125rem;
  color: #666;
}

.checkbox-label,
.radio-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: #000;
  margin-bottom: 0.5rem;
}

.form-checkbox,
.form-radio {
  width: 1.125rem;
  height: 1.125rem;
  cursor: pointer;
  accent-color: #000;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
  font-size: 0.875rem;
  color: #000;
  margin-bottom: 0.5rem;
}

.toggle-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.toggle-slider {
  position: relative;
  width: 3rem;
  height: 1.5rem;
  background: #eaeaea;
  border-radius: 1.5rem;
  transition: all 0.2s;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 1.25rem;
  height: 1.25rem;
  left: 0.125rem;
  top: 0.125rem;
  background: white;
  border-radius: 50%;
  transition: all 0.2s;
}

.toggle-input:checked + .toggle-slider {
  background: #000;
}

.toggle-input:checked + .toggle-slider::before {
  transform: translateX(1.5rem);
}

.toggle-input:disabled + .toggle-slider {
  opacity: 0.5;
  cursor: not-allowed;
}

.input-with-icon {
  position: relative;
}

.input-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 1rem;
}

.form-input.with-icon {
  padding-left: 2.5rem;
}

/* ============================================
   CARDS
   ============================================ */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1px;
  background: #eaeaea;
  border: 1px solid #eaeaea;
}

.stat-card {
  background: white;
  padding: 1.5rem;
  transition: all 0.2s;
}

.stat-card:hover {
  background: #fafafa;
}

.stat-label {
  font-size: 0.875rem;
  color: #666;
  margin-bottom: 0.5rem;
  font-weight: 400;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: #000;
  margin-bottom: 0.25rem;
  letter-spacing: -0.02em;
}

.stat-trend {
  font-size: 0.875rem;
  font-weight: 500;
}

.stat-trend.positive {
  color: #0070f3;
}

.stat-trend.negative {
  color: #e00;
}

.stat-trend.neutral {
  color: #666;
}

.cards-grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.content-card {
  background: white;
  border: 1px solid #eaeaea;
  border-radius: 0;
  transition: all 0.2s;
}

.content-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.card-header {
  padding: 1.5rem;
  border-bottom: 1px solid #eaeaea;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #000;
  margin: 0;
}

.card-body {
  padding: 1.5rem;
}

.card-body p {
  margin: 0 0 1rem;
  color: #666;
  line-height: 1.6;
}

.card-body p:last-child {
  margin-bottom: 0;
}

.card-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #eaeaea;
  background: #fafafa;
}

.interactive-card {
  background: white;
  border: 1px solid #eaeaea;
  border-radius: 0;
  padding: 2rem;
  text-align: center;
  transition: all 0.2s;
  max-width: 400px;
}

.interactive-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-2px);
}

.card-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.card-description {
  color: #666;
  margin: 0.5rem 0 1rem;
  line-height: 1.5;
}

.card-meta {
  display: flex;
  gap: 1rem;
  justify-content: center;
  align-items: center;
  margin-bottom: 1.5rem;
}

.card-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
}

/* ============================================
   TABLES
   ============================================ */
.table-container {
  border: 1px solid #eaeaea;
  overflow-x: auto;
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th {
  background: #fafafa;
  padding: 0.75rem 1rem;
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  color: #666;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-bottom: 1px solid #eaeaea;
}

.table td {
  padding: 1rem;
  border-bottom: 1px solid #eaeaea;
  color: #000;
  font-size: 0.875rem;
}

.table tbody tr:hover {
  background: #fafafa;
}

.table tbody tr:last-child td {
  border-bottom: none;
}

.table-cell-main {
  font-weight: 500;
  margin-bottom: 0.25rem;
}

.table-cell-sub {
  font-size: 0.8125rem;
  color: #666;
  font-family: 'Monaco', 'Menlo', monospace;
}

.table-compact th {
  padding: 0.5rem 1rem;
}

.table-compact td {
  padding: 0.625rem 1rem;
}

/* ============================================
   BADGES
   ============================================ */
.badge-row {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  align-items: center;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.625rem;
  border: 1px solid;
  font-size: 0.75rem;
  font-weight: 500;
  border-radius: 4px;
  white-space: nowrap;
}

.badge-success {
  background: white;
  color: #0070f3;
  border-color: #0070f3;
}

.badge-inactive {
  background: white;
  color: #666;
  border-color: #eaeaea;
}

.badge-warning {
  background: white;
  color: #f5a623;
  border-color: #f5a623;
}

.badge-error {
  background: white;
  color: #e00;
  border-color: #e00;
}

.badge-info {
  background: white;
  color: #0070f3;
  border-color: #0070f3;
}

.badge-neutral {
  background: white;
  color: #000;
  border-color: #eaeaea;
}

.badge-dot {
  gap: 0.375rem;
}

.badge-dot .dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: currentColor;
}

.badge-count {
  padding: 0.125rem 0.375rem;
  border-radius: 10px;
  font-size: 0.6875rem;
  margin-left: 0.5rem;
}

/* ============================================
   ALERTS
   ============================================ */
.alerts-stack {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.alert {
  padding: 1rem 1.25rem;
  border: 1px solid;
  border-radius: 5px;
  font-size: 0.875rem;
  line-height: 1.5;
}

.alert-success {
  background: #f0f9ff;
  color: #0070f3;
  border-color: #0070f3;
}

.alert-error {
  background: #fff0f0;
  color: #e00;
  border-color: #e00;
}

.alert-warning {
  background: #fffbeb;
  color: #f5a623;
  border-color: #f5a623;
}

.alert-info {
  background: #f0f9ff;
  color: #0070f3;
  border-color: #0070f3;
}

.alert-dismissible {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 1rem;
}

.alert-content {
  flex: 1;
}

.alert-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: inherit;
  opacity: 0.7;
  transition: opacity 0.2s;
  padding: 0;
}

.alert-close:hover {
  opacity: 1;
}

/* ============================================
   LOADING
   ============================================ */
.loading-examples {
  display: flex;
  gap: 2rem;
  align-items: center;
}

.spinner {
  width: 2rem;
  height: 2rem;
  border: 2px solid #eaeaea;
  border-radius: 50%;
  border-top-color: #000;
  animation: spin 0.8s linear infinite;
}

.spinner-sm {
  width: 1rem;
  height: 1rem;
  border-width: 1.5px;
}

.spinner-lg {
  width: 3rem;
  height: 3rem;
  border-width: 3px;
}

.skeleton-examples {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.skeleton {
  background: linear-gradient(90deg, #fafafa 25%, #eaeaea 50%, #fafafa 75%);
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s ease-in-out infinite;
  border-radius: 4px;
}

@keyframes skeleton-loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.skeleton-text {
  height: 1rem;
  width: 100%;
}

.skeleton-rect {
  width: 100%;
  height: 100px;
}

.skeleton-circle {
  width: 4rem;
  height: 4rem;
  border-radius: 50%;
}

.loading-card {
  padding: 1.5rem;
}

/* ============================================
   MISC
   ============================================ */
.progress-examples {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.progress-bar {
  width: 100%;
  height: 0.5rem;
  background: #eaeaea;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #000;
  transition: width 0.3s ease;
}

.progress-bar-success .progress-fill {
  background: #0070f3;
}

.divider-examples {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.divider {
  border: none;
  border-top: 1px solid #eaeaea;
  margin: 1rem 0;
}

.divider-with-text {
  display: flex;
  align-items: center;
  text-align: center;
  margin: 1rem 0;
}

.divider-with-text::before,
.divider-with-text::after {
  content: '';
  flex: 1;
  border-top: 1px solid #eaeaea;
}

.divider-with-text span {
  padding: 0 1rem;
  font-size: 0.875rem;
  color: #666;
  font-weight: 500;
}

.code-block {
  background: #000;
  color: #fff;
  padding: 1.5rem;
  border-radius: 5px;
  overflow-x: auto;
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 0.875rem;
  line-height: 1.6;
  margin: 0;
}

.code-block code {
  color: inherit;
}

.tooltip {
  position: relative;
}

.tooltip::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%) translateY(-0.5rem);
  background: #000;
  color: white;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  font-size: 0.8125rem;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
}

.tooltip:hover::after {
  opacity: 1;
}

.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
}

.breadcrumb-item {
  color: #666;
  text-decoration: none;
  transition: color 0.2s;
}

.breadcrumb-item:hover:not(.active) {
  color: #000;
}

.breadcrumb-item.active {
  color: #000;
  font-weight: 500;
}

.breadcrumb-separator {
  color: #999;
}

.pagination {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}

.pagination-btn {
  padding: 0.5rem 0.75rem;
  background: white;
  border: 1px solid #eaeaea;
  border-radius: 5px;
  font-size: 0.875rem;
  cursor: pointer;
  transition:
    background-color 0.25s ease,
    border-color 0.25s ease,
    color 0.25s ease,
    transform 0.15s ease,
    box-shadow 0.25s ease;
  color: #000;
  box-shadow: 0 0 0 0 rgba(0, 0, 0, 0);
}

.pagination-btn:hover:not(:disabled):not(.active) {
  background: #fafafa;
  border-color: #000;
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
}

.pagination-btn:active:not(:disabled):not(.active) {
  transform: translateY(0);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.pagination-btn.active {
  background: #000;
  color: white;
  border-color: #000;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
}

.pagination-btn.active:hover {
  background: #333;
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.2);
}

.pagination-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

.pagination-ellipsis {
  padding: 0.5rem;
  color: #666;
}

.tabs {
  display: flex;
  gap: 0;
  border-bottom: 1px solid #eaeaea;
}

.tab {
  padding: 0.75rem 1.5rem;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.25s ease,
    border-color 0.25s ease,
    color 0.25s ease,
    transform 0.15s ease;
  color: #666;
  position: relative;
}

.tab:hover:not(:disabled) {
  color: #000;
  background: #fafafa;
}

.tab:active:not(:disabled) {
  background: #f5f5f5;
}

.tab.active {
  color: #000;
  border-bottom-color: #000;
}

.tab.active:hover {
  background: #fafafa;
}

.tab:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Responsive */
@media (max-width: 768px) {
  .design-demo-container {
    padding: 1rem;
  }

  .demo-title {
    font-size: 2rem;
  }

  .demo-section {
    padding: 2rem 1.5rem;
  }

  .cards-grid,
  .cards-grid-2 {
    grid-template-columns: 1fr;
  }

  .button-row,
  .badge-row {
    flex-direction: column;
    align-items: stretch;
  }

  .button-row .btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
