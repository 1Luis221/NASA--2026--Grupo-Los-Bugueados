import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from '@astronaut-wellness/ui'
import { createGroundApi } from '../src/api/ground-api.js'

function setup() {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ data: [], count: 0 }), { status: 200 }))
  return { fetchImpl, api: createGroundApi(createApiClient({ baseUrl: '/api', fetchImpl })) }
}

describe('Ground API · endpoints consumidos', () => {
  it.each([
    ['listCrew', [], '/api/crew'],
    ['getCrewMember', ['abc'], '/api/crew/abc'],
    ['listVitals', [{ crewMemberId: 'abc', limit: 20 }], '/api/vitals?crewMemberId=abc&limit=20'],
    ['listCheckIns', [{ crewMemberId: 'abc' }], '/api/check-ins?crewMemberId=abc'],
    ['listCameraMetrics', [{}], '/api/camera-metrics'],
    ['listAlerts', [{ status: 'active', severity: 'critical' }], '/api/alerts?status=active&severity=critical'],
    ['listSyncEvents', [{ limit: 5 }], '/api/sync/events?limit=5'],
    ['getSyncStats', [], '/api/sync/stats'],
  ])('%s → GET %s', async (method, args, url) => {
    const { api, fetchImpl } = setup()
    await expect(api[method](...args)).resolves.toEqual({ data: [], count: 0 })
    expect(fetchImpl).toHaveBeenCalledWith(url, expect.objectContaining({ method: 'GET' }))
  })

  it('es de solo lectura: no expone operaciones de escritura', () => {
    const { api } = setup()
    expect(Object.keys(api).every((name) => /^(list|get)/.test(name))).toBe(true)
  })
})
