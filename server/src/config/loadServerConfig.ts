import {
  DEFAULT_BROADCAST_INTERVAL_MS,
  DEFAULT_FOLLOWER_SYSTEM_ID_END,
  DEFAULT_FOLLOWER_SYSTEM_ID_START,
  DEFAULT_RECONNECT_INTERVAL_MS,
  DEFAULT_ROSBRIDGE_URL,
  DEFAULT_ROS_TOPIC_CONFIG,
} from '../modules/telemetry/domain/constants/telemetry.constants.js'
import type {
  FollowerSystemIdRange,
  RosTopicConfig,
  RosTopicDefinition,
  RosTopicKey,
} from '../modules/telemetry/domain/types/RosTopic.js'

export interface ServerConfig {
  host: string
  port: number
  socketCorsOrigin: string
  ros: {
    url: string
    reconnectIntervalMs: number
    followerRange: FollowerSystemIdRange
    topicConfig: RosTopicConfig
  }
  telemetry: {
    broadcastIntervalMs: number
  }
}

function normalizeEnvValue(rawValue: string | undefined, fallback: string): string {
  const candidate = `${rawValue ?? ''}`.trim()
  return candidate.length > 0 ? candidate : fallback
}

function toPositiveInteger(rawValue: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(`${rawValue ?? ''}`.trim(), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeTopicMessageType(topicKey: RosTopicKey, messageType: string): string {
  if (topicKey === 'status' && messageType === 'std_msgs/msg/String') {
    return 'ardupilot_msgs/msg/Status'
  }

  if (topicKey === 'airspeed' && messageType === 'std_msgs/msg/Float32') {
    return 'ardupilot_msgs/msg/Airspeed'
  }

  return messageType
}

function normalizeFollowerSystemIdRange(
  startCandidate: number,
  endCandidate: number,
): FollowerSystemIdRange {
  const normalizedStart = Number.isFinite(startCandidate)
    ? Math.max(2, Math.floor(startCandidate))
    : DEFAULT_FOLLOWER_SYSTEM_ID_START
  const normalizedEnd = Number.isFinite(endCandidate)
    ? Math.max(normalizedStart, Math.floor(endCandidate))
    : DEFAULT_FOLLOWER_SYSTEM_ID_END

  return {
    start: normalizedStart,
    end: normalizedEnd,
  }
}

function readTopicDefinitionFromEnv(
  env: NodeJS.ProcessEnv,
  topicKey: RosTopicKey,
  fallbackDefinition: RosTopicDefinition,
): RosTopicDefinition {
  const envKeyPrefix = `ROS_TOPIC_${topicKey.toUpperCase()}`

  return {
    name: normalizeEnvValue(env[envKeyPrefix], fallbackDefinition.name),
    messageType: normalizeTopicMessageType(
      topicKey,
      normalizeEnvValue(env[`${envKeyPrefix}_TYPE`], fallbackDefinition.messageType),
    ),
  }
}

function readRosTopicConfigFromEnv(
  env: NodeJS.ProcessEnv,
  fallbackConfig: RosTopicConfig = DEFAULT_ROS_TOPIC_CONFIG,
): RosTopicConfig {
  return {
    status: readTopicDefinitionFromEnv(env, 'status', fallbackConfig.status),
    battery: readTopicDefinitionFromEnv(env, 'battery', fallbackConfig.battery),
    navsat: readTopicDefinitionFromEnv(env, 'navsat', fallbackConfig.navsat),
    imu: readTopicDefinitionFromEnv(env, 'imu', fallbackConfig.imu),
    pose: readTopicDefinitionFromEnv(env, 'pose', fallbackConfig.pose),
    twist: readTopicDefinitionFromEnv(env, 'twist', fallbackConfig.twist),
    airspeed: readTopicDefinitionFromEnv(env, 'airspeed', fallbackConfig.airspeed),
  }
}

export function loadServerConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const followerRange = normalizeFollowerSystemIdRange(
    toPositiveInteger(env.FOLLOWER_SYSTEM_ID_START, DEFAULT_FOLLOWER_SYSTEM_ID_START),
    toPositiveInteger(env.FOLLOWER_SYSTEM_ID_END, DEFAULT_FOLLOWER_SYSTEM_ID_END),
  )

  return {
    host: normalizeEnvValue(env.SERVER_HOST, '0.0.0.0'),
    port: toPositiveInteger(env.SERVER_PORT, 4000),
    socketCorsOrigin: normalizeEnvValue(env.SOCKET_CORS_ORIGIN, '*'),
    ros: {
      url: normalizeEnvValue(env.ROSBRIDGE_URL, DEFAULT_ROSBRIDGE_URL),
      reconnectIntervalMs: toPositiveInteger(
        env.ROS_RECONNECT_INTERVAL_MS,
        DEFAULT_RECONNECT_INTERVAL_MS,
      ),
      followerRange,
      topicConfig: readRosTopicConfigFromEnv(env),
    },
    telemetry: {
      broadcastIntervalMs: toPositiveInteger(
        env.TELEMETRY_BROADCAST_INTERVAL_MS,
        DEFAULT_BROADCAST_INTERVAL_MS,
      ),
    },
  }
}
