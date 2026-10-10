/** 验证 acasx 的 UnoCSS 构建链能从组件源码抽取实际使用的原子类。 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createGenerator, presetWind3 } from 'unocss'

const componentPath = fileURLToPath(new URL('../src/client/hero/AcasxCapabilitiesButton.tsx', import.meta.url))

describe('ACAS.X UnoCSS extraction', () => {
  it('generates CSS for the atomic classes used by the capabilities modal', async () => {
    const source = readFileSync(componentPath, 'utf8')
    const uno = await createGenerator({ presets: [presetWind3()] })
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
})
