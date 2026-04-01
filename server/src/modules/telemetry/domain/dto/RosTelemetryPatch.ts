export interface RosTelemetryPatch {
  roll?: number
  pitch?: number
  yaw?: number
  altitude?: number
  groundSpeed?: number
  airSpeed?: number
  latitude?: number
  longitude?: number
  satelliteCount?: number
  gpsStatus?: string
  rssi?: number
  mode?: string
  armed?: boolean
  flying?: boolean
}

export interface AttitudeRatesDegreesPerSecond {
  roll?: number
  pitch?: number
  yaw?: number
}

export interface ParsedRosTelemetryMessage {
  patch: RosTelemetryPatch
  messageTimestampMs?: number
  attitudeRates: AttitudeRatesDegreesPerSecond
}

export interface TelemetrySystemState {
  systemId: number
  telemetry: RosTelemetryPatch
  updatedAt: string
}

export type NumericTelemetryKey =
  | 'roll'
  | 'pitch'
  | 'yaw'
  | 'altitude'
  | 'groundSpeed'
  | 'airSpeed'
  | 'latitude'
  | 'longitude'
  | 'satelliteCount'
  | 'rssi'

export function compactTelemetryPatch(patch: RosTelemetryPatch): RosTelemetryPatch {
  const compacted: RosTelemetryPatch = {}
  const keys = Object.keys(patch) as Array<keyof RosTelemetryPatch>
  const target = compacted as Record<
    keyof RosTelemetryPatch,
    RosTelemetryPatch[keyof RosTelemetryPatch] | undefined
  >

  for (const key of keys) {
    const value = patch[key]

    if (typeof value === 'number' && Number.isFinite(value)) {
      target[key] = value
      continue
    }

    if (typeof value === 'string' && value.length > 0) {
      target[key] = value
      continue
    }

    if (typeof value === 'boolean') {
      target[key] = value
    }
  }

  return compacted
}

export function hasAnyPatchValue(patch: RosTelemetryPatch): boolean {
  return (Object.keys(patch) as Array<keyof RosTelemetryPatch>).some((key) => {
    const value = patch[key]

    if (typeof value === 'number') {
      return Number.isFinite(value)
    }

    if (typeof value === 'string') {
      return value.length > 0
    }

    return typeof value === 'boolean'
  })
}
