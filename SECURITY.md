# Security

## 更新来源

- 插件默认从 `lin-1259/dsh-desktop` 的 GitHub Releases 下载 `linux-*` 资产并校验 deb 结构
  （必须包含 `resources/app/package.json`，否则中止）。
- 更新源仓库可通过插件配置 `owner`/`repo` 修改——**只应指向你信任的发布方**。
  若官方开始发布 Linux 版，建议切到官方仓库。

## 请求防护

- 所有变更类路由（`POST /update`）要求：
  - `sec-fetch-site: same-origin`（跨站请求直接 403）；
  - 一次性 CSRF token（`x-dsh-desktop-updater-token`），由 `GET /check` 每次签发。
- 插件仅在本地回环端口提供 API，不对外暴露。

## 替换可靠性

- 更新流程是"下载 → 解包 → **分离脚本替换** → 重启"，旧目录先 `mv` 为备份：
  - `cp -a` 完成后校验新二进制可执行，失败则删除新目录并回滚备份；
  - 备份在确认成功后删除。
- 更新前做磁盘空间预检，空间不足直接中止，不会留下半成品。

## 报告

发现安全问题请直接开 GitHub issue：https://github.com/lin-1259/dsh-desktop-linux-updater/issues
