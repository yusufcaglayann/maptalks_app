import {
  MAX_ACCEPTABLE_AIRSPEED_MPS,
  MAX_ACCEPTABLE_ALTITUDE_METERS,
  MAX_ACCEPTABLE_GROUNDSPEED_MPS,
  MAX_ACCEPTABLE_PITCH_RATE_DPS,
  MAX_ACCEPTABLE_ROLL_RATE_DPS,
  MAX_ACCEPTABLE_VERTICAL_RATE_MPS,
  MAX_ACCEPTABLE_YAW_RATE_DPS,
} from '../../domain/constants/telemetry.constants.js'
import {
  compactTelemetryPatch,
  type AttitudeRatesDegreesPerSecond,
  type NumericTelemetryKey,
  type RosTelemetryPatch,
} from '../../domain/dto/RosTelemetryPatch.js'
import {
  normalizeAirspeedMetersPerSecond,
  normalizePitchDegrees,
  normalizeRollDegrees,
  normalizeYawDegrees,
  shortestAngleDifferenceDegrees,
} from './RosTelemetryMath.js'

export class RosTelemetrySanitizer {
  private lastMessageTimestampByTopicMs: Record<string, number> = {}
  private lastNumericValueBySystemId: Record<number, Partial<Record<NumericTelemetryKey, number>>> = {}
  private lastNumericValueTimeBySystemIdMs: Record<
    number,
    Partial<Record<NumericTelemetryKey, number>>
  > = {}

  reset(): void {
    this.lastMessageTimestampByTopicMs = {}
    this.lastNumericValueBySystemId = {}
    this.lastNumericValueTimeBySystemIdMs = {}
  }

  isStaleMessage(staleKey: string, messageTimestampMs: number | undefined): boolean {
    if (typeof messageTimestampMs !== 'number' || !Number.isFinite(messageTimestampMs)) {
      return false
    }

    const lastTimestampMs = this.lastMessageTimestampByTopicMs[staleKey]
    if (typeof lastTimestampMs === 'number' && messageTimestampMs + 1 < lastTimestampMs) {
      return true
    }

    this.lastMessageTimestampByTopicMs[staleKey] = messageTimestampMs
    return false
  }

  sanitize(
    systemId: number,
    patch: RosTelemetryPatch,
    receivedAtMs: number,
    attitudeRates: AttitudeRatesDegreesPerSecond,
  ): RosTelemetryPatch {
    const sanitized: RosTelemetryPatch = { ...patch }

    if (typeof sanitized.roll === 'number') {
      const normalizedRoll = normalizeRollDegrees(sanitized.roll)

      if (
        !this.acceptAttitudeValue(
          systemId,
          'roll',
          normalizedRoll,
          receivedAtMs,
          MAX_ACCEPTABLE_ROLL_RATE_DPS,
          attitudeRates.roll,
          normalizeRollDegrees,
        )
      ) {
        delete sanitized.roll
      }
      else {
        sanitized.roll = normalizedRoll
      }
    }

    if (typeof sanitized.pitch === 'number') {
      const normalizedPitch = normalizePitchDegrees(sanitized.pitch)

      if (
        !this.acceptAttitudeValue(
          systemId,
          'pitch',
          normalizedPitch,
          receivedAtMs,
          MAX_ACCEPTABLE_PITCH_RATE_DPS,
          attitudeRates.pitch,
          normalizePitchDegrees,
        )
      ) {
        delete sanitized.pitch
      }
      else {
        sanitized.pitch = normalizedPitch
      }
    }

    if (typeof sanitized.yaw === 'number') {
      const normalizedYaw = normalizeYawDegrees(sanitized.yaw)

      if (
        !this.acceptAttitudeValue(
          systemId,
          'yaw',
          normalizedYaw,
          receivedAtMs,
          MAX_ACCEPTABLE_YAW_RATE_DPS,
          attitudeRates.yaw,
          normalizeYawDegrees,
        )
      ) {
        delete sanitized.yaw
      }
      else {
        sanitized.yaw = normalizedYaw
      }
    }

    if (typeof sanitized.altitude === 'number') {
      const altitude = sanitized.altitude

      if (Math.abs(altitude) > MAX_ACCEPTABLE_ALTITUDE_METERS) {
        delete sanitized.altitude
      }
      else if (
        !this.acceptNumericValue(
          systemId,
          'altitude',
          altitude,
          receivedAtMs,
          MAX_ACCEPTABLE_VERTICAL_RATE_MPS,
        )
      ) {
        delete sanitized.altitude
      }
      else {
        sanitized.altitude = altitude
      }
    }

    if (typeof sanitized.airSpeed === 'number') {
      const airSpeed = normalizeAirspeedMetersPerSecond(sanitized.airSpeed)
      const previousAirSpeed = this.lastNumericValueBySystemId[systemId]?.airSpeed
      const previousAirSpeedTimeMs = this.lastNumericValueTimeBySystemIdMs[systemId]?.airSpeed
      const looksLikeStaleZero = airSpeed <= 0.03
        && typeof previousAirSpeed === 'number'
        && previousAirSpeed > 0.5
        && typeof previousAirSpeedTimeMs === 'number'
        && (receivedAtMs - previousAirSpeedTimeMs) <= 1500

      if (
        airSpeed < 0
        || airSpeed > MAX_ACCEPTABLE_AIRSPEED_MPS
        || looksLikeStaleZero
        || !this.acceptNumericValue(systemId, 'airSpeed', airSpeed, receivedAtMs, 80)
      ) {
        delete sanitized.airSpeed
      }
      else {
        sanitized.airSpeed = airSpeed
      }
    }

    if (typeof sanitized.groundSpeed === 'number') {
      const groundSpeed = sanitized.groundSpeed

      if (
        groundSpeed < 0
        || groundSpeed > MAX_ACCEPTABLE_GROUNDSPEED_MPS
        || !this.acceptNumericValue(systemId, 'groundSpeed', groundSpeed, receivedAtMs, 80)
      ) {
        delete sanitized.groundSpeed
      }
    }

    if (typeof sanitized.latitude === 'number' && (sanitized.latitude < -90 || sanitized.latitude > 90)) {
      delete sanitized.latitude
    }

    if (
      typeof sanitized.longitude === 'number'
      && (sanitized.longitude < -180 || sanitized.longitude > 180)
    ) {
      delete sanitized.longitude
    }

    if (typeof sanitized.satelliteCount === 'number' && sanitized.satelliteCount < 0) {
      delete sanitized.satelliteCount
    }

    return compactTelemetryPatch(sanitized)
  }

  private acceptNumericValue(
    systemId: number,
    key: NumericTelemetryKey,
    value: number,
    receivedAtMs: number,
    maxRatePerSecond: number,
  ): boolean {
    const numericValuesForSystem = this.lastNumericValueBySystemId[systemId] ?? {}
    const numericValueTimesForSystem = this.lastNumericValueTimeBySystemIdMs[systemId] ?? {}
    const previousValue = numericValuesForSystem[key]
    const previousTimeMs = numericValueTimesForSystem[key]

    if (typeof previousValue === 'number' && typeof previousTimeMs === 'number') {
      const elapsedSeconds = Math.max((receivedAtMs - previousTimeMs) / 1000, 0.001)
      const rate = Math.abs(value - previousValue) / elapsedSeconds

      if (rate > maxRatePerSecond) {
        return false
      }
    }

    numericValuesForSystem[key] = value
    numericValueTimesForSystem[key] = receivedAtMs
    this.lastNumericValueBySystemId[systemId] = numericValuesForSystem
    this.lastNumericValueTimeBySystemIdMs[systemId] = numericValueTimesForSystem

    return true
  }

  private acceptAttitudeValue(
    systemId: number,
    key: 'roll' | 'pitch' | 'yaw',
    value: number,
    receivedAtMs: number,
    maxRatePerSecond: number,
    measuredRatePerSecond: number | undefined,
    normalizeAngle: (rawAngle: number) => number,
  ): boolean {
    const numericValuesForSystem = this.lastNumericValueBySystemId[systemId] ?? {}
    const numericValueTimesForSystem = this.lastNumericValueTimeBySystemIdMs[systemId] ?? {}
    const previousValue = numericValuesForSystem[key]
    const previousTimeMs = numericValueTimesForSystem[key]

    if (typeof previousValue === 'number' && typeof previousTimeMs === 'number') {
      const elapsedSeconds = Math.max((receivedAtMs - previousTimeMs) / 1000, 0.001)
      const deltaDegrees = shortestAngleDifferenceDegrees(previousValue, value)
      const observedRatePerSecond = Math.abs(deltaDegrees) / elapsedSeconds
      const rateWithinLimit = observedRatePerSecond <= maxRatePerSecond

      if (!rateWithinLimit) {
        const hasUsableMeasuredRate = typeof measuredRatePerSecond === 'number'
          && Number.isFinite(measuredRatePerSecond)
          && Math.abs(measuredRatePerSecond) <= (maxRatePerSecond * 3)

        if (!hasUsableMeasuredRate) {
          return false
        }

        const predicted = normalizeAngle(previousValue + (measuredRatePerSecond * elapsedSeconds))
        const predictionError = Math.abs(shortestAngleDifferenceDegrees(predicted, value))
        const predictionTolerance = Math.max(4, Math.abs(measuredRatePerSecond) * elapsedSeconds * 1.8)

        if (predictionError > predictionTolerance) {
          return false
        }
      }
    }

    numericValuesForSystem[key] = value
    numericValueTimesForSystem[key] = receivedAtMs
    this.lastNumericValueBySystemId[systemId] = numericValuesForSystem
    this.lastNumericValueTimeBySystemIdMs[systemId] = numericValueTimesForSystem

    return true
  }
}
