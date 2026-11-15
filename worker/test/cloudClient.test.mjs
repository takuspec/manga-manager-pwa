import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CloudError,
  RETRY_POLICY,
  SAFETY,
  createCloudClient,
  normalizeEndpoint
} from '../../src/utils/cloudClient.js'

function createStorage(initial = {}) {
  const data = new Map(
    Object.entries(initial)
  )

  return {
    getItem: (key) =>
      data.has(key) ? data.get(key) : null,
    setItem: (key, value) => {
      data.set(key, String(value))
    },
    removeItem: (key) => {
      data.delete(key)
    }
  }
}

function setup(responses) {
  const calls = []
  const sleeps = []
  let time = 1_000_000

  const client =
    createCloudClient({
      fetchImpl: async (url, init) => {
        calls.push({ url, init })

        const next =
          typeof responses === 'function'
            ? responses(calls.length)
            : responses.shift()

        if (next instanceof Error) {
          throw next
        }

        return next
      },
      sleep: async (ms) => {
        sleeps.push(ms)
        time += ms
      },
      now: () => time,
      random: () => 0.5,
      storage: createStorage()
    })

  client.saveConfig({
    endpoint: 'https://w.example.workers.dev/',
    token: ' secret '
  })

  return {
    client,
    calls,
    sleeps,
    advance: (ms) => {
      time += ms
    }
  }
}

const ok = (body = { ok: true }) =>
  new Response(JSON.stringify(body), {
    status: 200
  })

const status = (code, headers) =>
  new Response('{}', {
    status: code,
    headers
  })

test('接続先は https だけを受け付ける', () => {
  assert.equal(
    normalizeEndpoint(
      ' https://a.workers.dev/// '
    ),
    'https://a.workers.dev'
  )
  assert.equal(
    normalizeEndpoint('http://a.workers.dev'),
    ''
  )
  assert.equal(
    normalizeEndpoint('http://localhost:8787'),
    'http://localhost:8787'
  )
  assert.equal(normalizeEndpoint('abc'), '')
})

test('合言葉を付けて送る', async () => {
  const { client, calls } = setup([ok()])

  await client.testConnection()

  assert.equal(
    calls[0].url,
    'https://w.example.workers.dev/health'
  )
  assert.equal(
    calls[0].init.headers.authorization,
    'Bearer secret'
  )
})

test('サーバー側の一時的な失敗は合計3回で打ち切る', async () => {
  const { client, calls, sleeps } =
    setup(() => status(503))

  await assert.rejects(
    client.testConnection(),
    (error) =>
      error instanceof CloudError &&
      error.code === 'http' &&
      error.status === 503
  )

  assert.equal(
    calls.length,
    RETRY_POLICY.maxAttempts
  )
  assert.equal(calls.length, 3)
  assert.deepEqual(sleeps, [1000, 3000])
  assert.equal(client.getStatus().retries, 2)
  assert.equal(client.getStatus().failures, 1)
})

test('通信できないときも合計3回で打ち切る', async () => {
  const { client, calls } =
    setup(() => new TypeError('failed to fetch'))

  await assert.rejects(
    client.testConnection(),
    (error) => error.code === 'network'
  )

  assert.equal(calls.length, 3)
})

test('合言葉違いや存在しないファイルは再試行しない', async () => {
  for (const code of [400, 401, 403, 404, 413]) {
    const { client, calls } =
      setup(() => status(code))

    await assert.rejects(
      client.getFile('a/b.jpg')
    )

    assert.equal(calls.length, 1, String(code))
  }
})

test('途中で成功したらそこで終わる', async () => {
  const { client, calls } =
    setup([status(502), ok({ ok: true })])

  assert.deepEqual(
    await client.testConnection(),
    { ok: true }
  )
  assert.equal(calls.length, 2)
  assert.equal(client.getStatus().failures, 0)
})

test('Retry-After の指示に従う（上限あり）', async () => {
  const { client, sleeps } =
    setup([
      status(429, { 'retry-after': '7' }),
      status(429, { 'retry-after': '9999' }),
      ok()
    ])

  await client.testConnection()

  assert.deepEqual(sleeps, [
    7000,
    RETRY_POLICY.maxDelayMs
  ])
})

test('失敗が続いたら通信を止め、時間が経つか手動で再開する', async () => {
  const { client, calls, advance } =
    setup(() => status(500))

  for (
    let i = 0;
    i < SAFETY.breakerFailures;
    i += 1
  ) {
    await assert.rejects(
      client.testConnection()
    )
  }

  const before = calls.length

  assert.equal(
    before,
    SAFETY.breakerFailures *
      RETRY_POLICY.maxAttempts
  )
  assert.equal(client.getStatus().paused, true)

  await assert.rejects(
    client.testConnection(),
    (error) => error.code === 'paused'
  )
  assert.equal(calls.length, before)

  client.resumeAfterPause()
  assert.equal(client.getStatus().paused, false)

  await assert.rejects(client.testConnection())
  assert.equal(calls.length, before + 3)

  advance(SAFETY.breakerCooldownMs + 1)
  assert.equal(client.getStatus().paused, false)
})

test('1分あたりの通信回数に上限がある', async () => {
  const { client, calls, advance } =
    setup(() => ok())

  for (
    let i = 0;
    i < SAFETY.maxRequestsPerMinute;
    i += 1
  ) {
    await client.testConnection()
  }

  await assert.rejects(
    client.testConnection(),
    (error) =>
      error.code === 'too_many_requests'
  )
  assert.equal(
    calls.length,
    SAFETY.maxRequestsPerMinute
  )

  advance(60001)
  await client.testConnection()
  assert.equal(
    calls.length,
    SAFETY.maxRequestsPerMinute + 1
  )
})

test('未設定なら通信しない', async () => {
  const calls = []

  const client =
    createCloudClient({
      fetchImpl: async () => {
        calls.push(1)
        return ok()
      },
      storage: createStorage()
    })

  await assert.rejects(
    client.testConnection(),
    (error) => error.code === 'not_configured'
  )
  assert.equal(calls.length, 0)
  assert.equal(
    client.getStatus().configured,
    false
  )
})

test('ファイル名は区切りを保ったまま送る', async () => {
  const { client, calls } =
    setup([ok({ ok: true })])

  await client.putFile(
    'jump/2026/50/01-cover.jpg',
    new Blob([new Uint8Array([1, 2, 3])], {
      type: 'image/jpeg'
    })
  )

  assert.equal(
    calls[0].url,
    'https://w.example.workers.dev/files/jump/2026/50/01-cover.jpg'
  )
  assert.equal(calls[0].init.method, 'PUT')
  assert.equal(
    calls[0].init.headers['content-type'],
    'image/jpeg'
  )
})
