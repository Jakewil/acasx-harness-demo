/**
 * Command-line startup for the agent-service profile: a successful parse
 * publishes the service the gateway row waits for, while `--help` exits
 * without binding a listener.
 *
 * @module @deepseek-ai/dsh-agent-service/startup
 */

import { Command } from 'commander'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { parseCmdline } from '@deepseek-ai/dsh-cmdline'

/** Stable Cordis plugin name. */
export const name = 'agent-service-startup'

/** Launcher value this row reads. */
export const inject = ['cmdlineArgs']

/** Service the gateway row waits for before binding its listener. */
export const AGENT_SERVICE_STARTUP_SERVICE = 'agentServiceStartup'

/** Startup configuration. */
export interface Config {
  /** Profile name rendered in help. */
  profile?: string
}

/** Validate and default the profile name. */
export const Config: z<Config> = z.object({
  profile: z.string().default('agent-service'),
})

/**
 * Build this application's zero-option command and help.
 * @param profile - selected profile name rendered in the command grammar.
 * @returns a fresh program for one invocation.
 */
function agentServiceCommand(profile: string): Command {
  return new Command()
    .name(`dsh --profile ${profile}`)
    .description('Serve the per-user analysis console and drive one DeepSeek Harness SDK runtime.')
    .helpOption('-h, --help', 'show this help')
    .addHelpText('after', `
Example:
  dsh --profile ${profile}     serve the analysis console until the process stops
`)
}

/**
 * Accept an agent-service invocation and publish gateway readiness.
 * @param ctx - plugin context carrying the launcher command line.
 * @param config - selected profile identity for command help.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const program = agentServiceCommand(config.profile ?? 'agent-service')
  program.action(() => {
    ctx.provide(AGENT_SERVICE_STARTUP_SERVICE, { accepted: true })
  })
  parseCmdline(ctx, program)
}
