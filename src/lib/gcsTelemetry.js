export const TELEMETRY_SOCKET_EVENTS = {
  batch: 'telemetry:batch',
  snapshot: 'telemetry:snapshot',
  connectionState: 'telemetry:connection-state',
}

function normalizeEnvUrl(rawUrl) {
  const candidate = `${rawUrl ?? ''}`.trim()
  return candidate.length > 0 ? candidate : null
}

export function resolveGcsBackendUrl() {
  const envUrl = normalizeEnvUrl(import.meta.env.VITE_GCS_BACKEND_URL)
  if (envUrl) {
    return envUrl
  }

  if (typeof window === 'undefined') {
    return 'http://127.0.0.1:4000'
  }

  const { protocol, hostname, port, origin } = window.location

  if (port === '4000') {
    return origin
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    return 'http://127.0.0.1:4000'
  }

  return `${protocol}//${hostname}:4000`
}

function sortSystems(systems) {
  return [...systems].sort((left, right) => left.systemId - right.systemId)
}

export function applyTelemetrySnapshot(payload) {
  return sortSystems(payload?.systems ?? [])
}

export function applyTelemetryBatch(previousSystems, payload) {
  const nextBySystemId = new Map(
    previousSystems.map((systemState) => [systemState.systemId, systemState]),
  )

  for (const incomingSystem of payload?.systems ?? []) {
    const previousState = nextBySystemId.get(incomingSystem.systemId)

    nextBySystemId.set(incomingSystem.systemId, {
      systemId: incomingSystem.systemId,
      telemetry: incomingSystem.snapshot ?? previousState?.telemetry ?? {},
      updatedAt: incomingSystem.updatedAt ?? previousState?.updatedAt ?? payload?.emittedAt,
    })
  }

  return sortSystems([...nextBySystemId.values()])
}

export function isLeaderSystem(systemId) {
  return systemId === 1
}

export function getSystemLabel(systemId) {
  return isLeaderSystem(systemId)
    ? 'Leader'
    : `Follower ${systemId.toString().padStart(2, '0')}`
}

export function hasSystemPosition(systemState) {
  const latitude = systemState?.telemetry?.latitude
  const longitude = systemState?.telemetry?.longitude

  return Number.isFinite(latitude) && Number.isFinite(longitude)
}
