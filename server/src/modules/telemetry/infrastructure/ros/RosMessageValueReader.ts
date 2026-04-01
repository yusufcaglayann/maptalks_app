import type { RosMessage } from '../../domain/types/RosTopic.js'

export interface QuaternionLike {
  x: number
  y: number
  z: number
  w: number
}

export interface NumberMatch {
  path: string
  value: number
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.trim())
    return Number.isFinite(parsed) ? parsed : undefined
  }

  return undefined
}

export function toInteger(value: number): number {
  return Math.round(value)
}

export function readPath(source: unknown, path: string): unknown {
  if (!isObject(source)) {
    return undefined
  }

  const parts = path.split('.')
  let current: unknown = source

  for (const part of parts) {
    if (!isObject(current)) {
      return undefined
    }

    current = current[part]
  }

  return current
}

export function pickNumber(message: unknown, paths: string[]): number | undefined {
  for (const path of paths) {
    const value = toFiniteNumber(readPath(message, path))
    if (typeof value !== 'undefined') {
      return value
    }
  }

  return undefined
}

export function pickNumberWithPath(message: unknown, paths: string[]): NumberMatch | null {
  for (const path of paths) {
    const value = toFiniteNumber(readPath(message, path))
    if (typeof value !== 'undefined') {
      return {
        path,
        value,
      }
    }
  }

  return null
}

export function pickAllNumbers(message: unknown, paths: string[]): number[] {
  const values: number[] = []

  for (const path of paths) {
    const value = toFiniteNumber(readPath(message, path))
    if (typeof value !== 'undefined') {
      values.push(value)
    }
  }

  return values
}

export function pickString(message: unknown, paths: string[]): string | undefined {
  for (const path of paths) {
    const value = readPath(message, path)

    if (typeof value === 'string') {
      const normalized = value.trim()
      if (normalized.length > 0) {
        return normalized
      }
    }
  }

  return undefined
}

export function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value !== 0
  }

  if (typeof value !== 'string') {
    return undefined
  }

  const normalized = value.trim().toLowerCase()

  if (normalized.length === 0) {
    return undefined
  }

  if (['1', 'true', 'armed', 'in_air', 'flying', 'yes', 'on'].includes(normalized)) {
    return true
  }

  if (['0', 'false', 'disarmed', 'landed', 'grounded', 'no', 'off'].includes(normalized)) {
    return false
  }

  return undefined
}

export function pickBoolean(message: unknown, paths: string[]): boolean | undefined {
  for (const path of paths) {
    const value = toBoolean(readPath(message, path))
    if (typeof value === 'boolean') {
      return value
    }
  }

  return undefined
}

export function extractMessageTimestampMs(message: RosMessage): number | undefined {
  const sec = pickNumber(message, [
    'header.stamp.sec',
    'header.stamp.secs',
    'stamp.sec',
    'stamp.secs',
  ])

  if (typeof sec === 'number') {
    const nanosec = pickNumber(message, [
      'header.stamp.nanosec',
      'header.stamp.nsec',
      'header.stamp.nsecs',
      'stamp.nanosec',
      'stamp.nsec',
      'stamp.nsecs',
    ]) ?? 0

    return (sec * 1000) + (nanosec / 1_000_000)
  }

  const timeUsec = pickNumber(message, ['time_usec', 'timestamp_usec'])
  if (typeof timeUsec === 'number') {
    return timeUsec / 1000
  }

  const timeMs = pickNumber(message, ['time_ms', 'timestamp_ms'])
  if (typeof timeMs === 'number') {
    return timeMs
  }

  return undefined
}

export function extractQuaternion(message: unknown): QuaternionLike | null {
  const candidates = [
    readPath(message, 'orientation'),
    readPath(message, 'imu.orientation'),
    readPath(message, 'pose.orientation'),
    readPath(message, 'pose.pose.orientation'),
    readPath(message, 'quaternion'),
  ]

  for (const candidate of candidates) {
    if (!isObject(candidate)) {
      continue
    }

    const x = toFiniteNumber(candidate.x)
    const y = toFiniteNumber(candidate.y)
    const z = toFiniteNumber(candidate.z)
    const w = toFiniteNumber(candidate.w)

    if (
      typeof x === 'undefined'
      || typeof y === 'undefined'
      || typeof z === 'undefined'
      || typeof w === 'undefined'
    ) {
      continue
    }

    return { x, y, z, w }
  }

  return null
}
