import ROSLIB from 'roslib'

import type { Logger } from '../../../../shared/logging/Logger.js'
import type { RosMessage, TopicSubscriptionSpec } from '../../domain/types/RosTopic.js'

export type TopicMessageHandler = (subscription: TopicSubscriptionSpec, message: RosMessage) => void

export class RosTopicSubscriber {
  private subscriptions: ROSLIB.Topic[] = []

  constructor(private readonly logger: Logger) {}

  subscribeAll(
    ros: ROSLIB.Ros,
    subscriptionSpecs: TopicSubscriptionSpec[],
    onMessage: TopicMessageHandler,
  ): void {
    this.unsubscribeAll()

    for (const subscriptionSpec of subscriptionSpecs) {
      const topic = new ROSLIB.Topic({
        ros,
        name: subscriptionSpec.topicName,
        messageType: subscriptionSpec.messageType,
        queue_size: 1,
      })

      topic.subscribe((message) => {
        onMessage(subscriptionSpec, message as unknown as RosMessage)
      })

      this.subscriptions.push(topic)
    }

    this.logger.info('ROS topic subscriptions attached.', {
      subscriptionCount: this.subscriptions.length,
    })
  }

  unsubscribeAll(): void {
    for (const topic of this.subscriptions) {
      try {
        topic.unsubscribe()
      }
      catch {
        this.logger.debug('ROS topic already unsubscribed.')
      }
    }

    this.subscriptions = []
  }
}
