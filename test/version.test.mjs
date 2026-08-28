import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVersion, compareVersions, versionDiffers } from '../lib/version.js'

test('parseVersion: 常规版本', () => {
  assert.deepEqual(parseVersion('0.1.1'), { nums: [0, 1, 1], rc: null })
  assert.deepEqual(parseVersion('0.1.1-rc.2'), { nums: [0, 1, 1], rc: 2 })
  assert.deepEqual(parseVersion('1.0'), { nums: [1, 0], rc: null })
  assert.equal(parseVersion('abc'), null)
  assert.equal(parseVersion(''), null)
})

test('compareVersions: 数字段逐段比较', () => {
  assert.equal(compareVersions('0.1.1', '0.1.1'), 0)
  assert.equal(compareVersions('0.1.2', '0.1.1'), 1)
  assert.equal(compareVersions('0.1.1', '0.1.2'), -1)
  assert.equal(compareVersions('0.2.0', '0.10.0'), -1) // 逐段数字比较，不是字符串
  assert.equal(compareVersions('1.0.0', '0.9.9'), 1)
})

test('compareVersions: rc 语义（正式版 > rc，rc 数字递增）', () => {
  assert.equal(compareVersions('0.1.1', '0.1.1-rc.2'), 1)
  assert.equal(compareVersions('0.1.1-rc.2', '0.1.1'), -1)
  assert.equal(compareVersions('0.1.1-rc.2', '0.1.1-rc.1'), 1)
  assert.equal(compareVersions('0.1.1-rc.1', '0.1.1-rc.2'), -1)
  assert.equal(compareVersions('0.1.1-rc.2', '0.1.1-rc.2'), 0)
})

test('compareVersions: 解析失败走字符串兜底', () => {
  assert.equal(compareVersions('unknown', 'unknown'), 0)
  assert.notEqual(compareVersions('unknown', '0.1.1'), 0)
})

test('versionDiffers', () => {
  assert.equal(versionDiffers('0.1.1-rc.2', '0.1.1-rc.2'), false)
  assert.equal(versionDiffers('0.1.1-rc.2', '0.1.1-rc.1'), true)
  assert.equal(versionDiffers('0.1.1', '0.1.1-rc.2'), true)
})
