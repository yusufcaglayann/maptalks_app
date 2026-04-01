import { useEffect, useRef, useState } from 'react'
import * as maptalks from 'maptalks'

import { useGcsTelemetry } from './hooks/useGcsTelemetry.js'
import {
  getSystemLabel,
  hasSystemPosition,
  isLeaderSystem,
} from './lib/gcsTelemetry.js'
import './App.css'

const TILE_SOURCE = {
  initialZoom: 14,
  metadataUrl: '/api/mbtiles/metadata',
}

const EXTRA_ZOOM_OUT_STEPS = 4
const EXTRA_ZOOM_IN_STEPS = 2
const MAX_MARKER_LIFT_PX = 160
const METERS_PER_MARKER_LIFT_PX = 20
const SYSTEM_FOCUS_ZOOM = 16

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function formatCoordinate(value) {
  if (!isFiniteNumber(value)) {
    return 'Bekleniyor'
  }

  return value.toFixed(6)
}

function formatMetric(value, unit, digits = 1) {
  if (!isFiniteNumber(value)) {
    return 'Bekleniyor'
  }

  return `${value.toFixed(digits)} ${unit}`
}

function formatAltitudeBadge(value) {
  if (!isFiniteNumber(value)) {
    return 'ALT --'
  }

  return `ALT ${Math.round(value)} m`
}

function getAltitudeLiftPx(value) {
  if (!isFiniteNumber(value)) {
    return 0
  }

  const altitude = Math.max(0, value)
  if (altitude <= 0) {
    return 0
  }

  return Math.min(
    MAX_MARKER_LIFT_PX,
    Math.max(12, Math.round(altitude / METERS_PER_MARKER_LIFT_PX)),
  )
}

function formatStatus(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return 'Bekleniyor'
  }

  return value.replaceAll('_', ' ')
}

function getConnectionTone(state) {
  switch (state) {
    case 'connected':
      return 'success'
    case 'checking':
    case 'connecting':
      return 'warning'
    case 'unavailable':
    case 'disconnected':
    case 'error':
      return 'danger'
    default:
      return 'neutral'
  }
}

function getSystemPalette(systemId) {
  if (isLeaderSystem(systemId)) {
    return {
      fill: '#ff8a3d',
      stroke: '#6d2e07',
      chip: '#fff3e7',
      text: '#6d2e07',
    }
  }

  return {
    fill: '#2b95ff',
    stroke: '#0e3d73',
    chip: '#eff7ff',
    text: '#0e3d73',
  }
}

function createAircraftSvg() {
  return `
    <svg class="aircraft-marker__svg" viewBox="0 0 64 64" aria-hidden="true">
      <path
        class="aircraft-marker__body"
        d="M29 4h6l5 18 16 7v5l-16 3 4 19-4 4-8-16-8 16-4-4 4-19-16-3v-5l16-7z"
      />
      <path
        class="aircraft-marker__accent"
        d="M31 8h2l3 12 10 4v2l-10 2 2 9-1 1-5-8-5 8-1-1 2-9-10-2v-2l10-4z"
      />
    </svg>
  `
}

function createMarkerContent() {
  const root = document.createElement('div')
  root.className = 'aircraft-marker'
  root.innerHTML = `
    <div class="aircraft-marker__flight-stack" data-role="flight-stack">
      <div class="aircraft-marker__altitude" data-role="altitude"></div>
      <div class="aircraft-marker__icon-shell" data-role="icon-shell">
        ${createAircraftSvg()}
      </div>
    </div>
    <div class="aircraft-marker__ground-track">
      <div class="aircraft-marker__stem" data-role="stem"></div>
      <div class="aircraft-marker__shadow"></div>
    </div>
  `

  return {
    root,
    altitudeElement: root.querySelector('[data-role="altitude"]'),
    flightStackElement: root.querySelector('[data-role="flight-stack"]'),
    iconShellElement: root.querySelector('[data-role="icon-shell"]'),
    stemElement: root.querySelector('[data-role="stem"]'),
  }
}

function updateMarkerContent(entry, systemState) {
  const telemetry = systemState.telemetry ?? {}
  const palette = getSystemPalette(systemState.systemId)
  const yaw = isFiniteNumber(telemetry.yaw) ? telemetry.yaw : 0
  const liftPx = getAltitudeLiftPx(telemetry.altitude)

  entry.root.style.setProperty('--aircraft-fill', palette.fill)
  entry.root.style.setProperty('--aircraft-stroke', palette.stroke)
  entry.root.style.setProperty('--aircraft-chip', palette.chip)
  entry.root.style.setProperty('--aircraft-text', palette.text)
  entry.root.style.setProperty('--aircraft-yaw', `${yaw}deg`)
  entry.root.style.setProperty('--aircraft-lift', `${liftPx}px`)

  if (entry.altitudeElement) {
    entry.altitudeElement.textContent = formatAltitudeBadge(telemetry.altitude)
  }

  if (entry.stemElement) {
    entry.stemElement.hidden = liftPx <= 0
  }
}

function createMarkerEntry(map, systemState, coordinate) {
  const content = createMarkerContent()
  updateMarkerContent(content, systemState)

  const marker = new maptalks.ui.UIMarker(coordinate, {
    content: content.root,
  }).addTo(map)

  return {
    ...content,
    marker,
  }
}

function updateMarkerEntry(entry, systemState, coordinate) {
  updateMarkerContent(entry, systemState)
  entry.marker.setCoordinates(coordinate)
}

function synchronizeTelemetryMarkers({
  map,
  systems,
  markerBySystemId,
  onLeaderDetected,
}) {
  const activeIds = new Set()

  for (const systemState of systems) {
    if (!hasSystemPosition(systemState)) {
      continue
    }

    activeIds.add(systemState.systemId)

    const coordinate = [
      systemState.telemetry.longitude,
      systemState.telemetry.latitude,
    ]

    const existingEntry = markerBySystemId.get(systemState.systemId)
    if (!existingEntry) {
      markerBySystemId.set(
        systemState.systemId,
        createMarkerEntry(map, systemState, coordinate),
      )
    } else {
      updateMarkerEntry(existingEntry, systemState, coordinate)
    }

    if (isLeaderSystem(systemState.systemId)) {
      onLeaderDetected?.(coordinate)
    }
  }

  for (const [systemId, entry] of markerBySystemId.entries()) {
    if (!activeIds.has(systemId)) {
      entry.marker.remove()
      markerBySystemId.delete(systemId)
    }
  }
}

function StatusChip({ label, value, tone }) {
  return (
    <div className={`status-chip status-chip--${tone}`}>
      <span className="status-chip__label">{label}</span>
      <strong className="status-chip__value">{formatStatus(value)}</strong>
    </div>
  )
}

function SystemListItem({ isActive, systemState, onClick }) {
  const telemetry = systemState.telemetry ?? {}
  const palette = getSystemPalette(systemState.systemId)

  return (
    <button
      type="button"
      className={`system-item ${isActive ? 'system-item--active' : ''}`}
      style={{
        '--system-accent': palette.fill,
      }}
      onClick={onClick}
    >
      <div className="system-item__title-row">
        <span className="system-item__name">{getSystemLabel(systemState.systemId)}</span>
        <span className="system-item__altitude">
          {formatAltitudeBadge(telemetry.altitude)}
        </span>
      </div>
      <div className="system-item__meta-row">
        <span>{formatStatus(telemetry.mode)}</span>
        <span>{formatMetric(telemetry.groundSpeed, 'm/s')}</span>
      </div>
    </button>
  )
}

function App() {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerBySystemIdRef = useRef(new Map())
  const systemsRef = useRef([])
  const hasAutoCenteredRef = useRef(false)

  const [metadata, setMetadata] = useState(null)
  const [metadataError, setMetadataError] = useState('')
  const [selectedSystemId, setSelectedSystemId] = useState(null)

  const {
    backendUrl,
    error: telemetryError,
    gatewayState,
    rosConnectionState,
    systems,
  } = useGcsTelemetry()

  systemsRef.current = systems

  const selectedSystem = systems.find((item) => item.systemId === selectedSystemId)
    ?? systems.find((item) => isLeaderSystem(item.systemId))
    ?? systems[0]
    ?? null

  useEffect(() => {
    if (!selectedSystemId && systems.length > 0) {
      const nextSystem = systems.find((item) => isLeaderSystem(item.systemId)) ?? systems[0]
      setSelectedSystemId(nextSystem.systemId)
      return
    }

    if (selectedSystemId && !systems.some((item) => item.systemId === selectedSystemId)) {
      const nextSystem = systems.find((item) => isLeaderSystem(item.systemId)) ?? systems[0] ?? null
      setSelectedSystemId(nextSystem?.systemId ?? null)
    }
  }, [selectedSystemId, systems])

  useEffect(() => {
    let isCancelled = false

    async function loadMetadata() {
      try {
        const response = await fetch(TILE_SOURCE.metadataUrl)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const data = await response.json()
        if (!isCancelled) {
          setMetadata(data)
          setMetadataError('')
        }
      } catch (loadError) {
        if (!isCancelled) {
          setMetadataError(
            loadError instanceof Error
              ? loadError.message
              : 'MBTiles metadata okunamadi.',
          )
        }
      }
    }

    loadMetadata()

    return () => {
      isCancelled = true
    }
  }, [])

  useEffect(() => {
    if (!metadata || !mapRef.current || mapInstanceRef.current) {
      return undefined
    }

    const minZoom = Math.max(0, metadata.minZoom - EXTRA_ZOOM_OUT_STEPS)
    const maxZoom = metadata.maxZoom + EXTRA_ZOOM_IN_STEPS
    const initialZoom = Math.min(
      maxZoom,
      Math.max(minZoom, TILE_SOURCE.initialZoom),
    )

    const map = new maptalks.Map(mapRef.current, {
      center: metadata.center,
      zoom: initialZoom,
      minZoom,
      maxZoom,
      baseLayer: new maptalks.TileLayer('base', {
        urlTemplate: metadata.tileUrlTemplate,
        tileSize: [256, 256],
        maxAvailableZoom: metadata.maxZoom,
        repeatWorld: false,
        attribution:
          metadata.attribution
          || 'Tiles are streamed from kesan.mbtiles via the Vite runtime.',
      }),
    })

    const markerBySystemId = markerBySystemIdRef.current
    mapInstanceRef.current = map

    synchronizeTelemetryMarkers({
      map,
      systems: systemsRef.current,
      markerBySystemId,
      onLeaderDetected: (coordinate) => {
        if (!hasAutoCenteredRef.current) {
          map.setCenter(coordinate)
          hasAutoCenteredRef.current = true
        }
      },
    })

    return () => {
      for (const entry of markerBySystemId.values()) {
        entry.marker.remove()
      }

      markerBySystemId.clear()
      map.remove()
      mapInstanceRef.current = null
      hasAutoCenteredRef.current = false
    }
  }, [metadata])

  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map) {
      return
    }

    synchronizeTelemetryMarkers({
      map,
      systems,
      markerBySystemId: markerBySystemIdRef.current,
      onLeaderDetected: (coordinate) => {
        if (!hasAutoCenteredRef.current) {
          map.setCenter(coordinate)
          hasAutoCenteredRef.current = true
        }
      },
    })
  }, [systems])

  function focusSystem(systemState) {
    setSelectedSystemId(systemState.systemId)

    const map = mapInstanceRef.current
    if (!map || !hasSystemPosition(systemState)) {
      return
    }

    const coordinate = [
      systemState.telemetry.longitude,
      systemState.telemetry.latitude,
    ]
    const targetZoom = Math.min(
      map.getMaxZoom(),
      Math.max(map.getZoom(), SYSTEM_FOCUS_ZOOM),
    )

    map.animateTo(
      {
        center: coordinate,
        zoom: targetZoom,
      },
      {
        duration: 380,
      },
    )
  }

  const selectedTelemetry = selectedSystem?.telemetry ?? {}

  return (
    <div className="app">
      <div ref={mapRef} className="app__map" />

      <div className="app__overlay">
        <header className="topbar panel">
          <div className="topbar__title-block">
            <p className="topbar__eyebrow">Ground Control Station</p>
            <h1>Canli Telemetri Haritasi</h1>
            <p className="topbar__subtitle">
              ROS Bridge verileri backend uzerinden dinleniyor ve SVG ucak ikonlari
              ile harita ustunde gosteriliyor. Zoom araligi daha fazla geri
              cekilebilecek ve ucaklara daha yakin girilebilecek sekilde genisletildi.
            </p>
          </div>

          <div className="topbar__status-grid">
            <StatusChip
              label="Gateway"
              value={gatewayState}
              tone={getConnectionTone(gatewayState)}
            />
            <StatusChip
              label="ROS"
              value={rosConnectionState}
              tone={getConnectionTone(rosConnectionState)}
            />
            <StatusChip
              label="Aktif Sistem"
              value={`${systems.length}`}
              tone="neutral"
            />
          </div>

          {metadataError ? (
            <p className="panel__notice panel__notice--danger">
              Harita metadata hatasi: {metadataError}
            </p>
          ) : null}

          {telemetryError ? (
            <p className="panel__notice panel__notice--warning">
              Telemetri durumu: {telemetryError}
            </p>
          ) : null}
        </header>

        <section className="detail-panel panel">
          <div className="detail-panel__header">
            <div>
              <p className="detail-panel__eyebrow">
                {selectedSystem ? getSystemLabel(selectedSystem.systemId) : 'Secili platform yok'}
              </p>
              <h2>{selectedSystem ? `System ID ${selectedSystem.systemId}` : 'Telemetri bekleniyor'}</h2>
            </div>

            {selectedSystem ? (
              <button
                type="button"
                className="ghost-button"
                onClick={() => focusSystem(selectedSystem)}
              >
                Haritada Ortala
              </button>
            ) : null}
          </div>

          {selectedSystem ? (
            <dl className="detail-grid">
              <div>
                <dt>Latitude</dt>
                <dd>{formatCoordinate(selectedTelemetry.latitude)}</dd>
              </div>
              <div>
                <dt>Longitude</dt>
                <dd>{formatCoordinate(selectedTelemetry.longitude)}</dd>
              </div>
              <div>
                <dt>Irtifa</dt>
                <dd>{formatMetric(selectedTelemetry.altitude, 'm')}</dd>
              </div>
              <div>
                <dt>Ground Speed</dt>
                <dd>{formatMetric(selectedTelemetry.groundSpeed, 'm/s')}</dd>
              </div>
              <div>
                <dt>Air Speed</dt>
                <dd>{formatMetric(selectedTelemetry.airSpeed, 'm/s')}</dd>
              </div>
              <div>
                <dt>Mod</dt>
                <dd>{formatStatus(selectedTelemetry.mode)}</dd>
              </div>
              <div>
                <dt>Yaw</dt>
                <dd>{formatMetric(selectedTelemetry.yaw, 'deg')}</dd>
              </div>
              <div>
                <dt>GPS</dt>
                <dd>{formatStatus(selectedTelemetry.gpsStatus)}</dd>
              </div>
            </dl>
          ) : (
            <p className="detail-panel__empty">
              Backend baglandiginda leader ve follower ucaklar haritada gorunecek.
            </p>
          )}
        </section>

        <aside className="fleet-panel panel">
          <div className="fleet-panel__header">
            <div>
              <p className="fleet-panel__eyebrow">Takip Edilen Platformlar</p>
              <h2>Ucaklar</h2>
            </div>
            <span className="fleet-panel__count">{systems.length}</span>
          </div>

          <div className="fleet-panel__list">
            {systems.length > 0 ? (
              systems.map((systemState) => (
                <SystemListItem
                  key={systemState.systemId}
                  isActive={systemState.systemId === selectedSystem?.systemId}
                  systemState={systemState}
                  onClick={() => focusSystem(systemState)}
                />
              ))
            ) : (
              <p className="fleet-panel__empty">
                Telemetri geldikce platformlar burada listelenecek.
              </p>
            )}
          </div>

          <div className="fleet-panel__footer">
            <span>Backend: {backendUrl}</span>
            <span>Zoom araligi genisletildi</span>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default App
