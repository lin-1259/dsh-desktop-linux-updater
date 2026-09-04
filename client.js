// dsh-desktop-linux-updater — browser half.
//
// Adds a 设置 → 桌面端更新 card: current/latest version, check button,
// one-click update (download → swap → restart) with progress polling.
// Calls the host routes under /_dsh/dsh-desktop-linux-updater/.

window.__ModuleLoader__.load({
  id: 'dsh-desktop-linux-updater',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
    const React = require('react')
    const { useState, useEffect, useCallback } = React

    // ── locale ───────────────────────────────────────────────────────────
    const NS = 'dsh-desktop-linux-updater'
    const zh = {
      nav: '桌面端更新',
      desc: 'Linux 自建版一键更新：检查 fork release → 下载 deb → 替换应用目录 → 重启',
      current: '当前版本',
      latest: '最新版本',
      harness: '内置引擎',
      notes: '更新内容',
      check: '检查更新',
      checking: '检查中…',
      updateAvailable: '发现新版本',
      update: '更新并重启',
      updating: '更新中…',
      upToDate: '已是最新',
      unknown: '未知',
      noApp: '未检测到应用目录（appDir 为空）',
      restarting: '已替换，应用重启中…',
      confirm: '将下载新版 deb 并替换应用目录，应用会自动重启。继续？',
      phaseLabel: {
        idle: '空闲',
        checking: '检查更新',
        downloading: '下载中',
        extracting: '解包中',
        restarting: '替换并重启',
        done: '完成',
        error: '失败',
      },
    }
    const en = {
      nav: 'Desktop updater',
      desc: 'One-click update for the self-built Linux dsh-desktop',
      current: 'Current',
      latest: 'Latest',
      harness: 'Bundled engine',
      notes: 'What\'s new',
      check: 'Check for updates',
      checking: 'Checking…',
      updateAvailable: 'Update available',
      update: 'Update & restart',
      updating: 'Updating…',
      upToDate: 'Up to date',
      unknown: 'unknown',
      noApp: 'App directory not detected',
      restarting: 'Replaced, restarting…',
      confirm: 'Download the new deb and replace the app directory? The app will restart.',
      phaseLabel: {
        idle: 'idle',
        checking: 'checking',
        downloading: 'downloading',
        extracting: 'extracting',
        restarting: 'swapping & restarting',
        done: 'done',
        error: 'failed',
      },
    }

    // ── card ─────────────────────────────────────────────────────────────
    function UpdaterCard({ t }) {
      const [status, setStatus] = useState({ phase: 'idle', current: '', appDir: '' })
      const [check, setCheck] = useState(null)
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState('')

      const refresh = useCallback(async () => {
        try {
          const res = await fetch('/_dsh/dsh-desktop-linux-updater/status')
          if (res.ok) setStatus(await res.json())
        } catch {
          /* harness 重启期间 fetch 会失败，忽略 */
        }
      }, [])

      useEffect(() => {
        refresh()
        const timer = setInterval(refresh, 2000)
        return () => clearInterval(timer)
      }, [refresh])

      const doCheck = async () => {
        setBusy(true)
        setError('')
        try {
          const res = await fetch('/_dsh/dsh-desktop-linux-updater/check?force=1')
          const r = await res.json()
          setCheck(r)
          if (r.ok === false) setError(r.error || '检查失败')
        } catch (e) {
          setError(String(e && e.message ? e.message : e))
        }
        setBusy(false)
      }

      const doUpdate = async () => {
        if (!check || !check.token) {
          setError('请先检查更新')
          return
        }
        if (!window.confirm(t('confirm'))) return
        setBusy(true)
        setError('')
        try {
          const res = await fetch('/_dsh/dsh-desktop-linux-updater/update', {
            method: 'POST',
            headers: { 'x-dsh-desktop-updater-token': check.token },
          })
          const r = await res.json()
          if (r.ok === false) setError(r.error || '更新失败')
        } catch (e) {
          setError(String(e && e.message ? e.message : e))
        }
        setBusy(false)
      }

      const h = React.createElement
      const style = {
        container: { padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' },
        row: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
        label: { opacity: 0.65, fontSize: '12px' },
        value: { fontWeight: 600 },
        badge: {
          padding: '2px 10px', borderRadius: '999px', fontSize: '12px',
          background: status.phase === 'error' ? 'rgba(239,68,68,.15)' : 'rgba(16,185,129,.15)',
          color: status.phase === 'error' ? '#ef4444' : '#10b981',
        },
        btn: {
          padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
          background: 'var(--accent, #4f6ef7)', color: '#fff', fontSize: '13px',
        },
        btnSecondary: {
          padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border, #333)',
          cursor: 'pointer', background: 'transparent', color: 'inherit', fontSize: '13px',
        },
        error: { color: '#ef4444', fontSize: '12px' },
        progress: { fontSize: '12px', opacity: 0.75 },
        notesBox: {
          border: '1px solid var(--border, #333)', borderRadius: '8px',
          padding: '8px 10px', background: 'rgba(127,127,127,.06)', maxWidth: '100%',
        },
        notesBody: {
          fontSize: '12px', lineHeight: '1.55', whiteSpace: 'pre-wrap',
          wordBreak: 'break-word', maxHeight: '180px', overflowY: 'auto',
          opacity: 0.85,
        },
      }
      const downloading = status.phase === 'downloading' || status.phase === 'extracting' || status.phase === 'restarting'
      const phaseText = (status.phaseLabel && status.phase) || status.phaseDetail || t('phaseLabel')[status.phase] || status.phase
      const pct = status.totalBytes
        ? Math.min(100, Math.round((status.downloadedBytes / status.totalBytes) * 100))
        : 0

      return h(
        'div',
        { style: style.container },
        h('div', { style: style.row },
          h('span', { style: style.label }, t('current')),
          h('span', { style: style.value }, status.current || t('unknown')),
          h('span', { style: style.badge }, phaseText),
        ),
        h('div', { style: style.row },
          h('span', { style: { ...style.label, opacity: 0.45 } }, t('harness')),
          h('span', { style: { ...style.value, opacity: 0.65, fontSize: '12px' } },
            `${status.currentHarness || '—'}${check && check.latestHarness && check.latestHarness !== status.currentHarness ? ` → ${check.latestHarness}` : ''}`),
        ),
        h('div', { style: style.row },
          h('span', { style: style.label }, t('latest')),
          h('span', { style: style.value }, check ? check.latest || t('unknown') : '—'),
        ),
        check && check.notes
          ? h('div', { style: style.notesBox },
              h('div', { style: { ...style.label, marginBottom: '4px' } }, t('notes')),
              h('div', { style: style.notesBody }, check.notes),
            )
          : null,
        status.appDir
          ? h('div', { style: style.row },
              h('span', { style: { ...style.label, fontSize: '11px' } }, status.appDir),
            )
          : h('div', { style: { ...style.error, fontSize: '12px' } }, t('noApp')),
        error ? h('div', { style: style.error }, error) : null,
        downloading
          ? h('div', { style: style.progress },
              `${t('updating')} ${status.phaseDetail || ''}${status.totalBytes ? ` ${pct}%` : ''}`,
            )
          : h('div', { style: style.row },
              h('button', { style: style.btnSecondary, onClick: doCheck, disabled: busy }, busy ? t('checking') : t('check')),
              check && check.updateAvailable
                ? h('button', { style: style.btn, onClick: doUpdate, disabled: busy }, t('update'))
                : null,
              check && check.updateAvailable === false
                ? h('span', { style: { ...style.badge, background: 'transparent' } }, t('upToDate'))
                : null,
            ),
      )
    }

    // ── client plugin ────────────────────────────────────────────────────
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-desktop-linux-updater: locale')
      const t = ctx.locale.bind(NS)
      const Card = (props) => React.createElement(UpdaterCard, { t, ...props })
      ctx.effect(
        () =>
          ctx.slots.inject('settings.section', function* () {
            yield ctx.slots.register(
              {
                name: 'settings.section',
                id: 'dsh-desktop-linux-updater',
                order: 40,
                label: () => t('nav'),
                inject: () => Object.freeze({ t }),
              },
              Card,
            )
          }),
        'dsh-desktop-linux-updater: settings section',
      )
    }

    exports.apply = apply
    exports.inject = ['slots', 'locale']
    return module.exports
  },
})
