# 分支管理策略 (Branch Strategy)

本项目采用双分支策略，以分离网页版开发与 iOS 打包流程。

## 1. main 分支 (主分支/网页版)

- **定位**: 核心开发分支，维护纯净的 PWA 网页版代码。
- **内容**:
  - 所有网页源代码 (`src/`, `components/` 等)。
  - `.github/workflows/ios-build.yml`: 必须存在于此，以便 GitHub Actions 识别工作流。
  - `package.json`: 包含基础依赖 (可能包含少量 Capacitor 依赖，不影响网页运行)。
- **不包含**: `ios/` 文件夹, `capacitor.config.ts`, `IOS_GUIDE.md`。

## 2. IOS 分支 (打包专用)

- **定位**: iOS 原生打包分支。
- **内容**:
  - `main` 分支的所有内容。
  - `ios/` 文件夹: 包含 Xcode 项目和原生配置。
  - `capacitor.config.ts`: Capacitor 配置文件。
  - `IOS_GUIDE.md`: 打包指南。
- **操作流程**:
  1.  在 `main` 分支开发网页功能。
  2.  需要打包 iOS 时，将 `main` 合并到 `IOS` 分支。
  3.  在 GitHub Actions 中选择 `IOS` 分支触发构建。
