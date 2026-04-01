import type { Server as HttpServer } from 'node:http'

import { Server } from 'socket.io'

import type { Logger } from '../../../../shared/logging/Logger.js'
import {
  TELEMETRY_SOCKET_EVENTS,
  type ClientToServerTelemetryEvents,
  type ConnectionStateDto,
  type ServerToClientTelemetryEvents,
  type TelemetryBatchDto,
  type TelemetrySnapshotDto,
} from '../../domain/dto/TelemetryEvents.js'
import type { TelemetryPublisher } from '../../domain/ports/TelemetryPublisher.js'
import type { RosConnectionState } from '../../domain/types/RosConnectionState.js'

interface TelemetryGatewayOptions {
  httpServer: HttpServer
  corsOrigin: string
  getSnapshot: () => TelemetrySnapshotDto
  getConnectionState: () => RosConnectionState
  logger: Logger
}

export class TelemetryGateway implements TelemetryPublisher {
  private readonly io: Server<ClientToServerTelemetryEvents, ServerToClientTelemetryEvents>
  private readonly logger: Logger

  constructor(private readonly options: TelemetryGatewayOptions) {
    this.logger = options.logger.child('TelemetryGateway')
    this.io = new Server<ClientToServerTelemetryEvents, ServerToClientTelemetryEvents>(
      options.httpServer,
      {
        cors: {
          origin: options.corsOrigin === '*' ? true : options.corsOrigin,
          methods: ['GET', 'POST'],
        },
      },
    )

    this.io.on('connection', (socket) => {
      this.logger.info('Client connected to telemetry gateway.', {
        socketId: socket.id,
      })

      socket.emit(TELEMETRY_SOCKET_EVENTS.connectionState, this.buildConnectionStatePayload(
        this.options.getConnectionState(),
      ))
      socket.emit(TELEMETRY_SOCKET_EVENTS.snapshot, this.options.getSnapshot())
      socket.on('disconnect', () => {
        this.logger.info('Client disconnected from telemetry gateway.', {
          socketId: socket.id,
        })
      })
    })
  }

  publishTelemetryBatch(payload: TelemetryBatchDto): void {
    if (payload.systems.length === 0) {
      return
    }

    this.io.emit(TELEMETRY_SOCKET_EVENTS.batch, payload)
  }

  publishConnectionState(state: RosConnectionState): void {
    this.io.emit(TELEMETRY_SOCKET_EVENTS.connectionState, this.buildConnectionStatePayload(state))
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.io.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
  }

  private buildConnectionStatePayload(state: RosConnectionState): ConnectionStateDto {
    return {
      state,
      emittedAt: new Date().toISOString(),
    }
  }
}
