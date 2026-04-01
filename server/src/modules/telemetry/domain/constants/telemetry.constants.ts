import type { RosTopicConfig, RosTopicKey } from '../types/RosTopic.js'

export const DEFAULT_RECONNECT_INTERVAL_MS = 2500
export const DEFAULT_BROADCAST_INTERVAL_MS = 100
export const DEFAULT_ROSBRIDGE_URL = 'ws://localhost:9090'
export const LEADER_SYSTEM_ID = 1
export const DEFAULT_FOLLOWER_SYSTEM_ID_START = 2
export const DEFAULT_FOLLOWER_SYSTEM_ID_END = 21

export const FOLLOWER_TOPIC_KEYS: RosTopicKey[] = [
  'status',
  'navsat',
  'imu',
  'pose',
  'twist',
  'airspeed',
  'battery',
]

export const RAD_TO_DEG = 180 / Math.PI
export const KNOT_TO_MPS = 0.514444
export const APM_ARDUPLANE_VEHICLE_TYPE = 3

export const ARDUPLANE_MODE_MAP: Record<number, string> = {
  0: 'MANUAL',
  1: 'CIRCLE',
  2: 'STABILIZE',
  3: 'TRAINING',
  4: 'ACRO',
  5: 'FBWA',
  6: 'FBWB',
  7: 'CRUISE',
  8: 'AUTOTUNE',
  10: 'AUTO',
  11: 'RTL',
  12: 'LOITER',
  13: 'TAKEOFF',
  14: 'AVOID_ADSB',
  15: 'GUIDED',
  16: 'INITIALISING',
  17: 'QSTABILIZE',
  18: 'QHOVER',
  19: 'QLOITER',
  20: 'QLAND',
  21: 'QRTL',
  22: 'QAUTOTUNE',
  23: 'QACRO',
  24: 'THERMAL',
  25: 'LOITERALTQLAND',
  26: 'AUTOLAND',
}

export const MAX_ACCEPTABLE_ALTITUDE_METERS = 12000
export const MAX_ACCEPTABLE_AIRSPEED_MPS = 140
export const MAX_ACCEPTABLE_GROUNDSPEED_MPS = 160
export const MAX_ACCEPTABLE_VERTICAL_RATE_MPS = 35
export const MAX_ACCEPTABLE_ROLL_RATE_DPS = 720
export const MAX_ACCEPTABLE_PITCH_RATE_DPS = 480
export const MAX_ACCEPTABLE_YAW_RATE_DPS = 540

export const DEFAULT_ROS_TOPIC_CONFIG: RosTopicConfig = {
  status: {
    name: '/ap/status',
    messageType: 'ardupilot_msgs/msg/Status',
  },
  battery: {
    name: '/ap/battery',
    messageType: 'sensor_msgs/msg/BatteryState',
  },
  navsat: {
    name: '/ap/navsat',
    messageType: 'sensor_msgs/msg/NavSatFix',
  },
  imu: {
    name: '/ap/imu/experimental/data',
    messageType: 'sensor_msgs/msg/Imu',
  },
  pose: {
    name: '/ap/pose/filtered',
    messageType: 'geometry_msgs/msg/PoseStamped',
  },
  twist: {
    name: '/ap/twist/filtered',
    messageType: 'geometry_msgs/msg/TwistStamped',
  },
  airspeed: {
    name: '/ap/airspeed',
    messageType: 'ardupilot_msgs/msg/Airspeed',
  },
}
