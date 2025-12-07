# iOS APP 自定义指南

这份文档介绍了如何修改 APP 的图标、版本号、名称以及数据存储说明。

## 1. 修改 APP 图标

iOS 的图标文件位于 `ios/App/App/Assets.xcassets/AppIcon.appiconset` 文件夹中。

iOS 的图标文件位于 `ios/App/App/Assets.xcassets/AppIcon.appiconset` 文件夹中。

**只需要替换这一个文件即可**：

- 文件名: `AppIcon-512@2x.png`
- 格式: PNG
- 尺寸: **必须是 1024x1024 像素**

替换后，Xcode 会自动根据这个高清图标生成所有需要的尺寸。

## 2. 修改版本号与名称

我已经帮你修改了 `ios/App/App/Info.plist` 文件，将 APP 名称改为了 "个人记账本"，版本号设为 "1.0.0"。

如果你以后想修改：

1.  打开 `ios/App/App/Info.plist` 文件。
2.  **名称**: 修改 `<key>CFBundleDisplayName</key>` 下面的 `<string>个人记账本</string>`。
3.  **版本号**: 修改 `<key>CFBundleShortVersionString</key>` 下面的 `<string>1.0.0</string>`。
4.  **构建版本**: 修改 `<key>CFBundleVersion</key>` 下面的 `<string>1</string>`。

## 3. 关于震动反馈

之前震动无效是因为网页版震动 API 在 iOS 上有限制。
我已经安装了原生震动插件 `@capacitor/haptics` 并更新了代码。
**下次打包后，震动功能应该就能正常工作了。**

## 4. 数据存储与 iCloud

- **本地存储**: APP 的数据默认存储在手机本地 (IndexedDB)，即使没有网络也能使用。
- **iCloud 同步**:
  - 目前的 "免费个人证书" 签名 **不支持** iCloud 同步功能 (Apple 限制)。
  - 如果需要 iCloud 同步，你需要购买 Apple 开发者账号 ($99/年) 并配置 iCloud 容器。
  - **建议**: 定期使用 APP 内的 "导出数据" 功能备份数据。

## 5. 开发者说明

如果你想修改开发者名称，这通常由你的 Apple ID 决定 (在签名时自动写入)。
如果你想在 APP 里显示版权信息，可以在 `Info.plist` 中添加 `NSHumanReadableCopyright` 字段。
