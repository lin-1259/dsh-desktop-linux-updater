# Changelog

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
