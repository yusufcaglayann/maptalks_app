import process from 'node:process'

import WebSocket from 'ws'

import { createApiServer } from './bootstrap/createServer.js'
import { loadServerConfig } from './config/loadServerConfig.js'
import { RosTelemetryService } from './modules/telemetry/application/services/RosTelemetryService.js'
import { TelemetryStreamService } from './modules/telemetry/application/services/TelemetryStreamService.js'
import { RosConnectionManager } from './modules/telemetry/infrastructure/ros/RosConnectionManager.js'
import { RosTelemetryParser } from './modules/telemetry/infrastructure/ros/RosTelemetryParser.js'
import { RosTelemetrySanitizer } from './modules/telemetry/infrastructure/ros/RosTelemetrySanitizer.js'
import { RosTopicSubscriber } from './modules/telemetry/infrastructure/ros/RosTopicSubscriber.js'
import { RosTopicSubscriptionFactory } from './modules/telemetry/infrastructure/ros/RosTopicSubscriptionFactory.js'
import { TelemetryGateway } from './modules/telemetry/infrastructure/websocket/TelemetryGateway.js'
import { ConsoleLogger } from './shared/logging/Logger.js'

const websocketGlobal = globalThis as unknown as { WebSocket?: typeof WebSocket }
if (typeof websocketGlobal.WebSocket === 'undefined') {
  websocketGlobal.WebSocket = WebSocket
}

const logger = new ConsoleLogger('gcs-backend')
const config = loadServerConfig()

let rosTelemetryService: RosTelemetryService | null = null
let telemetryStreamService: TelemetryStreamService | null = null

const httpServer = createApiServer(
  config,
  {
    getConnectionState: () => rosTelemetryService?.getConnectionState() ?? 'idle',
    getTelemetrySnapshot: () => telemetryStreamService?.getSnapshot() ?? {
      emittedAt: new Date().toISOString(),
      systems: [],
    },
  },
  logger.child('HttpApi'),
)

const telemetryGateway = new TelemetryGateway({
  httpServer,
  corsOrigin: config.socketCorsOrigin,
  getConnectionState: () => rosTelemetryService?.getConnectionState() ?? 'idle',
  getSnapshot: () => telemetryStreamService?.getSnapshot() ?? {
    emittedAt: new Date().toISOString(),
    systems: [],
  },
  logger,
})

telemetryStreamService = new TelemetryStreamService({
  broadcastIntervalMs: config.telemetry.broadcastIntervalMs,
  publisher: telemetryGateway,
  logger,
})

rosTelemetryService = new RosTelemetryService({
  connectionManager: new RosConnectionManager({
    url: config.ros.url,
    reconnectIntervalMs: config.ros.reconnectIntervalMs,
    logger,
  }),
  subscriptionFactory: new RosTopicSubscriptionFactory(
    config.ros.topicConfig,
    config.ros.followerRange,
  ),
  topicSubscriber: new RosTopicSubscriber(logger),
  parser: new RosTelemetryParser(),
  sanitizer: new RosTelemetrySanitizer(),
  telemetryStreamService,
  publisher: telemetryGateway,
  logger,
})

async function shutdown(signal: string): Promise<void> {
  logger.info('Shutdown signal received.', { signal })

  try {
    rosTelemetryService?.stop()
    await telemetryGateway.close()
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        if (error) {
          reject(error)
          return
        }

        resolve()
      })
    })
    logger.info('Backend shutdown completed.')
    process.exit(0)
  }
  catch (error) {
    logger.error('Backend shutdown failed.', {
      error: error instanceof Error ? error.message : String(error),
    })
    process.exit(1)
  }
}

httpServer.listen(config.port, config.host, () => {
  logger.info('GCS backend listening.', {
    host: config.host,
    port: config.port,
    rosbridgeUrl: config.ros.url,
  })

  rosTelemetryService?.start()
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal)
  })
}
