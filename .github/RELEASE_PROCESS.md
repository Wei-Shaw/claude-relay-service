# 发布流程说明

## 概述

本项目采用全自动化的版本管理和发布流程。VERSION文件由GitHub Actions自动维护，无需手动修改。

## 自动发布流程

### 1. 工作原理

1. **代码推送**: 当你推送代码到main分支时
2. **自动版本更新**: `auto-version-bump.yml`会：
   - 检测是否有实质性代码变更（排除.md文件、docs/目录等）
   - 如果有代码变更，自动将版本号+1并更新VERSION文件
   - 提交VERSION文件更新到main分支
3. **自动发布**: `release-on-version.yml`会：
   - 检测到只有VERSION文件变更的提交
   - 自动创建Git tag
   - 创建GitHub Release
   - 构建并推送Docker镜像
   - 发送Telegram通知（如果配置）

### 2. 工作流文件说明

- **auto-version-bump.yml**: 自动检测代码变更并更新VERSION文件
- **release-on-version.yml**: 检测VERSION文件单独提交并触发发布
- **docker-publish.yml**: 在tag创建时构建Docker镜像（备用）
- **release.yml**: 在tag创建时生成Release（备用）

### 3. 版本号规范

- 使用语义化版本号：`MAJOR.MINOR.PATCH`
- 默认自动递增PATCH版本（例如：1.1.10 → 1.1.11）
- VERSION文件只包含版本号，不包含`v`前缀
- Git tag会自动添加`v`前缀

### 4. 触发条件

**会触发版本更新的文件变更**:

- 源代码文件（.js, .ts, .jsx, .tsx等）
- 配置文件（package.json, Dockerfile等）
- 其他功能性文件

**不会触发版本更新的文件变更**:

- Markdown文件（\*.md）
- 文档目录（docs/）
- GitHub配置（.github/）
- VERSION文件本身
- .gitignore、LICENSE等

## 使用指南

### 正常开发流程

1. 进行代码开发和修改
2. 提交并推送到main分支
3. 系统自动完成版本更新和发布

```bash
# 正常的开发流程
git add .
git commit -m "feat: 添加新功能"
git push origin main

# GitHub Actions会自动：
# 1. 检测到代码变更
# 2. 更新VERSION文件（例如：1.1.10 → 1.1.11）
# 3. 创建新的release和Docker镜像
```

### 跳过版本更新

如果只是更新文档或其他非代码文件，系统会自动识别并跳过版本更新。

## 故障排除

### 版本没有自动更新

1. 检查是否有实质性代码变更
2. 查看GitHub Actions运行日志
3. 确认推送的是main分支

### 需要手动触发发布

如果需要手动控制版本：

1. 直接修改VERSION文件
2. 提交并推送
3. 系统会检测到VERSION变更并触发发布

## 注意事项

- **不要**在同一个提交中既修改代码又修改VERSION文件
- **不要**手动创建tag，让系统自动管理
- 系统会自动避免死循环（GitHub Actions的提交不会触发新的版本更新）
