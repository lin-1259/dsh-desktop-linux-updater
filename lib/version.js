// lib/version.js — 语义化版本比较（零依赖，可单测）
//
// dsh 版本号形如 "0.1.1"、"0.1.1-rc.2"、"0.1.0-rc.7"。
// 规则：正式版 > 同主版本号的任何 rc 预发布；rc.N 按 N 比较；数字段逐段比较。
// 用于判断"内置 harness 版本是否真的变了"，避免字符串比较把
// "0.1.1" 与 "0.1.1-rc.2" 这类同主版本号误判方向。

export function parseVersion(v) {
  const text = String(v ?? '').trim()
  const m = /^(\d+(?:\.\d+){0,3})(?:-rc\.(\d+))?$/.exec(text)
  if (!m) return null
  return { nums: m[1].split('.').map(Number), rc: m[2] === undefined ? null : Number(m[2]) }
}

// 返回 -1 / 0 / 1
export function compareVersions(a, b) {
  const pa = parseVersion(a)
  const pb = parseVersion(b)
  // 解析不了的走字符串兜底，保证比较总是有确定结果
  if (!pa || !pb) {
    const sa = String(a)
    const sb = String(b)
    return sa < sb ? -1 : sa > sb ? 1 : 0
  }
  for (let i = 0; i < Math.max(pa.nums.length, pb.nums.length); i += 1) {
    const na = pa.nums[i] ?? 0
    const nb = pb.nums[i] ?? 0
    if (na !== nb) return na < nb ? -1 : 1
  }
  if (pa.rc !== pb.rc) {
    if (pa.rc === null) return 1 // 正式版 > rc
    if (pb.rc === null) return -1
    return pa.rc < pb.rc ? -1 : 1
  }
  return 0
}

export function versionDiffers(a, b) {
  return compareVersions(a, b) !== 0
}
