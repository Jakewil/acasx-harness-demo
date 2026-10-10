import type { UserConfig } from 'tsdown'
import { clientBundle } from '../tsdown.client.ts'

const base = clientBundle('@deepseek-ai/dsh-client-acasx', ['lib/types/index.js'])

export default (inlineConfig: Pick<UserConfig, 'env'>): UserConfig[] => base(inlineConfig)
