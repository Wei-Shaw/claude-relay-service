# ESLint Configuration for Design System Enforcement

Add these rules to your `.eslintrc.js` or `.eslintrc.cjs` file:

```js
module.exports = {
  extends: [
    // ... your existing extends
  ],
  rules: {
    // Prevent raw Tailwind utilities outside ui/ directory
    'vue/no-restricted-syntax': [
      'error',
      {
        selector: 'VAttribute[key.name="class"][value.value=/\\b(h-\\d+|w-\\d+|p-\\d+|m-\\d+|bg-\\w+|text-\\w+|rounded)/]',
        message: '❌ DESIGN SYSTEM VIOLATION: Use components from @/ui instead of raw Tailwind classes. See /src/ui/README.md'
      }
    ],

    // Prevent direct component imports (must use @/ui index)
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['**/ui/components/**'],
            message: '❌ IMPORT VIOLATION: Import from @/ui, not directly from ui/components/. Example: import { Button } from "@/ui"'
          }
        ]
      }
    ],

    // Prevent inline style objects (use tokens instead)
    'vue/no-restricted-static-attribute': [
      'warn',
      {
        key: 'style',
        message: '⚠️  Consider using Design System tokens instead of inline styles'
      }
    ]
  },

  // Override rules for ui/ directory (Tailwind allowed here)
  overrides: [
    {
      files: ['src/ui/**/*.vue', 'src/ui/**/*.js'],
      rules: {
        'vue/no-restricted-syntax': 'off',
        'vue/no-restricted-static-attribute': 'off'
      }
    }
  ]
}
```

## Pre-commit Hook (Optional but Recommended)

Create `.husky/pre-commit`:

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# Check for Tailwind violations in non-ui files
if git diff --cached --name-only | grep -v 'src/ui/' | xargs grep -l 'class=".*\(h-\d\|w-\d\|bg-\|rounded\)' 2>/dev/null; then
  echo "❌ DESIGN SYSTEM VIOLATION DETECTED"
  echo "Raw Tailwind classes found outside src/ui/ directory"
  echo "Please use Design System components from @/ui"
  echo "See src/ui/README.md for usage guide"
  exit 1
fi

npm run lint-staged
```

## VS Code Settings (Optional)

Add to `.vscode/settings.json`:

```json
{
  "editor.quickSuggestions": {
    "strings": false
  },
  "tailwindCSS.experimental.classRegex": [
    // Only enable Tailwind IntelliSense in ui/ directory
    "src/ui/**/*.{vue,js}"
  ],
  "tailwindCSS.emmetCompletions": false,
  "editor.snippets": {
    "vue": {
      "progress-bar": {
        "prefix": "ds-progress",
        "body": [
          "<Progress :value=\"${1:percentage}\" variant=\"${2:default}\" size=\"${3:md}\" />"
        ],
        "description": "Design System Progress component"
      },
      "button": {
        "prefix": "ds-button",
        "body": [
          "<Button variant=\"${1:primary}\" size=\"${2:md}\" @click=\"${3:handleClick}\">",
          "  ${4:Label}",
          "</Button>"
        ],
        "description": "Design System Button component"
      }
    }
  }
}
```

## GitHub Actions Workflow (CI/CD)

Create `.github/workflows/design-system-check.yml`:

```yaml
name: Design System Compliance

on:
  pull_request:
    paths:
      - 'web/admin-spa/src/components/**'
      - 'web/admin-spa/src/views/**'

jobs:
  check-compliance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Check for Tailwind violations
        run: |
          VIOLATIONS=$(grep -rn --include="*.vue" \
            --exclude-dir="src/ui" \
            'class=".*\(h-[0-9]\|w-[0-9]\|bg-\|rounded\)' \
            web/admin-spa/src/ || true)
          
          if [ -n "$VIOLATIONS" ]; then
            echo "❌ Design System violations found:"
            echo "$VIOLATIONS"
            echo ""
            echo "Please use Design System components from @/ui instead"
            exit 1
          fi
          
          echo "✅ No Design System violations found"
      
      - name: Check for direct component imports
        run: |
          VIOLATIONS=$(grep -rn --include="*.vue" --include="*.js" \
            "from ['\"].*ui/components" \
            web/admin-spa/src/components web/admin-spa/src/views || true)
          
          if [ -n "$VIOLATIONS" ]; then
            echo "❌ Direct component imports found:"
            echo "$VIOLATIONS"
            echo ""
            echo "Import from @/ui instead: import { Button } from '@/ui'"
            exit 1
          fi
          
          echo "✅ No direct import violations found"

      - name: Run ESLint
        run: |
          cd web/admin-spa
          npm run lint
```

## Migration Script

Create `scripts/migrate-to-design-system.js`:

```js
#!/usr/bin/env node

/**
 * Automated migration script to replace raw Tailwind with Design System components
 * Usage: node scripts/migrate-to-design-system.js <file-path>
 */

const fs = require('fs')
const path = require('path')

const replacements = [
  // Progress bars
  {
    pattern: /<div[^>]*class="h-2[^"]*rounded-full[^"]*bg-gray-[^"]*"[^>]*>\s*<div[^>]*class="h-2[^"]*rounded-full[^"]*"[^>]*style="[^"]*width:\s*(\${[^}]+}|\d+)%"[^>]*\/>\s*<\/div>/g,
    replacement: '<Progress :value="$1" variant="default" size="md" />'
  },
  
  // Buttons
  {
    pattern: /<button\s+class="btn btn-primary"([^>]*)>(.*?)<\/button>/g,
    replacement: '<Button variant="primary"$1>$2</Button>'
  },
  
  // Badges
  {
    pattern: /<span\s+class="badge badge-success"([^>]*)>(.*?)<\/span>/g,
    replacement: '<Badge variant="success"$1>$2</Badge>'
  }
]

function migrateFile(filePath) {
  console.log(`Migrating: ${filePath}`)
  
  let content = fs.readFileSync(filePath, 'utf8')
  let modified = false
  
  replacements.forEach(({ pattern, replacement }) => {
    if (pattern.test(content)) {
      content = content.replace(pattern, replacement)
      modified = true
    }
  })
  
  if (modified) {
    // Add import if not present
    if (!content.includes("from '@/ui'")) {
      const scriptMatch = content.match(/<script setup>/)
      if (scriptMatch) {
        content = content.replace(
          /<script setup>/,
          "<script setup>\nimport { Progress, Button, Badge } from '@/ui'\n"
        )
      }
    }
    
    fs.writeFileSync(filePath, content)
    console.log(`✅ Migrated: ${filePath}`)
  } else {
    console.log(`⏭️  Skipped: ${filePath} (no changes needed)`)
  }
}

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: node scripts/migrate-to-design-system.js <file-path>')
  process.exit(1)
}

migrateFile(filePath)
```

## Documentation Badge

Add to your project README:

```markdown
## Design System

This project uses a strict Design System architecture. All UI components are centralized in `src/ui/`.

[![Design System](https://img.shields.io/badge/Design%20System-Compliant-success)](./web/admin-spa/src/ui/README.md)

**Rules:**
- ✅ Use components from `@/ui`
- ❌ No raw Tailwind in `components/` or `views/`
- 📖 [Full Documentation](./web/admin-spa/src/ui/README.md)
```

---

These guardrails ensure long-term maintainability and prevent design drift.
