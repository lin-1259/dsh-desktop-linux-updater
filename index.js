// dsh-desktop-linux-updater — server half.
//
// One-click update for the self-built Linux dsh-desktop:
//   1. check()  — query the fork's GitHub releases for the newest linux-<tag>,
//                 and compare it against the release tag recorded at the last
//                 successful update. A different tag = update available.
//                 (The bundled harness version is reported alongside for info,
//                 but it is NOT the update criterion: the app's own release
//                 line is what this plugin updates, and a harness bump always
//                 ships inside a new release anyway.)
//   2. update() — download the deb, extract it, write a detached swap script
//                 (waits for the app to die, replaces the app dir, relaunches),
//                 then pkill the running app.
//
// Routes (all under /_dsh/dsh-desktop-linux-updater/):
//   GET  /status — current version, phase, download progress
//   GET  /check  — fresh check (cached 5 min, ?force=1 to bypass); issues a
//                  one-time CSRF token for the update route
//   POST /update — performs the update (token + same-origin required)

import z from '@deepseek-ai/schemastery'
import { randomBytes } from 'node:crypto'
import { execFile } from 'node:child_process'
import { createWriteStream, existsSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { statfs } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const CHECK_CACHE_MS = 5 * 60 * 1000

// 记录"当前安装的是哪个 linux-* release"。
// 不能写在 appDir 里（更新会整体替换 app 目录），放在 DSH_HOME 旁，稳定。
const STATE_FILE = path.join(homedir(), '.config', 'dsh-desktop', 'updater-state.json')

export const name = 'dsh-desktop-linux-updater'

export const Config = z.object({
  // 发布 linux-<tag> release 的仓库
  owner: z.string().default('lin-1259'),
  repo: z.string().default('dsh-desktop'),
  // 官方源码仓库（用于按 release tag 比对内置 harness 版本）
  upstream: z.string().default('dataelement/dsh-desktop'),
  // 应用安装目录；留空自动检测（从运行中的 harness 推导或常见路径）
  appDir: z.string().default(''),
  // 更新完成后自动杀掉旧进程并重启（false = 只替换文件，手动重启）
  autoRestart: z.boolean().default(true),
})

function detectAppDir() {
  // 运行中的 harness: <appDir>/resources/app/node_modules/node/bin/node
  let dir = path.dirname(process.execPath)
  for (let i = 0; i < 6; i += 1) {
    dir = path.dirname(dir)
    if (existsSync(path.join(dir, 'resources', 'app', 'package.json'))) return dir
  }
  for (const p of [path.join(homedir(), '.local', 'share', 'dsh-desktop'), '/opt/DSH Desktop']) {
    if (existsSync(path.join(p, 'resources', 'app', 'package.json'))) return p
  }
  return ''
}

function appPackageJson(appDir) {
  const p = path.join(appDir, 'resources', 'app', 'package.json')
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

function currentHarnessVersion(appDir) {
  const pkg = appPackageJson(appDir)
  if (!pkg) return 'unknown'
  return pkg.dependencies?.['@deepseek-ai/dsh'] || pkg.version || 'unknown'
}

// 读/写"当前安装的 release tag"（{ releaseTag: 'linux-v0.7.1' }）
function readStateFile() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function writeStateFile(record) {
  try {
    writeFileSync(STATE_FILE, JSON.stringify(record, null, 2), { mode: 0o644 })
  } catch (error) {
    console.error('[updater] failed to persist state:', error?.message || error)
  }
}

// 当前安装的 linux-* release tag；从未记录过 → 'unknown'（此时视为可更新，
// 宁多勿漏：首次使用新逻辑时用户确实可能落后于最新 release）
function currentReleaseTag() {
  return readStateFile().releaseTag || 'unknown'
}

async function fetchJson(url, timeoutMs = 20000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// 最新 linux-* release 的 deb 资产信息
async function latestRelease(config) {
  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/releases?per_page=20`
  const releases = await fetchJson(url)
  if (!Array.isArray(releases)) throw new Error('GitHub releases 响应格式异常')
  const linux = releases.filter((r) => r.tag_name?.startsWith('linux-') && !r.draft)
  if (linux.length === 0) return null
  const latest = linux[0]
  const deb = (latest.assets || []).find((a) => a.name?.endsWith('.deb'))
  if (!deb) return null
  return {
    tag: latest.tag_name,
    upstreamTag: latest.tag_name.slice('linux-'.length),
    url: deb.browser_download_url,
    name: deb.name,
    size: deb.size,
    publishedAt: latest.published_at,
  }
}

// 某 release tag 对应的官方源码里内置的 dsh harness 版本
async function versionForTag(config, upstreamTag) {
  const url = `https://raw.githubusercontent.com/${config.upstream}/${upstreamTag}/package.json`
  const pkg = await fetchJson(url)
  return pkg.dependencies?.['@deepseek-ai/dsh'] || pkg.version || upstreamTag
}

// 官方 release 的更新说明（body）。fork 的 body 只是构建说明，没有更新内容，
// 所以 notes 取官方（官方 v0.7.2 起为中文）。拿不到 → null，不影响更新判定。
async function fetchUpstreamNotes(config, upstreamTag) {
  const url = `https://api.github.com/repos/${config.upstream}/releases/tags/${upstreamTag}`
  const release = await fetchJson(url)
  const body = String(release?.body ?? '').trim()
  if (!body) return null
  // 截断：release notes 可能很长，卡片只展示前 1200 字符 + 省略号
  return body.length > 1200 ? `${body.slice(0, 1200)}\n…（完整更新说明见官方 Release 页面）` : body
}

export function apply(ctx, config = {}) {
  const state = {
    appDir: config.appDir || detectAppDir(),
    current: currentReleaseTag(),
    currentHarness: currentHarnessVersion(config.appDir || detectAppDir()),
    phase: 'idle', // idle | checking | downloading | extracting | restarting | done | error
    phaseDetail: '',
    downloadedBytes: 0,
    totalBytes: 0,
    lastCheck: null,
    lastError: null,
  }
  let checkCache = { at: 0, result: null }
  let updateToken = ''
  let updateInFlight = null

  const refreshState = () => {
    state.appDir = config.appDir || detectAppDir()
    state.current = currentReleaseTag()
    state.currentHarness = currentHarnessVersion(state.appDir)
  }

  const check = async (force = false) => {
    if (!force && checkCache.result && Date.now() - checkCache.at < CHECK_CACHE_MS) {
      return checkCache.result
    }
    state.phase = 'checking'
    state.phaseDetail = '查询 GitHub releases'
    try {
      const release = await latestRelease(config)
      if (!release) {
        const result = { ok: true, updateAvailable: false, current: state.current, error: '仓库里没有 linux-* release' }
        checkCache = { at: Date.now(), result }
        state.phase = 'idle'
        return result
      }
      // 判定基准 = 桌面端自己的 release tag（v0.7.1 → v0.7.2 也算更新）。
      // harness 版本只作信息展示：harness 升级必然随官方新 release 一起到。
      const updateAvailable = release.tag !== state.current
      let latestHarness = null
      try {
        latestHarness = await versionForTag(config, release.upstreamTag)
      } catch {
        latestHarness = null // raw.githubusercontent 不可达时不影响更新判定
      }
      let notes = null
      try {
        notes = await fetchUpstreamNotes(config, release.upstreamTag)
      } catch {
        notes = null // 官方 notes 拿不到时不影响更新判定
      }
      // 每次 check 签发一次性更新令牌（变更路由的 CSRF 防线之一）
      updateToken = randomBytes(24).toString('base64url')
      const result = {
        ok: true,
        updateAvailable,
        current: state.current,
        latest: release.tag,
        currentHarness: state.currentHarness,
        latestHarness,
        notes,
        releaseTag: release.tag,
        upstreamTag: release.upstreamTag,
        releaseUrl: release.url,
        assetName: release.name,
        assetSize: release.size,
        publishedAt: release.publishedAt,
        token: updateToken,
      }
      checkCache = { at: Date.now(), result }
      state.lastCheck = new Date().toISOString()
      state.phase = 'idle'
      return result
    } catch (error) {
      state.phase = 'idle'
      state.lastError = String(error?.message || error)
      return { ok: false, error: state.lastError }
    }
  }

  const streamDownload = async (url, destPath) => {
    const res = await fetch(url)
    if (!res.ok || !res.body) throw new Error(`下载失败 HTTP ${res.status}`)
    const reader = res.body.getReader()
    const file = createWriteStream(destPath)
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      file.write(value)
      received += value.length
      state.downloadedBytes = received
    }
    await new Promise((resolve, reject) => {
      file.end(resolve)
      file.on('error', reject)
    })
  }

  const performUpdate = async () => {
    if (updateInFlight) return updateInFlight
    updateInFlight = (async () => {
      refreshState()
      const tmpDir = mkdtempSync(path.join(tmpdir(), 'dsh-upd-'))
      try {
        const release = await latestRelease(config)
        if (!release) throw new Error('仓库里没有 linux-* release')
        // 更新前再校验一次目标 release 与当前记录确实不同
        if (release.tag === state.current) {
          return { ok: false, error: `已是最新（${state.current}）` }
        }

        // 0) 磁盘空间预检：下载 + 解包需要约 3 倍 deb 体积的余量
        const { bavail, bsize } = await statfs(state.appDir || '/')
        const freeBytes = bavail * bsize
        const needBytes = release.size * 3
        if (freeBytes < needBytes) {
          return {
            ok: false,
            error: `磁盘空间不足：需要约 ${(needBytes / 1e9).toFixed(1)} GB，${state.appDir || '/'} 所在分区仅剩 ${(freeBytes / 1e9).toFixed(1)} GB`,
          }
        }

        // 1) 下载 deb
        state.phase = 'downloading'
        state.phaseDetail = `下载 ${release.name} (${(release.size / 1e6).toFixed(0)} MB)`
        state.downloadedBytes = 0
        state.totalBytes = release.size
        const debPath = path.join(tmpDir, release.name)
        await streamDownload(release.url, debPath)

        // 2) 解包
        state.phase = 'extracting'
        state.phaseDetail = '解包 deb'
        const extractDir = path.join(tmpDir, 'root')
        await execFileAsync('dpkg-deb', ['-x', debPath, extractDir])
        const newApp = path.join(extractDir, 'opt', 'DSH Desktop')
        if (!existsSync(path.join(newApp, 'resources', 'app', 'package.json'))) {
          throw new Error('deb 里没找到 /opt/DSH Desktop，包结构异常')
        }

        // 3) 写交换脚本（路径内嵌进脚本内容，cmdline 干净，pkill 不会误杀）
        state.phase = 'restarting'
        state.phaseDetail = '替换应用目录并重启'
        const script = path.join(tmpDir, 'swap.sh')
        writeFileSync(
          script,
          [
            '#!/bin/sh',
            'set -e',
            `sleep 3`,
            `APP='${state.appDir}'`,
            `NEW='${newApp}'`,
            'if [ -d "$APP" ]; then mv "$APP" "$APP.bak"; fi',
            'cp -a "$NEW" "$APP"',
            'if [ ! -x "$APP/dsh-desktop" ]; then',
            '  rm -rf "$APP"',
            '  [ -d "$APP.bak" ] && mv "$APP.bak" "$APP"',
            '  exit 1',
            'fi',
            'rm -rf "$APP.bak"',
            'if command -v gtk-launch >/dev/null 2>&1; then gtk-launch dsh-desktop >/dev/null 2>&1; else setsid "$APP/dsh-desktop" >/dev/null 2>&1 & fi',
            '',
          ].join('\n'),
          { mode: 0o755 },
        )

        // 4) 记录本次安装的 release tag（app 目录即将被整体替换，
        //    状态文件放在 DSH_HOME 旁不受影响）
        writeStateFile({ releaseTag: release.tag })
        state.current = release.tag

        // 5) 分离执行脚本，然后杀掉当前 app（harness 随主进程退出）
        const { spawn } = await import('node:child_process')
        const child = spawn('setsid', [script], { detached: true, stdio: 'ignore' })
        child.unref()
        if (config.autoRestart !== false) {
          try {
            await execFileAsync('pkill', ['-f', `^${state.appDir}/dsh-desktop`])
            await execFileAsync('pkill', ['-f', `^${state.appDir}/resources`])
          } catch {
            /* 进程可能已自行退出 */
          }
        }
        state.phase = 'done'
        state.phaseDetail = `已替换，应用正在重启（新版本 ${release.tag}）`
        return { ok: true, restarting: config.autoRestart !== false, version: release.tag }
      } catch (error) {
        state.phase = 'error'
        state.phaseDetail = String(error?.message || error)
        rmSync(tmpDir, { recursive: true, force: true })
        return { ok: false, error: state.phaseDetail }
      }
    })()
    const result = await updateInFlight
    updateInFlight = null
    return result
  }

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => {
      const routes = [
        {
          kind: 'exact',
          path: '/_dsh/dsh-desktop-linux-updater/status',
          handler: async (req, res) => {
            if (req.method !== 'GET') {
              res.setHeader('Allow', 'GET')
              res.writeHead(405)
              res.end()
              return
            }
            refreshState()
            res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
            res.end(JSON.stringify({ ok: true, ...state, lastError: state.lastError }))
          },
        },
        {
          kind: 'exact',
          path: '/_dsh/dsh-desktop-linux-updater/check',
          handler: async (req, res) => {
            if (req.method !== 'GET') {
              res.setHeader('Allow', 'GET')
              res.writeHead(405)
              res.end()
              return
            }
            const force = /(?:[?&])force=1(?:&|$)/.test(String(req.url ?? ''))
            const result = await check(force)
            res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
            res.end(JSON.stringify(result))
          },
        },
        {
          kind: 'exact',
          path: '/_dsh/dsh-desktop-linux-updater/update',
          handler: async (req, res) => {
            if (req.method !== 'POST') {
              res.setHeader('Allow', 'POST')
              res.writeHead(405)
              res.end()
              return
            }
            const fetchSite = String(req.headers?.['sec-fetch-site'] ?? '')
            if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
              res.writeHead(403, { 'content-type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: 'cross-origin update request rejected' }))
              return
            }
            const token = String(req.headers?.['x-dsh-desktop-updater-token'] ?? '')
            if (!token || token !== updateToken) {
              res.writeHead(403, { 'content-type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: 'invalid update token（请先检查更新）' }))
              return
            }
            try {
              const result = await performUpdate()
              updateToken = randomBytes(24).toString('base64url')
              res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
              res.end(JSON.stringify(result))
            } catch (error) {
              res.writeHead(500, { 'content-type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: String(error?.message || error) }))
            }
          },
        },
      ]
      for (const route of routes) {
        webCtx.webServer.register(route)
      }
    }, 'dsh-desktop-linux-updater routes')
  })

  return { check, state }
}
