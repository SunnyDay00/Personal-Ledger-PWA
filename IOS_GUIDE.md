# iOS 打包与安装指南

由于你使用的是 Windows 系统，我们采用 "GitHub Actions 云端打包 + Sideloadly 本地签名安装" 的方案。

## 1. 准备工作

确保你已经将代码推送到 GitHub 仓库。

## 2. 云端打包 (GitHub Actions)

1.  打开你的 GitHub 仓库页面。
2.  点击顶部的 **Actions** 标签。
3.  在左侧列表中找到 **Build iOS IPA** 工作流。
4.  点击右侧的 **Run workflow** 按钮，确保分支选择正确 (通常是 `main` 或 `master`)，然后点击绿色的 **Run workflow** 按钮。
5.  等待构建完成 (通常需要几分钟)。
6.  构建完成后，点击该次运行记录，在底部的 **Artifacts** 区域下载 `ios-app` 压缩包。
7.  解压下载的文件，你会得到一个 `App.ipa` 文件。

## 3. 安装到手机 (Sideloadly)

我们需要使用 Sideloadly 工具将这个未签名的 IPA 文件用你的 Apple ID 签名并安装到手机上。

1.  **下载 Sideloadly**: 访问 [Sideloadly 官网](https://sideloadly.io/) 下载并安装 Windows 版本。
2.  **连接手机**: 使用数据线将 iPhone 连接到电脑，并确保 iTunes/Finder 能识别到手机 (如果需要，请在手机上点击 "信任此电脑")。
3.  **打开 Sideloadly**:
    - 将刚才解压得到的 `App.ipa` 拖入 Sideloadly 窗口的左侧图标区域。
    - 在 **Apple ID** 输入框中输入你的 Apple ID。
    - 点击 **Start** 按钮。
4.  **输入密码**: 根据提示输入你的 Apple ID 密码 (如果开启了双重认证，可能需要输入验证码)。
    - _注意: Sideloadly 会将你的账号用于申请免费的开发者证书，这是安全的常规操作。_
5.  **等待安装**: Sideloadly 会自动签名并安装应用。显示 "Done" 即表示完成。
6.  **信任证书**:
    - 在手机上打开 **设置** -> **通用** -> **VPN 与设备管理** (或 **描述文件与设备管理**)。
    - 在 "开发者 APP" 下找到你的 Apple ID，点击进入。
    - 点击 **信任 "你的 Apple ID"**。

现在，你就可以在手机上打开并使用你的个人记账本 APP 了！

## 注意事项

- **有效期**: 免费 Apple ID 签名的应用有效期为 **7 天**。7 天后应用会无法打开，你需要重新使用 Sideloadly 进行安装 (重复第 3 步即可，数据通常会保留，但建议做好云同步备份)。
- **更新应用**: 如果你更新了代码，只需重复 "云端打包" 和 "安装到手机" 的步骤即可覆盖安装。
