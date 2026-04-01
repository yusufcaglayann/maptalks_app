import type { Logger } from '../../../../shared/logging/Logger.js'
import type { TelemetryBatchDto, TelemetrySnapshotDto } from '../../domain/dto/TelemetryEvents.js'
import {
  hasAnyPatchValue,
  type RosTelemetryPatch,
  type TelemetrySystemState,
} from '../../domain/dto/RosTelemetryPatch.js'
import type { TelemetryPublisher } from '../../domain/ports/TelemetryPublisher.js'

interface TelemetryStreamServiceOptions {
  broadcastIntervalMs: number
  publisher: TelemetryPublisher
  logger: Logger
}

export class TelemetryStreamService {
  private readonly telemetryBySystemId = new Map<number, TelemetrySystemState>()
  private readonly pendingPatchBySystemId = new Map<number, RosTelemetryPatch>()
  private readonly publisher: TelemetryPublisher
  private readonly logger: Logger
  private flushTimer: NodeJS.Timeout | null = null

  constructor(private readonly options: TelemetryStreamServiceOptions) {
    this.publisher = options.publisher
    this.logger = options.logger.child('TelemetryStreamService')
  }

  start(): void {
    if (this.flushTimer !== null) {
      return
    }

    this.flushTimer = setInterval(() => {
      this.flush()
    }, this.options.broadcastIntervalMs)

    this.logger.info('Telemetry broadcast scheduler started.', {
      intervalMs: this.options.broadcastIntervalMs,
    })
  }

  stop(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }

    this.flush()
  }

  ingestPatch(systemId: number, patch: RosTelemetryPatch): void {
    if (!hasAnyPatchValue(patch)) {
      return
    }

    const updatedAt = new Date().toISOString()
    const previousState = this.telemetryBySystemId.get(systemId)
    const mergedTelemetry = {
      ...(previousState?.telemetry ?? {}),
      ...patch,
    }

    this.telemetryBySystemId.set(systemId, {
      systemId,
      telemetry: mergedTelemetry,
      updatedAt,
    })

    this.pendingPatchBySystemId.set(systemId, {
      ...(this.pendingPatchBySystemId.get(systemId) ?? {}),
      ...patch,
    })
  }

  getSnapshot(): TelemetrySnapshotDto {
    return {
      emittedAt: new Date().toISOString(),
      systems: [...this.telemetryBySystemId.values()].sort((left, right) => left.systemId - right.systemId),
    }
  }

  private flush(): void {
    if (this.pendingPatchBySystemId.size === 0) {
      return
    }

    const emittedAt = new Date().toISOString()
    const payload: TelemetryBatchDto = {
      emittedAt,
      systems: [...this.pendingPatchBySystemId.entries()]
        .sort(([leftId], [rightId]) => leftId - rightId)
        .map(([systemId, patch]) => {
          const latestState = this.telemetryBySystemId.get(systemId)

          return {
            systemId,
            patch,
            snapshot: latestState?.telemetry ?? {},
            updatedAt: latestState?.updatedAt ?? emittedAt,
          }
        }),
    }

    this.pendingPatchBySystemId.clear()
    this.publisher.publishTelemetryBatch(payload)
  }
}
