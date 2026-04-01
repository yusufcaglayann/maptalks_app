import {
  FOLLOWER_TOPIC_KEYS,
  LEADER_SYSTEM_ID,
} from '../../domain/constants/telemetry.constants.js'
import type {
  FollowerSystemIdRange,
  RosTopicConfig,
  TopicSubscriptionSpec,
} from '../../domain/types/RosTopic.js'

function buildFollowerNamespace(systemId: number): string {
  return `/uav_${systemId.toString().padStart(2, '0')}`
}

function buildNamespacedTopicName(namespace: string, baseTopicName: string): string {
  const normalizedNamespace = namespace.endsWith('/')
    ? namespace.slice(0, -1)
    : namespace
  const normalizedBaseTopicName = baseTopicName.startsWith('/')
    ? baseTopicName
    : `/${baseTopicName}`

  return `${normalizedNamespace}${normalizedBaseTopicName}`
}

function extractSystemIdFromTopicName(topicName: string): number {
  const followerMatch = topicName.match(/^\/uav_(\d+)\//i)

  if (followerMatch) {
    const followerSystemId = followerMatch[1]
    if (!followerSystemId) {
      return LEADER_SYSTEM_ID
    }

    const parsed = Number.parseInt(followerSystemId, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }

  if (topicName.startsWith('/ap/')) {
    return LEADER_SYSTEM_ID
  }

  return LEADER_SYSTEM_ID
}

export class RosTopicSubscriptionFactory {
  constructor(
    private readonly topicConfig: RosTopicConfig,
    private readonly followerRange: FollowerSystemIdRange,
  ) {}

  build(): TopicSubscriptionSpec[] {
    const subscriptions: TopicSubscriptionSpec[] = []
    const topicKeys = Object.keys(this.topicConfig) as Array<keyof RosTopicConfig>

    for (const topicKey of topicKeys) {
      const topicDefinition = this.topicConfig[topicKey]
      const topicName = topicDefinition.name

      subscriptions.push({
        topicKey,
        topicName,
        messageType: topicDefinition.messageType,
        systemId: extractSystemIdFromTopicName(topicName),
        staleKey: `${LEADER_SYSTEM_ID}:${topicKey}:${topicName}`,
      })
    }

    for (let systemId = this.followerRange.start; systemId <= this.followerRange.end; systemId += 1) {
      const followerNamespace = buildFollowerNamespace(systemId)

      for (const topicKey of FOLLOWER_TOPIC_KEYS) {
        const topicDefinition = this.topicConfig[topicKey]
        const topicName = buildNamespacedTopicName(followerNamespace, topicDefinition.name)

        subscriptions.push({
          topicKey,
          topicName,
          messageType: topicDefinition.messageType,
          systemId: extractSystemIdFromTopicName(topicName),
          staleKey: `${systemId}:${topicKey}`,
        })
      }
    }

    return subscriptions
  }
}
