# dsh-desktop-linux-updater

**桌面端 Linux 自建版一键更新插件** —— 官方 dsh-desktop 只发布 Windows/macOS，Linux 版需要
自建（官方源码 + Linux 打包补丁，经 GitHub Actions 构建发布）。本插件让 Linux 用户
在 **设置 → 桌面端更新** 里一键完成：检查新版本 → 下载 deb → 替换应用目录 → 自动重启。

## 安装

```sh
npx -y @deepseek-ai/dsh plugin --profile web add github:lin-1259/dsh-desktop-linux-updater
```

然后重启 dsh-desktop，在 **设置 → 桌面端更新** 看到卡片即安装成功。

> 前提：Linux 版 dsh-desktop 已安装（deb 解包到 `~/.local/share/dsh-desktop` 或
> `/opt/DSH Desktop` 均可，插件会自动检测）。

## 使用

| 按钮 | 行为 |
|---|---|
| 检查更新 | 查询发布仓库的 `linux-*` release，对比内置 harness 版本 |
| 更新并重启 | 下载 deb（~150MB）→ 解包 → 替换应用目录 → 自动重启 |

更新源默认指向 `lin-1259/dsh-desktop`（Linux 自建版发布仓库）。官方若开始发布 Linux
版，在插件配置里把 `owner`/`repo` 改成官方仓库即可，无需重装。

## 工作原理

- **检查**：`GET /repos/<owner>/<repo>/releases` 找最新 `linux-<tag>` release，取其 deb；
  用 `<upstream>@<tag>` 的 package.json 里 `@deepseek-ai/dsh` 版本与本地内置版本比对。
- **更新**：下载 deb → `dpkg-deb -x` 解包 → 写一个分离执行的交换脚本（sleep 3 等旧进程
  退出 → `mv` 旧目录为备份 → `cp -a` 新目录 → `gtk-launch` 重启）→ `pkill` 旧进程。
- **安全**：更新接口带一次性 token + `sec-fetch-site` 同源校验；更新源仓库可配置，
  请只指向你信任的发布方。

## 配置项（设置 → 插件 → 插件配置）

| 字段 | 默认 | 说明 |
|---|---|---|
| `owner` | `lin-1259` | 发布 linux-* release 的仓库 owner |
| `repo` | `dsh-desktop` | 发布仓库名 |
| `upstream` | `dataelement/dsh-desktop` | 官方源码仓库（用于版本比对） |
| `appDir` | 自动检测 | 应用安装目录，留空自动 |
| `autoRestart` | `true` | 更新后自动重启（false = 只替换，手动重启） |

## 兼容性

- dsh harness 0.1.1-rc.1（v0.5.0 桌面端）实测可用；较新/较旧版本大概率可用（仅用
  webServer 路由 + settings 卡片两个稳定接口）。
- 仅 Linux（更新流程依赖 `dpkg-deb`、`pkill`、`setsid`）。

## License

MIT
