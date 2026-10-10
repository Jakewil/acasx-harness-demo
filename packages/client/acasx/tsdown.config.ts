import { globSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UserConfig } from 'tsdown'
import { createGenerator, presetWind3 } from 'unocss'
import { clientBundle } from '../tsdown.client.ts'

const packageRootUrl = new URL('.', import.meta.url)
const packageRoot = fileURLToPath(packageRootUrl)
const require = createRequire(import.meta.url)
const yamlBrowser = join(dirname(require.resolve('yaml/package.json')), 'browser/index.js')
const UNO_VIRTUAL = '\0acasx-uno.mjs'
const UNO_TAG = 'acasx-uno'

const uno = createGenerator({
  presets: [presetWind3()],
})

/** 把生成的 UnoCSS 文本包装成执行期注入 style 的模块。 */
function unoInjection(css: string): string {
  return [
    `const css = ${JSON.stringify(css)};`,
    `if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css="' + ${JSON.stringify(UNO_TAG)} + '"]') === null) {`,
    "  const tag = document.createElement('style');",
    `  tag.dataset.pluginCss = ${JSON.stringify(UNO_TAG)};`,
    '  tag.textContent = css;',
    '  document.head.appendChild(tag);',
    '}',
    'export {};',
  ].join('\n')
}

/** 扫描 acasx 源码并生成 UnoCSS，再交给客户端 bundle 注入。 */
const unoPlugin: NonNullable<UserConfig['plugins']>[number] = {
  name: 'acasx-uno-css',
  resolveId(source) {
    return source === 'virtual:acasx-uno.css' ? UNO_VIRTUAL : null
  },
  async load(id) {
    if (id !== UNO_VIRTUAL) return null
    const files = globSync('src/**/*.{ts,tsx}', { cwd: packageRoot })
    const sources = files.map(file => readFileSync(new URL(file, packageRootUrl), 'utf8'))
    const { css } = await (await uno).generate(sources.join('\n'), { preflights: false })
    return { code: unoInjection(css), map: null }
  },
}

/** yaml 的 exports 在 tsdown 下落到了 node 构建，强制切到自带浏览器构建。 */
const yamlBrowserPlugin: NonNullable<UserConfig['plugins']>[number] = {
  name: 'acasx-yaml-browser',
  resolveId(source) {
    return source === 'yaml' ? yamlBrowser : null
  },
}

const base = clientBundle('@deepseek-ai/dsh-client-acasx', ['lib/types/index.js'])

export default (inlineConfig: Pick<UserConfig, 'env'>): UserConfig[] =>
  base(inlineConfig).map(config =>
    config.name?.endsWith('/client') ? { ...config, plugins: [yamlBrowserPlugin, unoPlugin, ...(config.plugins ?? [])] } : config,
  )
