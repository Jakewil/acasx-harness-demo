---
description: 'ACAS.X 桌面端 Linux 打包、运行时准备、Office 引擎、CLI 启动器与 acasx 启动修复的文件级说明。'
kind: 'development-guide'
---

# ACAS.X 桌面端打包、运行时与启动修复说明

本文记录 ACAS.X 在 DeepSeek Harness 桌面端上完成 Linux 打包、运行时适配与产品启动修复时的当前文件职责。它不是构建命令手册，也不是上游 Desktop 的完整设计文档，而是帮助接手者理解每个新增或修改文件为什么存在、哪些行为已经验证、哪些能力仍未开放。

## 交付边界

当前 Linux 产物用于验证，尚未接入正式发布链路。

已验证的目标是 `linux-x64` 的 unsigned deb 构建。源码配置保留原有的 AppImage target；Linux 打包命令在 electron-builder 调用中显式追加 `deb`，因此本次实际产物只需要部署 Debian 安装包。

`linux-arm64` 与 x64 共用同一套配置文件和构建阶段，只把 target selector 改为 `--arm64`，并让 pnpm 选择 arm64 可选包与原生依赖。debian arm64 的真实构建、安装和启动验收仍需在 arm64 主机或 arm64 runner 上完成，不能在 x64 宿主上直接通过 `resolveDesktopPackageTarget()` 的构建主机检查。

Linux 的签名、更新 feed、上传计划、强制更新策略和 `desktop-linux` 客户端身份尚未实现。`desktop-upload-plan.ts` 因此明确从上传目标中排除了 Linux。

## 原生 Linux 构建

仓库内的 Linux 打包命令直接在 Linux 主机运行，不依赖 Docker。Docker 只是在非 Linux 宿主上复现 Linux 环境时的可替代手段，不是构建要求。

Debian、Ubuntu 或麒麟类系统需要 Node 24、根 `packageManager` 固定版本的 pnpm、Git、tar、`cc`、`musl-gcc` 以及 Electron 运行库。以 Debian 系软件源为例，先安装：

```sh
sudo apt-get install -y build-essential musl-tools bubblewrap ca-certificates git \
  libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 \
  libuuid1 libsecret-1-0 libgbm1 libasound2
```

在仓库根目录执行：

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run package:desktop:linux:x64:unsigned
```

x64 与 arm64 必须分别在与目标架构匹配的 Linux 主机或 runner 上构建。arm64 机器执行：

```sh
pnpm run package:desktop:linux:arm64:unsigned
```

unsigned 构建不需要 `.env.linux`。缺少 Linux 原生工具链时，打包会在 toolchain preflight 阶段失败。

## 最终目录与产物

| 位置                                                                              | 内容                            | 说明                                |
| --------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------- |
| `apps/desktop/.desktop-build/targets/linux-x64/electron`                          | 目标平台的 Electron 解包目录    | 由 `prepare-runtime.ts` 下载并解压  |
| `apps/desktop/.desktop-build/targets/linux-x64/runtime`                           | CLI、primary-runtime 与启动脚本 | Linux 使用 `runtime/cli/bin/dsh`    |
| `apps/desktop/.desktop-build/targets/linux-x64/dsh`                               | 打包前完整的 dsh 运行时树       | 由 `prepare-dsh.ts` 安装并校验      |
| `apps/desktop/.desktop-build/targets/linux-x64/unsigned-artifacts/linux-unpacked` | electron-builder 的应用目录     | deb target 的输入                   |
| `apps/desktop/.desktop-build/targets/linux-x64/unsigned-artifacts/*.deb`          | Debian 安装包                   | 安装到 `/opt/DeepSeek Harness`      |
| `apps/desktop/.desktop-build/targets/linux-x64/unsigned-artifacts/*.deb`          | 仓库内最终分发产物              | 与 win/mac 使用同一 target 输出约定 |

## 产品与启动修复

### `packages/client/acasx/src/client/index.ts`

修改原因：官方品牌插件和 acasx 都注册 `sidebar.brand.name`，双方默认优先级都是 `0`。slot 系统把重复注册判为错误，导致 `@deepseek-ai/dsh-client-acasx: failed`，桌面端在 web boot 阶段无法进入界面。

当前实现：acasx 使用 `priority: -1` 注册品牌名，阴影覆盖官方字标。这与 `sidebar.workspaces` 的覆盖策略一致，保证 acasx 作为产品面拥有最终显示权，同时不要求移除官方品牌插件。

### `packages/client/acasx/package.json`

修改原因：acasx 的版本原先仍是 `0.2.1-alpha.1`，而 Desktop 与其余 dsh 包已是 `0.2.1-alpha.2`。`release:pack` 的版本一致性检查需要整个发布族使用同一个版本。

当前实现：acasx 版本对齐到 `0.2.1-alpha.2`。该包自身版本不写入 `pnpm-lock.yaml`，因此不需要 lockfile 变更。

## Linux 打包入口

### 根 `package.json`

修改原因：为 Linux x64 与 arm64 增加可从仓库根目录调用的入口，避免每次手写 pnpm 过滤命令。

当前实现：新增 `package:desktop:linux:{x64,arm64}`、`:unsigned` 和 `:dir` 脚本。它们只转发到 `apps/desktop` 的固定 target 脚本。

### `apps/desktop/package.json`

修改原因：Linux 安装包的 Debian 元数据需要应用主页、桌面文件名和目标入口；同时需要固定的 Linux target 命令与 `check:package` 兼容。

当前实现：新增 `homepage`、`desktopName` 和六条 Linux 打包脚本。`desktopName` 让 Electron 的 WM_CLASS 与 `.desktop` 文件名保持一致。

### `apps/desktop/scripts/package-target.ts`

修改原因：原先固定 target 只有 mac 和 win，Linux 会在解析 target、架构、构建主机和运行时 smoke 时被拒绝。

当前实现：新增 `linux-x64` 与 `linux-arm64` target，并增加 Linux 构建主机和架构校验。unsigned Linux 选择 `localLinuxPackageEnvironment()`，准备主运行时后额外构建 Landlock 原生模块，最后调用 electron-builder 并运行打包后 smoke。完成的 deb 留在该 target 自己的 `unsigned-artifacts` 目录，与 win/mac 的产物约定一致。

### `apps/desktop/scripts/desktop-build-paths.mjs` 与 `.d.mts`

修改原因：构建目录原先按“更新目标”类型定义，无法表达只用于构建验证的 Linux target。

当前实现：引入独立的 `DesktopBuildTarget`，包含 mac、win、Linux 五种 target。`desktopTargetPlatform()` 返回 `linux`，为后续运行时、Electron 路径和 Office 引擎选择提供平台信息。

### `apps/desktop/scripts/desktop-auto-update-environment.mjs` 与 `.d.mts`

修改原因：Linux 需要生成构建完成记录，但不能进入自动更新 feed。

当前实现：保留 `UPDATE_TARGETS` 仅含 mac 和 win，新增 `BUILD_RECORD_TARGETS` 容纳 Linux。`desktopBuildRecordFilename()` 可以为 Linux 记录构建结果，但 `resolveDesktopAutoUpdateTarget()` 仍拒绝 Linux。

### `apps/desktop/scripts/desktop-package-environment.mjs` 与 `.d.mts`

修改原因：Linux 需要自己的本地 unsigned 环境和 `.env.linux` 校验，同时必须避免继承 Windows/macOS 的发版凭据。

当前实现：抽出 `localUnsignedPackageEnvironment()`，增加 `localLinuxPackageEnvironment()`，按平台选择 `.env.linux`，仅允许 `DSH_DESKTOP_LINUX_MAINTAINER` 作为 Linux 特有字段。`validateDesktopPackageEnvironment()` 对 Linux 仅允许 `--unsigned`，明确拒绝未实现的签名发布。

### `apps/desktop/.env.linux.example`

新增原因：Linux 发布配置未来需要独立的文件边界，即使当前只有 unsigned 验证。

当前内容：列出共享 app id、更新部署字段、npm registry 说明和 Debian maintainer。文件顶部明确标注 Linux release、更新 feed 和强制更新身份尚未实现。

### `apps/desktop/scripts/electron-builder-config.mjs` 与 `apps/desktop/electron-builder.config.d.mts`

修改原因：electron-builder 源码原本使用 AppImage；产品当前只需要 `deb`，并且要补齐 Electron 直接链接但 electron-builder Debian 默认未列出的系统库。源码默认值保持不动，只在 Linux 打包命令中显式选择 `deb`。

当前实现：Linux target 仍为源码原有的 `['AppImage']`，同时增加 `deb.depends`，明确包含 `libgbm1` 与 `libasound2`，避免最小化 Linux 环境安装后因动态库缺失无法启动。electron-builder 的实际 Linux 调用使用 `--linux deb`，不构建 AppImage。

### `apps/desktop/scripts/desktop-toolchain-preflight.ts`

修改原因：Linux 打包需要本机 C 工具链构建 Landlock 原生模块；缺少 `cc` 或 `musl-gcc` 时应在打包前失败。

当前实现：Linux target 额外探测 `cc --version` 和 `musl-gcc --version`，并把缺失项作为结构化 toolchain failure 返回。

### `apps/desktop/scripts/desktop-upload-plan.ts`

修改原因：Linux 当前只生成验证产物，没有上传对象、feed 或版本发布语义。

当前实现：定义 `DesktopUploadTarget` 排除 `linux-x64` 和 `linux-arm64`，运行时若传入 Linux target 则明确报 unsupported target。

## 运行时与 CLI 适配

### `apps/desktop/scripts/prepare-runtime.ts`

修改原因：Linux Electron 压缩包的可执行文件是根目录下的 `electron`，而不是 Windows 的 `electron.exe` 或 macOS 的 App bundle 内可执行文件。

当前实现：按目标平台选择 Electron 可执行文件路径，Linux 额外设置 `0755`，再通过 `ELECTRON_RUN_AS_NODE=1` 读取内嵌 Node 版本。

### `apps/desktop/scripts/prepare-dsh.ts`

修改原因：桌面运行时准备原先从 `process.platform` 推断 Electron 和 Office 平台，在跨平台准备与 Linux 容器构建中会选错路径；同时 npm 内网下载需要更保守的并发。

当前实现：从 `DSH_DESKTOP_TARGET_PLATFORM` 解析目标平台，Linux 使用 `electron` 可执行文件。pnpm 安装增加 `--network-concurrency=4` 和 `--fetch-retries=5`，降低不稳定网络下的失败率。

### `apps/desktop/scripts/prepare-cli.ts`

修改原因：Windows 的 `dsh.cmd` 不能复用到 Linux，Linux CLI 启动脚本还需要可执行位。

当前实现：Linux 从 `apps/desktop/cli/dsh-linux` 复制为 `runtime/cli/bin/dsh`，并对所有非 Windows 平台设置 `0755`。

### `apps/desktop/cli/dsh-linux`

新增原因：Linux 安装后的 `dsh` 命令需要通过 Desktop 自带的 Electron Node 模式运行 CLI，而不是依赖系统 Node。

当前内容：解析 symlink 后定位 `resources/app.asar`，以 `ELECTRON_RUN_AS_NODE=1` 和 `--expose-internals` 执行 `dsh-desktop-host/lib/cli.js`。

### `apps/desktop/scripts/smoke-packaged-runtime.ts`

修改原因：打包后 smoke 原先只认识 Windows 的 `win-unpacked` 与 macOS 的 `.app` 结构。

当前实现：Linux 使用 `linux-unpacked`、`resources` 和根目录下的 `deepseek-harness` 可执行文件，验证 Host、CLI、插件加载与 Office 转换路径。

### `apps/desktop/scripts/development-project.ts`

修改原因：开发项目原先使用自动更新目标类型，与新增的 Linux 构建验证目标不一致。

当前实现：目标类型改为 `DesktopBuildTarget`，使开发项目可以读取 Linux 目标准备物。

## Office 引擎解析

### `apps/desktop-host/src/office-engine.ts`

修改原因：Linux 没有发布原生 LibreOffice 引擎包，必须使用 WASM 引擎。打包后 `app.asar` 内的 WASM 与 kit 包需要映射到 `app.asar.unpacked` 的物理路径，否则 Electron 在 ASAR 内无法加载原生模块与 WASM。

当前实现：把解析范围从平台引擎包扩展到 `@deepseek-ai/libreoffice-kit` 及其子路径和 `-wasm`、平台后缀包；解析结果在 ASAR 内时改写到对应的 unpacked 物理目录。运行时包目录之外的解析仍被拒绝。

### `apps/desktop-host/tests/office-engine.spec.ts`

修改原因：Office 引擎解析从“只处理平台 native 引擎”改为“同时处理 kit API 与 WASM 引擎”，原测试无法覆盖 Linux 所需的路径。

当前实现：fixture 同时写入 native、kit 和 WASM 三个 manifest，验证 kit/WASM 解析到 unpacked 目录，并保留外部引擎与越界解析的拒绝测试。

## 测试覆盖

### `apps/desktop/tests/desktop-build-paths.spec.ts`

修改原因：Linux target 需要证明自己的构建目录与 mac/win 隔离，同时验证平台与架构解析。

当前实现：断言 Linux x64/arm64 目录唯一，`desktopTargetPlatform()` 返回 `linux`，并拒绝 FreeBSD 等未支持 target。

### `apps/desktop/tests/desktop-auto-update-environment.spec.ts`

修改原因：Linux 可以写构建记录，但不能解析成更新发布 target。

当前实现：断言 `desktopBuildRecordFilename('linux-x64')` 成功，而 `resolveDesktopAutoUpdateTarget('linux', 'x64')` 继续失败。

### `apps/desktop/tests/desktop-package-environment.spec.ts`

修改原因：Linux 环境需要独立验证“清理父环境发布凭据、保留网络配置、只允许 unsigned、只接受 Linux 设置字段”。

当前实现：新增 Linux local environment 测试与 `.env.linux` 读取测试，并断言 `validateDesktopPackageEnvironment()` 对非 unsigned Linux 失败。

### `apps/desktop/tests/installer-packaging.spec.ts`

修改原因：electron-builder 配置需要锁定 Linux 产物格式与 Debian 依赖。

当前实现：断言源码 Linux target 仍为 AppImage，执行名为 `deepseek-harness`，maintainer 和 `syncDesktopName` 生效，`deb.depends` 包含 `libgbm1` 与 `libasound2`。

### `apps/desktop/tests/package-target.spec.ts`

修改原因：Linux target 的解析、架构校验、builder 参数和 unsigned 组合需要单元覆盖。

当前实现：新增 linux-x64/arm64 的正向与反向用例，并验证 electron-builder 收到 `--linux --x64 --publish never`。

### `apps/desktop/tests/package-target-stages.spec.ts`

修改原因：Linux 打包必须走完整的运行时准备、electron-builder 和 smoke 阶段。

当前实现：断言 unsigned Linux 会执行 electron-builder，随后执行 packaged runtime smoke。

### `apps/desktop/tests/runtime-preparation.spec.ts`

修改原因：运行时准备原先用 macOS/Windows 二选一表达平台，Linux 需要独立路径和 CLI 处理。

当前实现：测试矩阵加入 linux-x64/arm64，mock `chmodSync`，并断言 Linux 不生成 macOS command link。

## 已验证行为

完整 Linux x64 unsigned 构建已在 Linux 容器内执行，包含 `build:official`、`release:pack`、`prepare:runtime`、`prepare:packages`、`prepare:dsh`、electron-builder 与 packaged runtime smoke。

生成的 `deb` 已经通过 `dpkg -i` 安装验证。安装后 `/opt/DeepSeek Harness/deepseek-harness` 可执行，`chrome-sandbox` 在无 user namespace 的环境下由 postinst 设置为 `4755`。

在 Xvfb 下启动真实 Electron 进程后，Host 可以到达 `dsh web: http://127.0.0.1:<port>`，且不再出现 `web boot: 1 entry did not activate`。通过 DevTools Protocol 读取 acasx entry，状态为 active，且没有 activation error。

## 尚未完成

Linux 仍未接入签名、自动更新 feed、上传、强制更新身份和发布完成记录。`deb` 目前是 unsigned 验证产物，不应作为正式发行包使用。

`linux-arm64` 的代码路径已经支持，但本轮只完成 x64 的完整构建与安装验证。arm64 的待验证项包括 arm64 deb 安装、打包后 smoke、真实 Electron 启动和原生依赖加载；应在 arm64 主机或 arm64 runner 上执行 `pnpm --filter @deepseek-ai/dsh-desktop run package:linux:arm64:unsigned`。

Windows 与 macOS 的平台路径和发布链路没有参与本次改动。Electron 仍保持 `44.7.0`，因为它携带 Node 24.21，满足 dsh 的 Node 22/24/26 运行时矩阵；参考项目中较旧的 Electron 22 使用 Node 16，不能直接套用到 dsh。

Linux 的 Electron 用户数据仍使用 Electron 的平台默认位置。要把 cookie、cache、日志也统一迁到 `~/.acasx`，需要同时设计 Windows 卸载清理和 macOS Application Support 路径，不能只改 Linux。
