// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './api.js'
import { _setLangState } from './i18n-core.js'

describe('api()', () => {
  it('a failed request throws with the status and the parsed body attached', async () => {
    const { api } = await import('./api.js')
    const original = globalThis.fetch
    globalThis.fetch = async () => ({ ok: false, status: 409, json: async () => ({ error: 'conflict', rev: 3, state: { _rev: 3 } }) })
    try {
      await expect(api('/api/data', { method: 'PUT', body: '{}' })).rejects.toMatchObject({
        message: 'conflict', status: 409, data: { error: 'conflict', rev: 3, state: { _rev: 3 } }
      })
    } finally { globalThis.fetch = original }
  })
})

// Every API route answers JSON. A 2xx that is not JSON is somebody else answering — Capacitor's
// local server on a phone without a pairing, an auth proxy's login page, a proxy that sends /api/*
// to index.html — and must never read as a server that took the change.
describe('api() refuses an answer that is not the server\'s', () => {
  const html = () => new Response('<!doctype html><title>Sign in</title>', { status: 200, headers: { 'content-type': 'text/html' } })
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it('a 200 page of HTML is an error with the status it came with', async () => {
    const { api } = await import('./api.js')
    vi.stubGlobal('fetch', async () => html())
    await expect(api('/api/data', { method: 'PUT', body: '{}' })).rejects.toMatchObject({ code: 'bad-response', status: 200 })
    await expect(api('/api/me')).rejects.toMatchObject({ code: 'bad-response', status: 200 })
  })

  it('a JSON answer still comes back as it is', async () => {
    const { api } = await import('./api.js')
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ok: true, rev: 4 }), { status: 200, headers: { 'content-type': 'application/json' } }))
    await expect(api('/api/data', { method: 'PUT', body: '{}' })).resolves.toEqual({ ok: true, rev: 4 })
  })

  it('a refused request whose body is not JSON keeps its HTTP status', async () => {
    const { api } = await import('./api.js')
    vi.stubGlobal('fetch', async () => new Response('<html>Bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }))
    await expect(api('/api/data')).rejects.toMatchObject({ status: 502, message: 'HTTP 502', data: {} })
  })

  it('pairing with something that is not an Open Gym Oran server fails instead of saving an empty pairing', async () => {
    const { pairRedeem } = await import('./api.js')
    vi.stubGlobal('fetch', async () => html())
    await expect(pairRedeem('https://gym.example.com', 'ABCD2345')).rejects.toMatchObject({ code: 'bad-response' })
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }))
    await expect(pairRedeem('https://gym.example.com', 'ABCD2345')).rejects.toMatchObject({ code: 'bad-response' })
  })
})

// A request that never answers used to hold every later push and pull behind it, silently, for
// as long as the socket hung. It gives up instead — with no status, so it reads as offline.
describe('api() gives up on a request that never answers', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })
  const hang = () => {
    const seen = []
    vi.stubGlobal('fetch', vi.fn((url, init) => { seen.push(init.signal); return new Promise(() => {}) }))
    return seen
  }

  it('a GET after 20 s, and the request itself is aborted', async () => {
    vi.useFakeTimers()
    const { api } = await import('./api.js')
    const signals = hang()
    const p = api('/api/data/rev')
    const done = vi.fn()
    p.catch(done)
    await vi.advanceTimersByTimeAsync(19000)
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1500)
    await expect(p).rejects.toMatchObject({ code: 'timeout', status: undefined })
    expect(signals[0].aborted).toBe(true)
  })

  it('a PUT after 60 s, since it carries the whole profile', async () => {
    vi.useFakeTimers()
    const { api } = await import('./api.js')
    hang()
    const p = api('/api/data', { method: 'PUT', body: '{}' })
    const done = vi.fn()
    p.catch(done)
    await vi.advanceTimersByTimeAsync(30000)
    expect(done).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(31000)
    await expect(p).rejects.toMatchObject({ code: 'timeout' })
  })

  it('a caller that knows its request is slow sets its own limit, and the option is not sent along', async () => {
    vi.useFakeTimers()
    const { api } = await import('./api.js')
    hang()
    const p = api('/api/admin/coach/test', { method: 'POST', body: '{}', timeout: 150000 })
    const done = vi.fn()
    p.catch(done)
    await vi.advanceTimersByTimeAsync(120000)
    expect(done).not.toHaveBeenCalled()
    expect('timeout' in fetch.mock.calls[0][1]).toBe(false)
    await vi.advanceTimersByTimeAsync(31000)
    await expect(p).rejects.toMatchObject({ code: 'timeout' })
  })
})

// Self-hosting (Discord tcmac 10-21): an api service whose ORIGIN is not the address in the
// browser refuses every write, and the app used to show "cross-origin request refused".
describe('a write refused for the wrong address', () => {
  const KEY = 'This server only takes changes made at {0}. If you opened openGym at another address, set ORIGIN to match it.'
  afterEach(() => { _setLangState('en', {}, null, null); vi.unstubAllGlobals() })
  const answer = (status, body) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })))
  it('says which address the server expects, in the UI language', async () => {
    _setLangState('de', { [KEY]: 'Dieser Server akzeptiert nur Änderungen von {0}.' }, null, null)
    answer(403, { error: 'cross-origin request refused', code: 'origin-mismatch', expected: 'http://localhost:8080' })
    const e = await api('/api/data', { method: 'PUT', body: '{}' }).catch(x => x)
    expect(e.status).toBe(403)
    expect(e.message).toBe('Dieser Server akzeptiert nur Änderungen von http://localhost:8080.')
  })
  it('any other refusal keeps the server\'s words', async () => {
    answer(403, { error: 'forbidden' })
    expect((await api('/api/data', { method: 'PUT', body: '{}' }).catch(x => x)).message).toBe('forbidden')
  })
})
