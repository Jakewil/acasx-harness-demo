/** 验证 acasx 的 UnoCSS 构建链从组件源码抽取原子类，并加载 uno.config.ts 的自定义规则。 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createGenerator } from 'unocss'
import unoConfig from '../src/client/uno-config.ts'

const componentPath = fileURLToPath(new URL('../src/client/hero/AcasxCapabilitiesButton.tsx', import.meta.url))

describe('ACAS.X UnoCSS extraction', () => {
  it('generates CSS for the atomic classes used by the capabilities modal', async () => {
    const source = readFileSync(componentPath, 'utf8')
    // 构建插件与本测试共用 uno.config.ts：配置里加的规则要么两边都生效，要么在这里失败。
    const uno = await createGenerator(unoConfig)
    const { css } = await uno.generate(source, { preflights: false })
    for (const selector of [
      '.flex{',
      '.flex-col{',
      '.gap-1{',
      '.gap-3{',
      '.pt-2{',
      '.w-full{',
      '.text-sm{',
      '.text-gray-500{',
      '.font-medium{',
    ]) {
      expect(css).toContain(selector)
    }
  })

  it('applies the safelist, the custom level rules, and the specificity postprocess', async () => {
    const uno = await createGenerator(unoConfig)
    const { css } = await uno.generate('', { preflights: false })
    // safelist 与自定义规则：即使源码没有用到，也应产出 level-* 的配色。
    expect(css).toContain('level-low')
    expect(css.toLowerCase()).toContain('#8ad786')
    // postprocess 把工具类选择器提权到 body:not(#\#) 之下，压过同权重的全局样式。
    expect(css).toContain(String.raw`body:not(#\#)`)
  })
})
