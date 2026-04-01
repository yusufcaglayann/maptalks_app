import type { RosConnectionState } from '../types/RosConnectionState.js'
import type { RosTelemetryPatch, TelemetrySystemState } from './RosTelemetryPatch.js'

export const TELEMETRY_SOCKET_EVENTS = {
  batch: 'telemetry:batch',
  snapshot: 'telemetry:snapshot',
  connectionState: 'telemetry:connection-state',
} as const

export interface TelemetryBatchSystemDto {
  systemId: number
  patch: RosTelemetryPatch
  snapshot: RosTelemetryPatch
  updatedAt: string
}

export interface TelemetryBatchDto {
  emittedAt: string
  systems: TelemetryBatchSystemDto[]
}

export interface TelemetrySnapshotDto {
  emittedAt: string
  systems: TelemetrySystemState[]
}

export interface ConnectionStateDto {
  state: RosConnectionState
  emittedAt: string
}

export interface ServerToClientTelemetryEvents {
  'telemetry:batch': (payload: TelemetryBatchDto) => void
  'telemetry:snapshot': (payload: TelemetrySnapshotDto) => void
  'telemetry:connection-state': (payload: ConnectionStateDto) => void
}

export interface ClientToServerTelemetryEvents {
  'telemetry:ping': () => void
}
