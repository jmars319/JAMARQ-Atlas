import { describe, expect, it } from 'vitest'
import {
  buildStaticConnectionCards,
  containsSecretShapedSettingsFields,
  emptySettingsState,
  normalizeSettingsState,
  updateSettings,
} from '../src/services/settings'

const now = new Date('2026-05-10T12:00:00Z')

describe('settings', () => {
  it('normalizes missing settings into local defaults', () => {
    const settings = normalizeSettingsState(null, now)

    expect(settings.schemaVersion).toBe(1)
    expect(settings.deviceLabel).toBe('Local Atlas workspace')
    expect(settings.deviceId).toMatch(/^atlas-local-/)
    expect(settings.updatedAt).toBe(now.toISOString())
  })

  it('preserves user-editable labels and notes', () => {
    const settings = normalizeSettingsState(
      {
        schemaVersion: 1,
        deviceId: 'atlas-local-test',
        deviceLabel: 'JAMARQ desktop',
        operatorLabel: 'Jason',
        notes: 'Primary local install.',
        updatedAt: '2026-05-09T10:00:00Z',
      },
      now,
    )

    expect(settings.deviceId).toBe('atlas-local-test')
    expect(settings.deviceLabel).toBe('JAMARQ desktop')
    expect(settings.operatorLabel).toBe('Jason')
    expect(settings.notes).toBe('Primary local install.')
    expect(settings.updatedAt).toBe('2026-05-09T10:00:00Z')
  })

  it('updates labels without changing the device id', () => {
    const settings = emptySettingsState(now)
    const updated = updateSettings(
      settings,
      { deviceLabel: 'Atlas laptop', operatorLabel: 'Operator' },
      new Date('2026-05-10T13:00:00Z'),
    )

    expect(updated.deviceId).toBe(settings.deviceId)
    expect(updated.deviceLabel).toBe('Atlas laptop')
    expect(updated.operatorLabel).toBe('Operator')
    expect(updated.updatedAt).toBe('2026-05-10T13:00:00.000Z')
  })

  it('does not define credential-shaped persisted settings fields', () => {
    const serialized = JSON.stringify(emptySettingsState(now))

    expect(serialized).not.toMatch(/token|secret|password|credential|apiKey|privateKey/i)
    expect(containsSecretShapedSettingsFields(emptySettingsState(now))).toBe(false)
    expect(containsSecretShapedSettingsFields({ githubToken: 'nope' })).toBe(true)
  })

  it('builds scoped static connection readiness cards', () => {
    const cards = buildStaticConnectionCards()

    expect(cards.map((card) => card.id)).toEqual(['dispatch', 'writing', 'data'])
    expect(cards.find((card) => card.id === 'writing')?.status).toBe('stub')
  })
})
