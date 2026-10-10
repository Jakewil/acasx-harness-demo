/** acasx 的 UnoCSS 配置：preset、safelist、等级配色规则与选择器提权。 */
import { defineConfig, presetWind3 } from 'unocss'

type Level = 'LOW' | 'MIDDLE' | 'HIGH' | 'EXTREME' | 'NONE'

const COLOR_MAP: Record<Level, string> = {
  LOW: '#8AD786',
  MIDDLE: '#F0C763',
  HIGH: '#F81700',
  EXTREME: '#CD1100',
  NONE: '#C5C5C5',
}

export default defineConfig({
  safelist: ['level-low', 'level-middle', 'level-high', 'level-extreme', 'level-none'],
  presets: [presetWind3()],
  postprocess: (util) => {
    if (util.selector.startsWith('@') || util.selector.includes(':root')) {
      return
    }

    util.selector = `body:not(#\\#) ${util.selector}`
  },
  rules: [
    [
      /^level[-_](low|middle|high|extreme|none)(!?)$/,
      ([, level, important]) => {
        if (level === undefined) return
        const color = COLOR_MAP[level.toUpperCase() as Level]
        const suffix = important ? ' !important' : ''

        return {
          color: `white${suffix}`,
          'background-color': `${color}${suffix}`,
          border: `1px solid ${color}${suffix}`,
        }
      },
      { layer: 'components' },
    ],
    [
      /^level-text[-_](low|middle|high|extreme|none)(!?)$/,
      ([, level, important]) => {
        if (level === undefined) return
        const color = COLOR_MAP[level.toUpperCase() as Level]
        const suffix = important ? ' !important' : ''

        return {
          color: `${color}${suffix}`,
        }
      },
      { layer: 'components' },
    ],
  ],
})
