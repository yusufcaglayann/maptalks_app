import { KNOT_TO_MPS } from '../../domain/constants/telemetry.constants.js'
import {
  compactTelemetryPatch,
  type AttitudeRatesDegreesPerSecond,
  type ParsedRosTelemetryMessage,
  type RosTelemetryPatch,
} from '../../domain/dto/RosTelemetryPatch.js'
import type { RosMessage, RosTopicKey } from '../../domain/types/RosTopic.js'
import {
  extractQuaternion,
  extractMessageTimestampMs,
  pickAllNumbers,
  pickBoolean,
  pickNumber,
  pickNumberWithPath,
  pickString,
  toInteger,
} from './RosMessageValueReader.js'
import {
  applyOppositeRateSign,
  convertPitchToHudConvention,
  convertRollToHudConvention,
  convertYawToHudConvention,
  mapEulerToTelemetryAttitude,
  normalizeAirspeedMetersPerSecond,
  normalizeGpsStatus,
  normalizeMode,
  normalizeRelativeAltitudeMeters,
  quaternionToEulerDegrees,
  radiansToDegrees,
  selectPreferredSpeed,
  toDegreesFromUnknownAngle,
} from './RosTelemetryMath.js'

export class RosTelemetryParser {
  parse(topicKey: RosTopicKey, message: RosMessage): ParsedRosTelemetryMessage {
    return {
      patch: this.parsePatch(topicKey, message),
      messageTimestampMs: extractMessageTimestampMs(message),
      attitudeRates: this.extractAttitudeRatesDegreesPerSecond(message),
    }
  }

  private parsePatch(topicKey: RosTopicKey, message: RosMessage): RosTelemetryPatch {
    switch (topicKey) {
      case 'status':
        return this.extractStatusPatch(message)
      case 'battery':
        return this.extractBatteryPatch(message)
      case 'navsat':
        return this.extractNavSatPatch(message)
      case 'imu':
        return this.extractImuPatch(message)
      case 'pose':
        return this.extractPosePatch(message)
      case 'twist':
        return this.extractTwistPatch(message)
      case 'airspeed':
        return this.extractAirspeedPatch(message)
      default:
        return {}
    }
  }

  private extractSignedRateDegreesPerSecond(
    message: RosMessage,
    degreePaths: string[],
    radianPaths: string[],
  ): number | undefined {
    const degreeRate = pickNumber(message, degreePaths)
    if (typeof degreeRate === 'number') {
      return applyOppositeRateSign(degreeRate)
    }

    const radianRate = pickNumber(message, radianPaths)
    if (typeof radianRate === 'number') {
      return applyOppositeRateSign(radiansToDegrees(radianRate))
    }

    return undefined
  }

  private extractAttitudeRatesDegreesPerSecond(
    message: RosMessage,
  ): AttitudeRatesDegreesPerSecond {
    const rollRate = this.extractSignedRateDegreesPerSecond(
      message,
      [
        'roll_rate_deg',
        'roll_rate_dps',
        'rollspeed_deg_s',
        'attitude.roll_rate_deg',
        'attitude.roll_rate_dps',
        'body_rate.roll_deg_s',
      ],
      [
        'roll_rate_rad',
        'roll_rate_rad_s',
        'roll_rate',
        'rollspeed',
        'attitude.roll_rate',
        'body_rate.roll',
        'body_rate.x',
        'angular_velocity.x',
        'imu.angular_velocity.x',
      ],
    )

    const pitchRate = this.extractSignedRateDegreesPerSecond(
      message,
      [
        'pitch_rate_deg',
        'pitch_rate_dps',
        'pitchspeed_deg_s',
        'attitude.pitch_rate_deg',
        'attitude.pitch_rate_dps',
        'body_rate.pitch_deg_s',
      ],
      [
        'pitch_rate_rad',
        'pitch_rate_rad_s',
        'pitch_rate',
        'pitchspeed',
        'attitude.pitch_rate',
        'body_rate.pitch',
        'body_rate.y',
        'angular_velocity.y',
        'imu.angular_velocity.y',
      ],
    )

    const yawRate = this.extractSignedRateDegreesPerSecond(
      message,
      [
        'yaw_rate_deg',
        'yaw_rate_dps',
        'yawspeed_deg_s',
        'attitude.yaw_rate_deg',
        'attitude.yaw_rate_dps',
        'body_rate.yaw_deg_s',
      ],
      [
        'yaw_rate_rad',
        'yaw_rate_rad_s',
        'yaw_rate',
        'yawspeed',
        'attitude.yaw_rate',
        'body_rate.yaw',
        'body_rate.z',
        'angular_velocity.z',
        'imu.angular_velocity.z',
      ],
    )

    return compactTelemetryPatch({
      roll: rollRate,
      pitch: pitchRate,
      yaw: yawRate,
    }) as AttitudeRatesDegreesPerSecond
  }

  private extractRollDegrees(message: RosMessage): number | undefined {
    const rollDegreesPath = pickNumberWithPath(message, [
      'roll_deg',
      'attitude.roll_deg',
      'attitude.roll_degrees',
    ])

    if (rollDegreesPath) {
      return convertRollToHudConvention(rollDegreesPath.value)
    }

    const rollRaw = pickNumberWithPath(message, [
      'roll',
      'attitude.roll',
      'attitude.roll_rad',
      'euler.roll',
    ])

    if (!rollRaw) {
      return undefined
    }

    return convertRollToHudConvention(toDegreesFromUnknownAngle(rollRaw.value))
  }

  private extractPitchDegrees(message: RosMessage): number | undefined {
    const pitchDegreesPath = pickNumberWithPath(message, [
      'pitch_deg',
      'attitude.pitch_deg',
      'attitude.pitch_degrees',
    ])

    if (pitchDegreesPath) {
      return convertPitchToHudConvention(pitchDegreesPath.value)
    }

    const pitchRaw = pickNumberWithPath(message, [
      'pitch',
      'attitude.pitch',
      'attitude.pitch_rad',
      'euler.pitch',
    ])

    if (!pitchRaw) {
      return undefined
    }

    return convertPitchToHudConvention(toDegreesFromUnknownAngle(pitchRaw.value))
  }

  private extractYawDegrees(message: RosMessage): number | undefined {
    const yawDegrees = pickNumber(message, [
      'yaw_deg',
      'attitude.yaw_deg',
      'attitude.yaw_degrees',
    ])

    if (typeof yawDegrees === 'number') {
      return convertYawToHudConvention(yawDegrees)
    }

    const yawRaw = pickNumber(message, [
      'yaw',
      'attitude.yaw',
      'attitude.yaw_rad',
      'euler.yaw',
    ])

    if (typeof yawRaw === 'number') {
      return convertYawToHudConvention(toDegreesFromUnknownAngle(yawRaw))
    }

    return undefined
  }

  private extractAltitudeMetersFromStatus(message: RosMessage): number | undefined {
    const relativeAltitude = pickNumber(message, [
      'relative_altitude',
      'relative_alt',
      'global_position.relative_alt',
    ])

    if (typeof relativeAltitude === 'number') {
      return normalizeRelativeAltitudeMeters(relativeAltitude)
    }

    const altitudeMeters = pickNumber(message, [
      'altitude',
      'alt',
      'vfr_hud.alt',
      'position.altitude',
      'gps.altitude',
      'global_position.alt',
    ])

    if (typeof altitudeMeters === 'number') {
      return altitudeMeters
    }

    return undefined
  }

  private extractGroundSpeedMetersPerSecond(message: RosMessage): number | undefined {
    const values = [
      ...pickAllNumbers(message, [
        'ground_speed',
        'groundspeed',
        'velocity.ground_speed',
        'speed.ground',
        'vfr_hud.groundspeed',
      ]),
      ...pickAllNumbers(message, [
        'groundspeed_knots',
        'vfr_hud.groundspeed_knots',
      ]).map((value) => value * KNOT_TO_MPS),
    ]

    return selectPreferredSpeed(values)
  }

  private extractAirSpeedMetersPerSecond(message: RosMessage): number | undefined {
    const trueAirspeedX = pickNumber(message, ['true_airspeed.x'])
    const trueAirspeedY = pickNumber(message, ['true_airspeed.y'])
    const trueAirspeedZ = pickNumber(message, ['true_airspeed.z'])

    const hasTrueAirspeedVector = typeof trueAirspeedX === 'number'
      || typeof trueAirspeedY === 'number'
      || typeof trueAirspeedZ === 'number'
    const trueAirspeedMagnitude = hasTrueAirspeedVector
      ? Math.sqrt(
          ((trueAirspeedX ?? 0) ** 2)
          + ((trueAirspeedY ?? 0) ** 2)
          + ((trueAirspeedZ ?? 0) ** 2),
        )
      : undefined

    const values = [
      ...(typeof trueAirspeedMagnitude === 'number' ? [trueAirspeedMagnitude] : []),
      ...(typeof trueAirspeedX === 'number' ? [Math.abs(trueAirspeedX)] : []),
      ...pickAllNumbers(message, [
        'airspeed',
        'air_speed',
        'velocity.air_speed',
        'speed.air',
        'vfr_hud.airspeed',
        'indicated_airspeed',
        'data',
      ]).map((value) => normalizeAirspeedMetersPerSecond(value)),
      ...pickAllNumbers(message, [
        'airspeed_knots',
        'vfr_hud.airspeed_knots',
        'true_airspeed_knots',
        'indicated_airspeed_knots',
      ]).map((value) => value * KNOT_TO_MPS),
    ]

    return selectPreferredSpeed(values)
  }

  private extractAttitudePatch(message: RosMessage): RosTelemetryPatch {
    const rollFromMessage = this.extractRollDegrees(message)
    const pitchFromMessage = this.extractPitchDegrees(message)
    const yawFromMessage = this.extractYawDegrees(message)
    const frameId = pickString(message, ['header.frame_id', 'frame_id'])
    const quaternion = extractQuaternion(message)

    if (quaternion) {
      const euler = quaternionToEulerDegrees(quaternion)
      const mappedAttitude = mapEulerToTelemetryAttitude(euler, frameId)

      return compactTelemetryPatch({
        roll: typeof rollFromMessage === 'number' ? rollFromMessage : mappedAttitude.roll,
        pitch: typeof pitchFromMessage === 'number' ? pitchFromMessage : mappedAttitude.pitch,
        yaw: typeof yawFromMessage === 'number' ? yawFromMessage : mappedAttitude.yaw,
      })
    }

    return compactTelemetryPatch({
      roll: rollFromMessage,
      pitch: pitchFromMessage,
      yaw: yawFromMessage,
    })
  }

  private extractStatusPatch(message: RosMessage): RosTelemetryPatch {
    const statusValue = pickString(message, [
      'gps_status',
      'gps.status',
      'gps.fix_type',
      'fix_type',
      'mode',
      'status',
    ]) ?? pickNumber(message, [
      'gps_status',
      'gps.status',
      'gps.fix_type',
      'fix_type',
    ])

    const gpsStatus = normalizeGpsStatus(statusValue)
    const satelliteCount = pickNumber(message, [
      'satellite_count',
      'satellites_visible',
      'satellites',
      'gps.satellites_visible',
      'gps.satellite_count',
      'sat_count',
    ])
    const rssi = pickNumber(message, [
      'rssi',
      'signal.rssi',
      'radio.rssi',
      'link_quality',
    ])
    const vehicleType = pickNumber(message, [
      'vehicle_type',
      'vehicle.type',
      'status.vehicle_type',
    ])
    const rawMode = pickString(message, [
      'mode',
      'flight_mode',
      'state.mode',
      'vehicle.mode',
      'status.mode',
      'custom_mode',
    ]) ?? pickNumber(message, [
      'mode',
      'flight_mode',
      'state.mode',
      'vehicle.mode',
      'status.mode',
      'custom_mode',
    ])
    const mode = normalizeMode(
      rawMode,
      typeof vehicleType === 'number' ? toInteger(vehicleType) : undefined,
    )
    const armed = pickBoolean(message, [
      'armed',
      'is_armed',
      'state.armed',
      'status.armed',
      'vehicle.armed',
    ])
    const flying = pickBoolean(message, [
      'flying',
      'is_flying',
      'in_air',
      'state.flying',
      'status.flying',
      'vehicle.flying',
    ])
    const latitude = pickNumber(message, ['latitude', 'position.latitude', 'gps.latitude'])
    const longitude = pickNumber(message, ['longitude', 'position.longitude', 'gps.longitude'])
    const altitude = this.extractAltitudeMetersFromStatus(message)
    const groundSpeed = this.extractGroundSpeedMetersPerSecond(message)
    const airSpeed = this.extractAirSpeedMetersPerSecond(message)
    const yaw = this.extractYawDegrees(message)

    return compactTelemetryPatch({
      yaw,
      latitude,
      longitude,
      altitude,
      groundSpeed,
      airSpeed,
      satelliteCount: typeof satelliteCount === 'number' ? toInteger(satelliteCount) : undefined,
      gpsStatus,
      rssi,
      mode,
      armed,
      flying,
    })
  }

  private extractBatteryPatch(message: RosMessage): RosTelemetryPatch {
    const rssi = pickNumber(message, ['rssi', 'signal.rssi', 'radio.rssi'])
    return compactTelemetryPatch({ rssi })
  }

  private extractNavSatPatch(message: RosMessage): RosTelemetryPatch {
    const latitude = pickNumber(message, ['latitude'])
    const longitude = pickNumber(message, ['longitude'])
    const altitude = pickNumber(message, ['altitude'])
    const navsatStatusCode = pickNumber(message, ['status.status', 'status', 'fix_type'])

    return compactTelemetryPatch({
      latitude,
      longitude,
      altitude,
      gpsStatus: normalizeGpsStatus(navsatStatusCode),
    })
  }

  private extractImuPatch(message: RosMessage): RosTelemetryPatch {
    return compactTelemetryPatch({
      ...this.extractAttitudePatch(message),
    })
  }

  private extractPosePatch(message: RosMessage): RosTelemetryPatch {
    const altitude = pickNumber(message, [
      'pose.position.z',
      'pose.pose.position.z',
      'position.z',
    ])

    return compactTelemetryPatch({
      altitude,
      ...this.extractAttitudePatch(message),
    })
  }

  private extractTwistPatch(message: RosMessage): RosTelemetryPatch {
    const linearX = pickNumber(message, ['twist.linear.x', 'twist.twist.linear.x', 'linear.x'])
    const linearY = pickNumber(message, ['twist.linear.y', 'twist.twist.linear.y', 'linear.y'])
    const hasHorizontalComponent = typeof linearX === 'number' || typeof linearY === 'number'
    const horizontalMagnitude = hasHorizontalComponent
      ? Math.sqrt(((linearX ?? 0) ** 2) + ((linearY ?? 0) ** 2))
      : undefined
    const groundSpeed = pickNumber(message, [
      'ground_speed',
      'groundspeed',
    ]) ?? horizontalMagnitude

    return compactTelemetryPatch({ groundSpeed })
  }

  private extractAirspeedPatch(message: RosMessage): RosTelemetryPatch {
    const airSpeed = this.extractAirSpeedMetersPerSecond(message)
    return compactTelemetryPatch({ airSpeed })
  }
}
