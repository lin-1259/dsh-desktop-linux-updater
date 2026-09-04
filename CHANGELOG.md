# Changelog

## [0.1.4] — 2026-09-05

- feat: 检查更新时抓取**官方 release notes**（`fetchUpstreamNotes`），设置卡片新增「更新内容」区展示
  （限高 180px 滚动、保留换行；官方 v0.7.2 起 notes 为中文）。拿不到 notes 不影响更新判定。
- ui: 更新内容超过 1200 字符时截断并提示查看官方 Release 页面。

## [0.1.3] — 2026-09-05

- **feat: 更新判定改为桌面端 release tag**（`linux-v0.7.1` → `linux-v0.7.2` 也提示更新）。
  之前的基准是内置 harness 版本 spec，官方 v0.7.x 内部 harness 声明不变导致外壳小版本更新被漏报。
  现在：任何 `linux-*` tag 变化都提示；harness 版本降为信息展示（`currentHarness`/`latestHarness`），
  因为 harness 升级必然随官方新 release 一起发布。
- feat: 安装的 release tag 持久化到 `~/.config/dsh-desktop/updater-state.json`（更新成功后写入；
  app 目录会被整体替换，状态不能放里面）。首次使用无记录时视为可更新（宁多勿漏）。
- feat: `raw.githubusercontent` 不可达时不再阻断更新判定（harness 信息显示 null 而已）。
- ui: 设置卡片新增「内置引擎」行，展示当前/最新 harness 版本。

## [0.1.2] — 2026-08-27

- feat: 更新前磁盘空间预检（`statfs` 检查应用目录所在分区，空间不足直接中止，不再白下 150MB）
- refactor: 版本对比抽成零依赖纯函数 `lib/version.js`，语义化比较（正式版 > rc，数字逐段比），避免字符串比较误判
- test: 新增 `node --test` 单元测试覆盖版本对比
- ci: 新增 GitHub Actions lint（语法检查 + 单测）
- docs: 新增 SECURITY.md、CHANGELOG；README 补故障排查

## [0.1.1] — 2026-08-23

- fix: 交换脚本加 `set -e`，`cp` 后校验新二进制存在，失败自动回滚备份再退出（防替换中途失败丢数据）

## [0.1.0] — 2026-08-23

- 首发：设置 → 桌面端更新 卡片，一键检查/下载/替换/重启
- 检查：查发布仓库最新 `linux-*` release，按内置 harness 版本比对
- 更新：deb 下载 → `dpkg-deb -x` 解包 → 分离交换脚本替换应用目录 → `gtk-launch` 重启
- 安全：一次性 token + `sec-fetch-site` 同源校验；更新源可配置
