/**
 * Small shared value guards for the agent-service gateway.
 * @module @deepseek-ai/dsh-agent-service/util
 */

/**
 * Test one decoded JSON value for the object shape the gateway reads.
 * @param value - candidate value.
 * @returns whether the value is a non-array object record.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Read one optional string field from a decoded record.
 * @param record - decoded object.
 * @param key - field name.
 * @returns the string value, or undefined when absent or of another type.
 */
export function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

/**
 * Render an unknown thrown value for an operator-visible log line.
 * @param error - caught value.
 * @returns the error message, or the stringified value.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
