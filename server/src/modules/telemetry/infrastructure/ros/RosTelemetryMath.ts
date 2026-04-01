import {
  APM_ARDUPLANE_VEHICLE_TYPE,
  ARDUPLANE_MODE_MAP,
  MAX_ACCEPTABLE_AIRSPEED_MPS,
  RAD_TO_DEG,
} from '../../domain/constants/telemetry.constants.js'
import type { QuaternionLike } from './RosMessageValueReader.js'

export function normalizeSignedDegrees(rawAngle: number): number {
  const wrapped = ((rawAngle + 180) % 360 + 360) % 360 - 180
  return Object.is(wrapped, -0) ? 0 : wrapped
}

export function shortestAngleDifferenceDegrees(fromDegrees: number, toDegrees: number): number {
  return normalizeSignedDegrees(toDegrees - fromDegrees)
}

export function normalizeRollDegrees(rawRoll: number): number {
  return normalizeSignedDegrees(rawRoll)
}

export function normalizePitchDegrees(rawPitch: number): number {
  const signedPitch = normalizeSignedDegrees(rawPitch)
  return Math.max(-90, Math.min(90, signedPitch))
}

export function radiansToDegrees(value: number): number {
  return value * RAD_TO_DEG
}

export function toDegreesFromUnknownAngle(rawAngle: number): number {
  if (Math.abs(rawAngle) <= (Math.PI * 2) + 0.05) {
    return radiansToDegrees(rawAngle)
  }

  return rawAngle
}

export function normalizeYawDegrees(rawYaw: number): number {
  return normalizeSignedDegrees(rawYaw)
}

export function convertRollToHudConvention(rawRollDegrees: number): number {
  return normalizeRollDegrees(rawRollDegrees)
}

export function convertPitchToHudConvention(rawPitchDegrees: number): number {
  return normalizePitchDegrees(-rawPitchDegrees)
}

export function convertYawToHudConvention(rawYawDegrees: number): number {
  return normalizeYawDegrees(180 - rawYawDegrees)
}

export function applyOppositeRateSign(rawRateDegreesPerSecond: number): number {
  return -rawRateDegreesPerSecond
}

export function selectPreferredSpeed(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined
  }

  const nonZero = values.find((value) => Math.abs(value) > 0.03)
  return typeof nonZero === 'number' ? nonZero : values[0]
}

export function normalizeRelativeAltitudeMeters(rawAltitude: number): number {
  if (Math.abs(rawAltitude) > 500) {
    return rawAltitude / 1000
  }

  return rawAltitude
}

export function normalizeAirspeedMetersPerSecond(rawSpeed: number): number {
  if (Math.abs(rawSpeed) > MAX_ACCEPTABLE_AIRSPEED_MPS && Math.abs(rawSpeed) <= 5000) {
    return rawSpeed / 100
  }

  return rawSpeed
}

export function normalizeGpsStatus(rawStatus: unknown): string | undefined {
  if (typeof rawStatus === 'number' && Number.isFinite(rawStatus)) {
    if (rawStatus <= 0) {
      return 'NO_FIX'
    }

    if (rawStatus < 3) {
      return '2D_FIX'
    }

    return '3D_FIX'
  }

  if (typeof rawStatus !== 'string') {
    return undefined
  }

  const normalized = rawStatus.trim().toUpperCase()
  if (normalized.length === 0) {
    return undefined
  }

  if (normalized.includes('NO_FIX') || normalized.includes('NO FIX')) {
    return 'NO_FIX'
  }

  if (normalized.includes('2D')) {
    return '2D_FIX'
  }

  if (normalized.includes('3D') || normalized.includes('FIX')) {
    return '3D_FIX'
  }

  return normalized
}

export function normalizeMode(rawMode: unknown, vehicleType?: number): string | undefined {
  if (typeof rawMode === 'number' && Number.isFinite(rawMode)) {
    const normalizedMode = Math.round(rawMode)

    if (vehicleType === APM_ARDUPLANE_VEHICLE_TYPE) {
      return ARDUPLANE_MODE_MAP[normalizedMode] ?? `${normalizedMode}`
    }

    return `${normalizedMode}`
  }

  if (typeof rawMode !== 'string') {
    return undefined
  }

  const trimmed = rawMode.trim()
  return trimmed.length > 0 ? trimmed.toUpperCase() : undefined
}

export function normalizeQuaternion(quaternion: QuaternionLike): QuaternionLike | null {
  const norm = Math.sqrt(
    (quaternion.x ** 2)
    + (quaternion.y ** 2)
    + (quaternion.z ** 2)
    + (quaternion.w ** 2),
  )

  if (!Number.isFinite(norm) || norm < 1e-9) {
    return null
  }

  return {
    x: quaternion.x / norm,
    y: quaternion.y / norm,
    z: quaternion.z / norm,
    w: quaternion.w / norm,
  }
}

export function quaternionToEulerDegrees(quaternion: QuaternionLike): {
  roll: number
  pitch: number
  yaw: number
} {
  const normalizedQuaternion = normalizeQuaternion(quaternion)

  if (!normalizedQuaternion) {
    return {
      roll: 0,
      pitch: 0,
      yaw: 0,
    }
  }

  const { x, y, z, w } = normalizedQuaternion

  const sinrCosp = 2 * ((w * x) + (y * z))
  const cosrCosp = 1 - (2 * ((x * x) + (y * y)))
  const rollRad = Math.atan2(sinrCosp, cosrCosp)

  const sinp = 2 * ((w * y) - (z * x))
  const pitchRad = Math.abs(sinp) >= 1
    ? Math.sign(sinp) * (Math.PI / 2)
    : Math.asin(sinp)

  const sinyCosp = 2 * ((w * z) + (x * y))
  const cosyCosp = 1 - (2 * ((y * y) + (z * z)))
  const yawRad = Math.atan2(sinyCosp, cosyCosp)

  return {
    roll: radiansToDegrees(rollRad),
    pitch: radiansToDegrees(pitchRad),
    yaw: radiansToDegrees(yawRad),
  }
}

export function mapEulerToTelemetryAttitude(
  eulerDegrees: { roll: number, pitch: number, yaw: number },
  frameId: string | undefined,
): { roll: number, pitch: number, yaw: number } {
  if (typeof frameId === 'string' && frameId.toLowerCase().includes('ned')) {
    return {
      roll: convertRollToHudConvention(eulerDegrees.yaw),
      pitch: convertPitchToHudConvention(eulerDegrees.pitch),
      yaw: convertYawToHudConvention(eulerDegrees.roll),
    }
  }

  return {
    roll: convertRollToHudConvention(eulerDegrees.roll),
    pitch: convertPitchToHudConvention(eulerDegrees.pitch),
    yaw: convertYawToHudConvention(eulerDegrees.yaw),
  }
}
