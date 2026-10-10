/** ACAS.X hero 标题映射与 MCP 组合解析。 */

import { describe, expect, it } from 'vitest'
import { titleForPreset } from '../src/client/hero/AcasxHeroTitle.tsx'
import { parseMcpServers } from '../src/client/hero/capabilities.ts'

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

describe('ACAS.X MCP composition parsing', () => {
  it('collects nested mcp-client server names without duplicates', () => {
    const content = [
      '- id: persona',
      "  name: '@deepseek-ai/dsh-persona'",
      '- id: case-db',
      "  name: '@deepseek-ai/dsh-mcp-client'",
      '  config:',
      '    transport: stdio',
      '    serverName: case-db',
      '- group: true',
      '  config:',
      '    - id: docs',
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '      config:',
      '        serverName: docs',
      '    - id: case-db-again',
      "      name: '@deepseek-ai/dsh-mcp-client'",
      '      config:',
      '        serverName: case-db',
    ].join('\n')
    expect(parseMcpServers(content)).toEqual([{ name: 'case-db' }, { name: 'docs' }])
  })

  it('returns an empty list for malformed or non-list YAML', () => {
    expect(parseMcpServers('[unclosed')).toEqual([])
    expect(parseMcpServers('serverName: docs')).toEqual([])
  })
})
