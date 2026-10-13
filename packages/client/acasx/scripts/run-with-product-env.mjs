#!/usr/bin/env node
/**
 * ACAS.X 产品命令入口。
 *
 * 读取本包 package.json 的 `acasx.productTitle`，作为构建期的
 * DSH_CLIENT_TITLE 注入环境，然后在仓库根目录执行指定的脚本。
 *
 * 用法（由包内 scripts 调用，不直接手敲）：
 *   node scripts/run-with-product-env.mjs <根目录脚本名>
 *
 * 为什么需要它：DSH_CLIENT_TITLE 是构建期值，`pnpm run build`、
 * `pnpm run dev:web`、`pnpm run dev:desktop` 三条路径都会读取它。
 * 不经过这里，构建出来的产品标题会退回 DSH 默认值。
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const target = process.argv[2]
if (target === undefined) {
  console.error('run-with-product-env: 缺少目标脚本名，例如 build / dev:web / dev:desktop')
  process.exit(1)
}

const packageRoot = new URL('..', import.meta.url)
const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url))

const manifest = JSON.parse(readFileSync(new URL('package.json', packageRoot), 'utf8'))
const productTitle = manifest.acasx?.productTitle

if (typeof productTitle !== 'string' || productTitle.trim() === '') {
  console.error('run-with-product-env: packages/client/acasx/package.json 缺少 acasx.productTitle')
  process.exit(1)
}

console.log(`[acasx] DSH_CLIENT_TITLE = ${productTitle}`)
console.log(`[acasx] 执行 pnpm run ${target}`)

const result = spawnSync('pnpm', ['run', target, ...process.argv.slice(3)], {
  cwd: repositoryRoot,
  env: { ...process.env, DSH_CLIENT_TITLE: productTitle },
  stdio: 'inherit',
  shell: true,
})

if (result.error !== undefined) throw result.error
process.exit(result.status ?? 1)
