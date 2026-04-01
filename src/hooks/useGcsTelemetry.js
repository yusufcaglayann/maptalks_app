import { startTransition, useEffect, useState } from 'react'
import { io } from 'socket.io-client'

import {
  applyTelemetryBatch,
  applyTelemetrySnapshot,
  resolveGcsBackendUrl,
  TELEMETRY_SOCKET_EVENTS,
} from '../lib/gcsTelemetry.js'

const GCS_BACKEND_URL = resolveGcsBackendUrl()
const HEALTHCHECK_URL = `${GCS_BACKEND_URL}/api/gcs/health`
const HEALTHCHECK_INTERVAL_MS = 3000

async function checkBackendHealth(signal) {
  const response = await fetch(HEALTHCHECK_URL, {
    method: 'GET',
    signal,
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return response.json()
}

export function useGcsTelemetry() {
  const [gatewayState, setGatewayState] = useState('checking')
  const [rosConnectionState, setRosConnectionState] = useState('idle')
  const [systems, setSystems] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let socket = null
    let isDisposed = false
    let retryTimer = null
    let healthcheckController = null

    const clearRetryTimer = () => {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
        retryTimer = null
      }
    }

    const disconnectSocket = () => {
      if (!socket) {
        return
      }

      socket.close()
      socket = null
    }

    const handleDisconnect = (reason) => {
      if (isDisposed) {
        return
      }

      setGatewayState('disconnected')
      disconnectSocket()

      if (reason !== 'io client disconnect' && reason !== 'forced close') {
        setError('GCS backend baglantisi kesildi. Sunucu yeniden kontrol ediliyor.')
        scheduleReconnect()
      }
    }

    const handleConnectError = (socketError) => {
      if (isDisposed) {
        return
      }

      setGatewayState('error')
      setError(
        socketError instanceof Error
          ? socketError.message
          : 'GCS backend socket baglantisi kurulamadi.',
      )
      disconnectSocket()
      scheduleReconnect()
    }

    const handleRosConnectionState = (payload) => {
      setRosConnectionState(payload.state)
    }

    const handleSnapshot = (payload) => {
      startTransition(() => {
        setSystems(applyTelemetrySnapshot(payload))
      })
    }

    const handleBatch = (payload) => {
      startTransition(() => {
        setSystems((previousSystems) => applyTelemetryBatch(previousSystems, payload))
      })
    }

    const connectSocket = () => {
      if (isDisposed || socket) {
        return
      }

      socket = io(GCS_BACKEND_URL, {
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1500,
        timeout: 2500,
        transports: ['polling', 'websocket'],
      })

      socket.on('connect', () => {
        setGatewayState('connected')
        setError('')
      })
      socket.on('disconnect', handleDisconnect)
      socket.on('connect_error', handleConnectError)
      socket.on(TELEMETRY_SOCKET_EVENTS.connectionState, handleRosConnectionState)
      socket.on(TELEMETRY_SOCKET_EVENTS.snapshot, handleSnapshot)
      socket.on(TELEMETRY_SOCKET_EVENTS.batch, handleBatch)
    }

    const scheduleReconnect = () => {
      if (isDisposed || retryTimer !== null) {
        return
      }

      retryTimer = window.setTimeout(() => {
        retryTimer = null
        void connectWhenBackendIsReady()
      }, HEALTHCHECK_INTERVAL_MS)
    }

    const connectWhenBackendIsReady = async () => {
      clearRetryTimer()
      disconnectSocket()

      if (isDisposed) {
        return
      }

      setGatewayState('checking')
      healthcheckController?.abort()
      healthcheckController = new AbortController()

      try {
        const health = await checkBackendHealth(healthcheckController.signal)

        if (isDisposed) {
          return
        }

        setRosConnectionState(health.rosConnectionState ?? 'idle')
        setGatewayState('connecting')
        setError('')
        connectSocket()
      } catch (healthError) {
        if (isDisposed) {
          return
        }

        setGatewayState('unavailable')
        setError(
          healthError instanceof Error
            ? `GCS backend su anda erisilemiyor (${HEALTHCHECK_URL}). Once npm run server:dev ile backend'i baslatin.`
            : 'GCS backend su anda erisilemiyor.',
        )
        scheduleReconnect()
      }
    }

    void connectWhenBackendIsReady()

    return () => {
      isDisposed = true
      clearRetryTimer()
      healthcheckController?.abort()
      disconnectSocket()
    }
  }, [])

  return {
    backendUrl: GCS_BACKEND_URL,
    error,
    gatewayState,
    rosConnectionState,
    systems,
  }
}
