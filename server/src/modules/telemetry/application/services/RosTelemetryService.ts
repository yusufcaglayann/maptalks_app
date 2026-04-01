import type { Logger } from '../../../../shared/logging/Logger.js'
import { hasAnyPatchValue } from '../../domain/dto/RosTelemetryPatch.js'
import type { TelemetryPublisher } from '../../domain/ports/TelemetryPublisher.js'
import type { RosConnectionState } from '../../domain/types/RosConnectionState.js'
import type { RosMessage, TopicSubscriptionSpec } from '../../domain/types/RosTopic.js'
import { RosConnectionManager } from '../../infrastructure/ros/RosConnectionManager.js'
import { RosTelemetryParser } from '../../infrastructure/ros/RosTelemetryParser.js'
import { RosTelemetrySanitizer } from '../../infrastructure/ros/RosTelemetrySanitizer.js'
import { RosTopicSubscriber } from '../../infrastructure/ros/RosTopicSubscriber.js'
import { RosTopicSubscriptionFactory } from '../../infrastructure/ros/RosTopicSubscriptionFactory.js'
import { TelemetryStreamService } from './TelemetryStreamService.js'

interface RosTelemetryServiceDependencies {
  connectionManager: RosConnectionManager
  subscriptionFactory: RosTopicSubscriptionFactory
  topicSubscriber: RosTopicSubscriber
  parser: RosTelemetryParser
  sanitizer: RosTelemetrySanitizer
  telemetryStreamService: TelemetryStreamService
  publisher: TelemetryPublisher
  logger: Logger
}

export class RosTelemetryService {
  private readonly logger: Logger
  private isStarted = false

  constructor(private readonly dependencies: RosTelemetryServiceDependencies) {
    this.logger = dependencies.logger.child('RosTelemetryService')

    this.dependencies.connectionManager.onConnected((ros) => {
      const subscriptions = this.dependencies.subscriptionFactory.build()
      this.dependencies.topicSubscriber.subscribeAll(ros, subscriptions, this.handleIncomingMessage)
    })

    this.dependencies.connectionManager.onDisconnected(() => {
      this.dependencies.topicSubscriber.unsubscribeAll()
    })

    this.dependencies.connectionManager.onStateChange((state) => {
      this.dependencies.publisher.publishConnectionState(state)
    })
  }

  start(): void {
    if (this.isStarted) {
      return
    }

    this.isStarted = true
    this.dependencies.sanitizer.reset()
    this.dependencies.telemetryStreamService.start()
    this.dependencies.publisher.publishConnectionState(this.getConnectionState())
    this.dependencies.connectionManager.start()
  }

  stop(): void {
    if (!this.isStarted) {
      return
    }

    this.isStarted = false
    this.dependencies.connectionManager.stop()
    this.dependencies.topicSubscriber.unsubscribeAll()
    this.dependencies.sanitizer.reset()
    this.dependencies.telemetryStreamService.stop()
  }

  getConnectionState(): RosConnectionState {
    return this.dependencies.connectionManager.getState()
  }

  private readonly handleIncomingMessage = (
    subscription: TopicSubscriptionSpec,
    message: RosMessage,
  ): void => {
    const parsedMessage = this.dependencies.parser.parse(subscription.topicKey, message)

    if (
      this.dependencies.sanitizer.isStaleMessage(
        subscription.staleKey,
        parsedMessage.messageTimestampMs,
      )
    ) {
      return
    }

    const sanitizedPatch = this.dependencies.sanitizer.sanitize(
      subscription.systemId,
      parsedMessage.patch,
      Date.now(),
      parsedMessage.attitudeRates,
    )

    if (!hasAnyPatchValue(sanitizedPatch)) {
      return
    }

    this.dependencies.telemetryStreamService.ingestPatch(subscription.systemId, sanitizedPatch)
  }
}
