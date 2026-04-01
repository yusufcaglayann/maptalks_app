import { EventEmitter } from 'node:events'

import ROSLIB from 'roslib'

import type { Logger } from '../../../../shared/logging/Logger.js'
import type { RosConnectionState } from '../../domain/types/RosConnectionState.js'

interface RosConnectionManagerOptions {
  url: string
  reconnectIntervalMs: number
  logger: Logger
}

type ConnectionListener = (ros: ROSLIB.Ros) => void
type StateListener = (state: RosConnectionState) => void
type VoidListener = () => void

export class RosConnectionManager {
  private readonly emitter = new EventEmitter()
  private ros: ROSLIB.Ros | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private isStopped = true
  private connectionState: RosConnectionState = 'idle'
  private readonly logger: Logger

  constructor(private readonly options: RosConnectionManagerOptions) {
    this.logger = options.logger.child('RosConnectionManager')
  }

  onConnected(listener: ConnectionListener): () => void {
    this.emitter.on('connected', listener)
    return () => this.emitter.off('connected', listener)
  }

  onDisconnected(listener: VoidListener): () => void {
    this.emitter.on('disconnected', listener)
    return () => this.emitter.off('disconnected', listener)
  }

  onStateChange(listener: StateListener): () => void {
    this.emitter.on('state', listener)
    return () => this.emitter.off('state', listener)
  }

  start(): void {
    if (!this.isStopped) {
      return
    }

    this.isStopped = false
    this.connect()
  }

  stop(): void {
    if (this.isStopped) {
      return
    }

    this.isStopped = true
    this.clearReconnectTimer()
    this.teardownRos()
    this.setConnectionState('disconnected')
    this.emitter.emit('disconnected')
  }

  getState(): RosConnectionState {
    return this.connectionState
  }

  private readonly handleRosConnection = (): void => {
    if (this.isStopped || !this.ros) {
      return
    }

    this.logger.info('Connected to ROS Bridge.', { url: this.options.url })
    this.setConnectionState('connected')
    this.emitter.emit('connected', this.ros)
  }

  private readonly handleRosClose = (): void => {
    if (this.isStopped) {
      return
    }

    this.logger.warn('ROS Bridge connection closed.')
    this.setConnectionState('disconnected')
    this.emitter.emit('disconnected')
    this.scheduleReconnect()
  }

  private readonly handleRosError = (error: unknown): void => {
    if (this.isStopped) {
      return
    }

    this.logger.error('ROS Bridge connection error.', {
      error: error instanceof Error ? error.message : String(error),
    })
    this.setConnectionState('error')
    this.emitter.emit('disconnected')
    this.scheduleReconnect()
  }

  private connect(): void {
    if (this.isStopped) {
      return
    }

    this.clearReconnectTimer()
    this.teardownRos()
    this.setConnectionState('connecting')

    const ros = new ROSLIB.Ros({ url: this.options.url })
    this.ros = ros

    ros.on('connection', this.handleRosConnection)
    ros.on('close', this.handleRosClose)
    ros.on('error', this.handleRosError)
  }

  private scheduleReconnect(): void {
    if (this.isStopped || this.reconnectTimer !== null) {
      return
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.options.reconnectIntervalMs)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer === null) {
      return
    }

    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private teardownRos(): void {
    const ros = this.ros

    if (!ros) {
      return
    }

    const rosWithOptionalMethods = ros as ROSLIB.Ros & {
      off?: (event: string, listener: (...args: unknown[]) => void) => void
      removeAllListeners?: (event?: string) => void
    }

    if (typeof rosWithOptionalMethods.off === 'function') {
      rosWithOptionalMethods.off('connection', this.handleRosConnection)
      rosWithOptionalMethods.off('close', this.handleRosClose)
      rosWithOptionalMethods.off('error', this.handleRosError)
    }
    else if (typeof rosWithOptionalMethods.removeAllListeners === 'function') {
      rosWithOptionalMethods.removeAllListeners('connection')
      rosWithOptionalMethods.removeAllListeners('close')
      rosWithOptionalMethods.removeAllListeners('error')
    }

    try {
      ros.close()
    }
    catch {
      this.logger.debug('ROS Bridge close skipped because transport was already closed.')
    }

    this.ros = null
  }

  private setConnectionState(nextState: RosConnectionState): void {
    if (this.connectionState === nextState) {
      return
    }

    this.connectionState = nextState
    this.emitter.emit('state', nextState)
  }
}
