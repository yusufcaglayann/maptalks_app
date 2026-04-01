export interface Logger {
  child(scope: string): Logger
  info(message: string, metadata?: Record<string, unknown>): void
  warn(message: string, metadata?: Record<string, unknown>): void
  error(message: string, metadata?: Record<string, unknown>): void
  debug(message: string, metadata?: Record<string, unknown>): void
}

function serializeMetadata(metadata?: Record<string, unknown>): string {
  if (!metadata || Object.keys(metadata).length === 0) {
    return ''
  }

  try {
    return ` ${JSON.stringify(metadata)}`
  }
  catch {
    return ' {"metadata":"unserializable"}'
  }
}

export class ConsoleLogger implements Logger {
  constructor(private readonly scope = 'app') {}

  child(scope: string): Logger {
    return new ConsoleLogger(`${this.scope}:${scope}`)
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log('INFO', message, metadata)
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log('WARN', message, metadata)
  }

  error(message: string, metadata?: Record<string, unknown>): void {
    this.log('ERROR', message, metadata)
  }

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log('DEBUG', message, metadata)
  }

  private log(level: string, message: string, metadata?: Record<string, unknown>): void {
    const timestamp = new Date().toISOString()
    const serializedMetadata = serializeMetadata(metadata)
    console.log(`[${timestamp}] [${level}] [${this.scope}] ${message}${serializedMetadata}`)
  }
}
