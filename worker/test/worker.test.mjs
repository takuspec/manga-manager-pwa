import test from 'node:test'
import assert from 'node:assert/strict'
import worker, {
  estimateCost,
  parseKey
} from '../src/index.js'

const TOKEN = 'correct-horse-battery-staple'
const ORIGIN = 'https://takuspec.github.io'

async function toBytes(body) {
  if (body == null) {
    return new Uint8Array()
  }

  return new Uint8Array(
    await new Response(body).arrayBuffer()
  )
}

class FakeBucket {
  constructor() {
    this.objects = new Map()
    this.listCalls = 0
    this.counter = 0
  }

  async put(key, body, options = {}) {
    const bytes = await toBytes(body)

    this.counter += 1

    const record = {
      key,
      bytes,
      size: bytes.length,
      httpEtag: `"etag-${this.counter}"`,
      contentType:
        options.httpMetadata?.contentType
    }

    this.objects.set(key, record)
    return record
  }

  async get(key, options = {}) {
    const record = this.objects.get(key)

    if (!record) {
      return null
    }

    const noneMatch =
      options.onlyIf?.get?.('if-none-match')

    if (noneMatch === record.httpEtag) {
      return {
        key,
        size: record.size,
        httpEtag: record.httpEtag
      }
    }

    return {
      key,
      size: record.size,
      httpEtag: record.httpEtag,
      body: new Response(record.bytes).body,
      json: async () =>
        JSON.parse(
          new TextDecoder().decode(
            record.bytes
          )
        )
    }
  }

  async head(key) {
    return this.objects.get(key) || null
  }

  async delete(key) {
    this.objects.delete(key)
  }

  async list({ limit = 1000, cursor } = {}) {
    this.listCalls += 1

    const all =
      Array.from(this.objects.values())

    const start = Number(cursor || 0)
    const page =
      all.slice(start, start + limit)

    const next = start + limit

    return {
      objects: page,
      truncated: next < all.length,
      cursor: String(next)
    }
  }
}

function createEnv(extra = {}) {
  return {
    AUTH_TOKEN: TOKEN,
    ALLOWED_ORIGINS: `${ORIGIN},http://localhost:5173`,
    BUCKET: new FakeBucket(),
    ...extra
  }
}

function call(env, path, init = {}) {
  const headers =
    new Headers(init.headers || {})

  if (init.token !== null) {
    headers.set(
      'authorization',
      `Bearer ${init.token || TOKEN}`
    )
  }

  if (
    init.body != null &&
    !headers.has('content-length')
  ) {
    headers.set(
      'content-length',
      String(init.body.length)
    )
  }

  return worker.fetch(
    new Request(
      `https://worker.example${path}`,
      {
        method: init.method || 'GET',
        headers,
        body: init.body,
        duplex: init.body ? 'half' : undefined
      }
    ),
    env
  )
}

const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4
])

test('合言葉がない・違うと 401', async () => {
  const env = createEnv()

  assert.equal(
    (
      await call(env, '/health', {
        token: null
      })
    ).status,
    401
  )

  assert.equal(
    (
      await call(env, '/health', {
        token: 'wrong'
      })
    ).status,
    401
  )

  assert.equal(
    (await call(env, '/health')).status,
    200
  )
})

test('合言葉が未設定なら誰も通さない', async () => {
  const env = createEnv({ AUTH_TOKEN: '' })

  assert.equal(
    (
      await call(env, '/health', {
        token: ''
      })
    ).status,
    500
  )
})

test('保存した画像をそのまま取り出せる', async () => {
  const env = createEnv()

  const put =
    await call(
      env,
      '/files/jump/2026/50/01-cover.jpg',
      {
        method: 'PUT',
        headers: {
          'content-type': 'image/jpeg'
        },
        body: JPEG
      }
    )

  assert.equal(put.status, 200)

  const saved = await put.json()

  assert.equal(saved.size, JPEG.length)

  const get =
    await call(
      env,
      '/files/jump/2026/50/01-cover.jpg'
    )

  assert.equal(get.status, 200)
  assert.equal(
    get.headers.get('content-type'),
    'image/jpeg'
  )
  assert.deepEqual(
    new Uint8Array(await get.arrayBuffer()),
    JPEG
  )

  const cached =
    await call(
      env,
      '/files/jump/2026/50/01-cover.jpg',
      {
        headers: {
          'if-none-match': saved.etag
        }
      }
    )

  assert.equal(cached.status, 304)

  assert.equal(
    (
      await call(
        env,
        '/files/jump/2026/50/01-cover.jpg',
        { method: 'DELETE' }
      )
    ).status,
    200
  )

  assert.equal(
    (
      await call(
        env,
        '/files/jump/2026/50/01-cover.jpg'
      )
    ).status,
    404
  )
})

test('危ない名前や対象外の形式は保存できない', async () => {
  assert.equal(parseKey('a/../b.jpg'), null)
  assert.equal(parseKey('_meta/usage.json'), null)
  assert.equal(parseKey('a/b.exe'), null)
  assert.equal(parseKey('a%20b.jpg'), null)
  assert.equal(parseKey('a//b.jpg'), null)
  assert.equal(parseKey('%E0%A4%A.jpg'), null)
  assert.equal(parseKey('noextension'), null)
  assert.deepEqual(
    parseKey('jump/2026/50/01-cover.JPG'),
    {
      key: 'jump/2026/50/01-cover.JPG',
      contentType: 'image/jpeg'
    }
  )

  const env = createEnv()

  const response =
    await call(
      env,
      '/files/_meta/usage.json',
      {
        method: 'PUT',
        headers: {
          'content-type': 'application/json'
        },
        body: new TextEncoder().encode('{}')
      }
    )

  assert.equal(response.status, 400)
  assert.equal(env.BUCKET.objects.size, 0)
})

test('大きすぎる・種類が違うアップロードを拒否する', async () => {
  const env = createEnv()

  const tooLarge =
    await call(env, '/files/a/big.jpg', {
      method: 'PUT',
      headers: {
        'content-type': 'image/jpeg',
        'content-length': String(
          21 * 1024 * 1024
        )
      },
      body: JPEG
    })

  assert.equal(tooLarge.status, 413)

  const wrongType =
    await call(env, '/files/a/x.jpg', {
      method: 'PUT',
      headers: {
        'content-type': 'text/html'
      },
      body: JPEG
    })

  assert.equal(wrongType.status, 415)
  assert.equal(env.BUCKET.objects.size, 0)
})

test('許可したサイトにだけ CORS を返す', async () => {
  const env = createEnv()

  const allowed =
    await call(env, '/health', {
      headers: { origin: ORIGIN }
    })

  assert.equal(
    allowed.headers.get(
      'access-control-allow-origin'
    ),
    ORIGIN
  )

  const denied =
    await call(env, '/health', {
      headers: {
        origin: 'https://evil.example'
      }
    })

  assert.equal(
    denied.headers.get(
      'access-control-allow-origin'
    ),
    null
  )

  const preflight =
    await worker.fetch(
      new Request(
        'https://worker.example/files/a/x.jpg',
        {
          method: 'OPTIONS',
          headers: { origin: ORIGIN }
        }
      ),
      env
    )

  assert.equal(preflight.status, 204)
})

test('使用状況: 一覧から保存量を数え、結果を使い回す', async () => {
  const env = createEnv()

  for (const name of ['a', 'b', 'c']) {
    await call(env, `/files/x/${name}.jpg`, {
      method: 'PUT',
      headers: {
        'content-type': 'image/jpeg'
      },
      body: JPEG
    })
  }

  const first =
    await (await call(env, '/usage')).json()

  assert.equal(first.source, 'listing')
  assert.equal(first.cached, false)
  assert.equal(first.storage.objects, 3)
  assert.equal(
    first.storage.bytes,
    JPEG.length * 3
  )
  assert.equal(first.operations, null)
  assert.equal(first.estimate.totalUsd, 0)
  assert.equal(first.estimate.complete, false)

  const listCalls = env.BUCKET.listCalls

  const second =
    await (await call(env, '/usage')).json()

  assert.equal(second.cached, true)
  assert.equal(env.BUCKET.listCalls, listCalls)

  // 「更新」を連打しても、1分以内は数え直さない
  const forced =
    await (
      await call(env, '/usage?refresh=1')
    ).json()

  assert.equal(forced.cached, true)
  assert.equal(env.BUCKET.listCalls, listCalls)

  // 保存量の集計に、集計結果のファイル自身は含めない
  assert.equal(second.storage.objects, 3)
})

test('使用状況: API トークンがあれば操作回数も返す', async () => {
  const env =
    createEnv({
      CF_API_TOKEN: 'api-token',
      CF_ACCOUNT_ID: 'account-id',
      BUCKET_NAME: 'manga-images'
    })

  const originalFetch = globalThis.fetch
  let sent = null

  globalThis.fetch = async (url, init) => {
    sent = {
      url,
      auth: init.headers.authorization,
      body: JSON.parse(init.body)
    }

    return new Response(
      JSON.stringify({
        data: {
          viewer: {
            accounts: [
              {
                operations: [
                  {
                    sum: { requests: 1200 },
                    dimensions: {
                      actionType: 'PutObject'
                    }
                  },
                  {
                    sum: { requests: 30 },
                    dimensions: {
                      actionType: 'ListObjects'
                    }
                  },
                  {
                    sum: { requests: 54000 },
                    dimensions: {
                      actionType: 'GetObject'
                    }
                  },
                  {
                    sum: { requests: 99 },
                    dimensions: {
                      actionType: 'DeleteObject'
                    }
                  }
                ],
                storage: [
                  {
                    max: {
                      objectCount: 6000,
                      payloadSize: 12_000_000_000,
                      metadataSize: 0
                    },
                    dimensions: {
                      datetime:
                        '2026-11-15T00:00:00Z'
                    }
                  }
                ]
              }
            ]
          }
        },
        errors: null
      }),
      { status: 200 }
    )
  }

  try {
    const usage =
      await (await call(env, '/usage')).json()

    assert.equal(
      sent.url,
      'https://api.cloudflare.com/client/v4/graphql'
    )
    assert.equal(sent.auth, 'Bearer api-token')
    assert.equal(
      sent.body.variables.accountTag,
      'account-id'
    )
    assert.equal(usage.source, 'analytics')
    assert.equal(usage.operations.classA, 1230)
    assert.equal(usage.operations.classB, 54000)
    assert.equal(usage.storage.objects, 6000)
    // 12GB のうち無料の 10GB を超えた 2GB 分
    assert.equal(usage.estimate.storageUsd, 0.03)
    assert.equal(usage.estimate.totalUsd, 0.03)
    assert.equal(usage.estimate.complete, true)
    assert.equal(env.BUCKET.listCalls, 0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('使用状況: 操作回数の取得に失敗しても保存量は返す', async () => {
  const env =
    createEnv({
      CF_API_TOKEN: 'api-token',
      CF_ACCOUNT_ID: 'account-id',
      BUCKET_NAME: 'manga-images'
    })

  const originalFetch = globalThis.fetch
  const originalError = console.error

  globalThis.fetch = async () =>
    new Response('{}', { status: 403 })
  console.error = () => {}

  try {
    const usage =
      await (await call(env, '/usage')).json()

    assert.equal(usage.ok, true)
    assert.equal(usage.analyticsError, true)
    assert.equal(usage.operations, null)
    assert.equal(usage.source, 'listing')
  } finally {
    globalThis.fetch = originalFetch
    console.error = originalError
  }
})

test('課金額の見積もり', () => {
  assert.deepEqual(
    estimateCost(6_000_000_000, {
      classA: 12_000,
      classB: 20_000
    }),
    {
      storageUsd: 0,
      classAUsd: 0,
      classBUsd: 0,
      totalUsd: 0,
      complete: true
    }
  )

  const over =
    estimateCost(30_000_000_000, {
      classA: 3_000_000,
      classB: 20_000_000
    })

  assert.equal(over.storageUsd, 0.3)
  assert.equal(over.classAUsd, 9)
  assert.equal(over.classBUsd, 3.6)
  assert.equal(over.totalUsd, 12.9)
})
