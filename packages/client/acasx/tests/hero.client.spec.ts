/** ACAS.X hero 标题映射。 */

import { describe, expect, it } from 'vitest'
import { titleForPreset } from '../src/client/hero/AcasxHeroTitle.tsx'

const t = ((key: string) => key) as never

describe('ACAS.X hero title', () => {
  it.each([
    ['richang-jianguan', 'hero.dailySupervision'],
    ['xindun', 'hero.xindun'],
    ['standard', 'hero.mainConversation'],
    [undefined, 'hero.mainConversation'],
    ['unknown', 'hero.mainConversation'],
  ] as const)('maps %s to %s', (preset, key) => {
    expect(titleForPreset(preset, t)).toBe(key)
  })
})
