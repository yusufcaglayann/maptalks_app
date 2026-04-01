export interface RosTopicDefinition {
  name: string
  messageType: string
}

export interface RosTopicConfig {
  status: RosTopicDefinition
  battery: RosTopicDefinition
  navsat: RosTopicDefinition
  imu: RosTopicDefinition
  pose: RosTopicDefinition
  twist: RosTopicDefinition
  airspeed: RosTopicDefinition
}

export type RosTopicKey = keyof RosTopicConfig

export interface FollowerSystemIdRange {
  start: number
  end: number
}

export interface TopicSubscriptionSpec {
  topicKey: RosTopicKey
  topicName: string
  messageType: string
  systemId: number
  staleKey: string
}

export type RosMessage = Record<string, unknown>
