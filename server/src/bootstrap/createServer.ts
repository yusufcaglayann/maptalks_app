import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import type { ServerConfig } from '../config/loadServerConfig.js'
import type { Logger } from '../shared/logging/Logger.js'
import type { TelemetrySnapshotDto } from '../modules/telemetry/domain/dto/TelemetryEvents.js'
import type { RosConnectionState } from '../modules/telemetry/domain/types/RosConnectionState.js'

interface ApiStateProvider {
  getConnectionState: () => RosConnectionState
  getTelemetrySnapshot: () => TelemetrySnapshotDto
}

function writeJson(
  response: ServerResponse<IncomingMessage>,
  statusCode: number,
  payload: unknown,
  corsOrigin: string,
): void {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Access-Control-Allow-Origin', corsOrigin)
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  response.end(JSON.stringify(payload))
}

export function createApiServer(
  config: ServerConfig,
  provider: ApiStateProvider,
  logger: Logger,
): Server {
  return createServer((request, response) => {
    const requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`)

    if (request.method === 'OPTIONS') {
      writeJson(response, 204, {}, config.socketCorsOrigin)
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/gcs/health') {
      const snapshot = provider.getTelemetrySnapshot()

      writeJson(response, 200, {
        status: 'ok',
        rosConnectionState: provider.getConnectionState(),
        activeSystems: snapshot.systems.length,
        rosbridgeUrl: config.ros.url,
        broadcastIntervalMs: config.telemetry.broadcastIntervalMs,
        emittedAt: new Date().toISOString(),
      }, config.socketCorsOrigin)
      return
    }

    if (request.method === 'GET' && requestUrl.pathname === '/api/gcs/telemetry') {
      writeJson(response, 200, provider.getTelemetrySnapshot(), config.socketCorsOrigin)
      return
    }

    logger.debug('Unhandled HTTP request.', {
      method: request.method,
      pathname: requestUrl.pathname,
    })

    writeJson(response, 404, {
      error: 'Not Found',
    }, config.socketCorsOrigin)
  })
}
