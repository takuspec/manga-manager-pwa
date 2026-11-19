import { handleAnalyze } from './ai.js'

// manga-manager 用の画像置き場（Cloudflare Worker + R2）
//
// ・R2 バケットは非公開のまま、この Worker だけが読み書きする
// ・リクエストは合言葉（AUTH_TOKEN）を知っている本人だけ通す
// ・/usage で保存量・操作回数・推定課金額を返す

// 料金と無料枠（2026-11 時点の公開情報）。変更されたらここを直す。
// https://developers.cloudflare.com/r2/pricing/
export const PRICING = {
  checkedAt: '2026-11',
  // 課金は GB・月単位。安全側に 1GB = 10^9 バイトで計算する。
  bytesPerGb: 1_000_000_000,
  free: {
    storageGb: 10,
    classA: 1_000_000,
    classB: 10_000_000
  },
  usd: {
    storagePerGbMonth: 0.015,
    classAPerMillion: 4.5,
    classBPerMillion: 0.36
  }
}

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024
const USAGE_CACHE_KEY = '_meta/usage.json'
const USAGE_CACHE_TTL_MS = 10 * 60 * 1000
const USAGE_REFRESH_MIN_INTERVAL_MS = 60 * 1000
const LIST_PAGE_LIMIT = 100
const RESERVED_PREFIX = '_meta/'

const CONTENT_TYPES = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  json: 'application/json'
}

// R2 の操作種別ごとの課金区分。ここにない操作（削除など）は無料。
const CLASS_A_ACTIONS = new Set([
  'ListBuckets',
  'PutBucket',
  'ListObjects',
  'PutObject',
  'CopyObject',
  'CompleteMultipartUpload',
  'CreateMultipartUpload',
  'LifecycleStorageTierTransition',
  'ListMultipartUploads',
  'UploadPart',
  'UploadPartCopy',
  'ListParts',
  'PutBucketEncryption',
  'PutBucketCors',
  'PutBucketLifecycleConfiguration'
])

const CLASS_B_ACTIONS = new Set([
  'HeadBucket',
  'HeadObject',
  'GetObject',
  'UsageSummary',
  'GetBucketEncryption',
  'GetBucketLocation',
  'GetBucketCors',
  'GetBucketLifecycleConfiguration'
])

function corsHeaders(request, env) {
  const origin =
    request.headers.get('origin') || ''

  const allowed =
    String(env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)

  const headers = {
    vary: 'Origin'
  }

  if (origin && allowed.includes(origin)) {
    headers['access-control-allow-origin'] =
      origin
    headers['access-control-allow-methods'] =
      'GET, HEAD, PUT, POST, DELETE, OPTIONS'
    headers['access-control-allow-headers'] =
      'Authorization, Content-Type, If-None-Match'
    headers['access-control-expose-headers'] =
      'ETag, Content-Length, Retry-After'
    headers['access-control-max-age'] =
      '86400'
  }

  return headers
}

function json(body, status, extraHeaders) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        'content-type':
          'application/json; charset=utf-8',
        'cache-control': 'no-store',
        ...extraHeaders
      }
    }
  )
}

async function sha256(text) {
  return new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(text)
    )
  )
}

// 合言葉の比較。ハッシュ同士を最後まで比べ、
// 一致した文字数が応答時間から漏れないようにする。
async function isAuthorized(request, env) {
  const header =
    request.headers.get('authorization') || ''

  if (!header.startsWith('Bearer ')) {
    return false
  }

  const [given, expected] =
    await Promise.all([
      sha256(header.slice(7)),
      sha256(String(env.AUTH_TOKEN))
    ])

  let diff = 0

  for (let i = 0; i < expected.length; i += 1) {
    diff |= given[i] ^ expected[i]
  }

  return diff === 0
}

// 保存先の名前（キー）の検査。
// 例: jump/2026/50/01-cover.jpg
export function parseKey(rawPath) {
  let key

  try {
    key = decodeURIComponent(rawPath)
  } catch {
    return null
  }

  if (
    !key ||
    key.length > 512 ||
    key.startsWith(RESERVED_PREFIX)
  ) {
    return null
  }

  const segments = key.split('/')

  const valid =
    segments.every((segment) => {
      return (
        /^[A-Za-z0-9._-]+$/.test(segment) &&
        !/^\.+$/.test(segment)
      )
    })

  if (!valid) {
    return null
  }

  const extension =
    key.includes('.')
      ? key
          .slice(key.lastIndexOf('.') + 1)
          .toLowerCase()
      : ''

  const contentType =
    CONTENT_TYPES[extension]

  if (!contentType) {
    return null
  }

  return {
    key,
    contentType
  }
}

async function handlePut(
  request,
  env,
  target,
  cors
) {
  const lengthHeader =
    request.headers.get('content-length')

  const length = Number(lengthHeader)

  if (
    !lengthHeader ||
    !Number.isInteger(length) ||
    length <= 0
  ) {
    return json(
      { error: 'length_required' },
      411,
      cors
    )
  }

  if (length > MAX_UPLOAD_BYTES) {
    return json(
      {
        error: 'too_large',
        maxBytes: MAX_UPLOAD_BYTES
      },
      413,
      cors
    )
  }

  const givenType =
    (
      request.headers.get('content-type') ||
      ''
    )
      .split(';')[0]
      .trim()
      .toLowerCase()

  if (givenType !== target.contentType) {
    return json(
      {
        error: 'content_type_mismatch',
        expected: target.contentType
      },
      415,
      cors
    )
  }

  const object =
    await env.BUCKET.put(
      target.key,
      request.body,
      {
        httpMetadata: {
          contentType: target.contentType
        }
      }
    )

  return json(
    {
      ok: true,
      key: target.key,
      size: object.size,
      etag: object.httpEtag
    },
    200,
    cors
  )
}

function objectHeaders(object, target, cors) {
  return {
    'content-type': target.contentType,
    'content-length': String(object.size),
    etag: object.httpEtag,
    // 索引（JSON）は毎回確認、画像は端末側で1日キャッシュ
    'cache-control':
      target.contentType ===
      'application/json'
        ? 'private, no-cache'
        : 'private, max-age=86400',
    ...cors
  }
}

async function handleGet(
  request,
  env,
  target,
  cors
) {
  const object =
    await env.BUCKET.get(
      target.key,
      {
        onlyIf: request.headers
      }
    )

  if (!object) {
    return json(
      { error: 'not_found' },
      404,
      cors
    )
  }

  // If-None-Match が一致したときは本体が付かない
  if (!object.body) {
    return new Response(
      null,
      {
        status: 304,
        headers: {
          etag: object.httpEtag,
          ...cors
        }
      }
    )
  }

  return new Response(
    object.body,
    {
      status: 200,
      headers:
        objectHeaders(object, target, cors)
    }
  )
}

async function handleHead(env, target, cors) {
  const object =
    await env.BUCKET.head(target.key)

  if (!object) {
    return new Response(
      null,
      {
        status: 404,
        headers: cors
      }
    )
  }

  return new Response(
    null,
    {
      status: 200,
      headers:
        objectHeaders(object, target, cors)
    }
  )
}

async function handleDelete(env, target, cors) {
  await env.BUCKET.delete(target.key)

  return json(
    {
      ok: true,
      key: target.key
    },
    200,
    cors
  )
}

export function estimateCost(
  storageBytes,
  operations
) {
  const storageGb =
    storageBytes / PRICING.bytesPerGb

  const storageUsd =
    Math.max(
      0,
      storageGb - PRICING.free.storageGb
    ) * PRICING.usd.storagePerGbMonth

  const classAUsd =
    operations
      ? (Math.max(
          0,
          operations.classA -
            PRICING.free.classA
        ) /
          1_000_000) *
        PRICING.usd.classAPerMillion
      : null

  const classBUsd =
    operations
      ? (Math.max(
          0,
          operations.classB -
            PRICING.free.classB
        ) /
          1_000_000) *
        PRICING.usd.classBPerMillion
      : null

  const round = (value) => {
    return Math.round(value * 100) / 100
  }

  return {
    storageUsd: round(storageUsd),
    classAUsd:
      classAUsd === null
        ? null
        : round(classAUsd),
    classBUsd:
      classBUsd === null
        ? null
        : round(classBUsd),
    // 操作回数が分からないときは保存分だけの合計になる
    totalUsd:
      round(
        storageUsd +
          (classAUsd || 0) +
          (classBUsd || 0)
      ),
    complete: Boolean(operations)
  }
}

async function queryAnalytics(env, now) {
  const monthStart =
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        1
      )
    )

  const storageStart =
    new Date(
      now.getTime() -
        2 * 24 * 60 * 60 * 1000
    )

  const query = `
    query Usage(
      $accountTag: string!
      $bucketName: string
      $monthStart: Time
      $storageStart: Time
      $now: Time
    ) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          operations: r2OperationsAdaptiveGroups(
            limit: 10000
            filter: {
              datetime_geq: $monthStart
              datetime_leq: $now
              bucketName: $bucketName
            }
          ) {
            sum { requests }
            dimensions { actionType }
          }
          storage: r2StorageAdaptiveGroups(
            limit: 1
            filter: {
              datetime_geq: $storageStart
              datetime_leq: $now
              bucketName: $bucketName
            }
            orderBy: [datetime_DESC]
          ) {
            max { objectCount payloadSize metadataSize }
            dimensions { datetime }
          }
        }
      }
    }
  `

  const response =
    await fetch(
      'https://api.cloudflare.com/client/v4/graphql',
      {
        method: 'POST',
        headers: {
          authorization:
            `Bearer ${env.CF_API_TOKEN}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          query,
          variables: {
            accountTag: env.CF_ACCOUNT_ID,
            bucketName: env.BUCKET_NAME,
            monthStart:
              monthStart.toISOString(),
            storageStart:
              storageStart.toISOString(),
            now: now.toISOString()
          }
        })
      }
    )

  if (!response.ok) {
    throw new Error(
      `analytics http ${response.status}`
    )
  }

  const result = await response.json()

  const account =
    result?.data?.viewer?.accounts?.[0]

  if (
    !account ||
    (result.errors && result.errors.length)
  ) {
    throw new Error('analytics query failed')
  }

  let classA = 0
  let classB = 0

  for (const row of account.operations || []) {
    const action =
      row?.dimensions?.actionType

    const requests =
      Number(row?.sum?.requests) || 0

    if (CLASS_A_ACTIONS.has(action)) {
      classA += requests
    } else if (CLASS_B_ACTIONS.has(action)) {
      classB += requests
    }
  }

  const latest = account.storage?.[0]

  return {
    operations: {
      classA,
      classB,
      since: monthStart.toISOString()
    },
    storage: latest
      ? {
          bytes:
            (Number(
              latest.max?.payloadSize
            ) || 0) +
            (Number(
              latest.max?.metadataSize
            ) || 0),
          objects:
            Number(
              latest.max?.objectCount
            ) || 0
        }
      : null
  }
}

// バケットの中身を数えて保存量を出す（1000件につき一覧操作1回）。
async function measureByListing(env) {
  let bytes = 0
  let objects = 0
  let cursor
  let truncated = false

  for (
    let page = 0;
    page < LIST_PAGE_LIMIT;
    page += 1
  ) {
    const result =
      await env.BUCKET.list({
        limit: 1000,
        cursor
      })

    for (const object of result.objects) {
      if (
        object.key.startsWith(RESERVED_PREFIX)
      ) {
        continue
      }

      bytes += object.size
      objects += 1
    }

    if (!result.truncated) {
      return {
        bytes,
        objects,
        truncated
      }
    }

    cursor = result.cursor
  }

  truncated = true

  return {
    bytes,
    objects,
    truncated
  }
}

async function readUsageCache(env) {
  try {
    const cached =
      await env.BUCKET.get(USAGE_CACHE_KEY)

    return cached
      ? await cached.json()
      : null
  } catch {
    return null
  }
}

async function handleUsage(
  request,
  env,
  cors
) {
  const now = new Date()

  const forceRefresh =
    new URL(request.url).searchParams.get(
      'refresh'
    ) === '1'

  const cached = await readUsageCache(env)

  const age =
    cached?.fetchedAt
      ? now.getTime() -
        Date.parse(cached.fetchedAt)
      : Infinity

  // 連打しても数え直しは1分に1回まで
  const maxAge =
    forceRefresh
      ? USAGE_REFRESH_MIN_INTERVAL_MS
      : USAGE_CACHE_TTL_MS

  if (cached && age >= 0 && age < maxAge) {
    return json(
      {
        ...cached,
        cached: true
      },
      200,
      cors
    )
  }

  let storage = null
  let operations = null
  let source = 'listing'
  let analyticsError = false

  if (
    env.CF_API_TOKEN &&
    env.CF_ACCOUNT_ID &&
    env.BUCKET_NAME
  ) {
    try {
      const analytics =
        await queryAnalytics(env, now)

      operations = analytics.operations
      storage = analytics.storage
      source = 'analytics'
    } catch (error) {
      console.error(error)
      analyticsError = true
    }
  }

  let truncated = false

  if (!storage) {
    const measured =
      await measureByListing(env)

    storage = {
      bytes: measured.bytes,
      objects: measured.objects
    }
    truncated = measured.truncated

    if (source === 'analytics') {
      source = 'mixed'
    }
  }

  const usage = {
    ok: true,
    fetchedAt: now.toISOString(),
    source,
    analyticsError,
    truncated,
    storage,
    operations,
    pricing: PRICING,
    estimate:
      estimateCost(
        storage.bytes,
        operations
      )
  }

  try {
    await env.BUCKET.put(
      USAGE_CACHE_KEY,
      JSON.stringify(usage),
      {
        httpMetadata: {
          contentType: 'application/json'
        }
      }
    )
  } catch (error) {
    console.error(error)
  }

  return json(
    {
      ...usage,
      cached: false
    },
    200,
    cors
  )
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env)

    try {
      if (request.method === 'OPTIONS') {
        return new Response(
          null,
          {
            status: 204,
            headers: cors
          }
        )
      }

      if (!env.AUTH_TOKEN || !env.BUCKET) {
        return json(
          { error: 'server_not_configured' },
          500,
          cors
        )
      }

      if (!(await isAuthorized(request, env))) {
        return json(
          { error: 'unauthorized' },
          401,
          cors
        )
      }

      const url = new URL(request.url)
      const method = request.method

      if (
        url.pathname === '/health' &&
        method === 'GET'
      ) {
        return json(
          { ok: true },
          200,
          cors
        )
      }

      if (
        url.pathname === '/usage' &&
        method === 'GET'
      ) {
        return handleUsage(
          request,
          env,
          cors
        )
      }

      if (
        url.pathname === '/ai/analyze' &&
        method === 'POST'
      ) {
        return handleAnalyze(
          request,
          env,
          cors,
          json
        )
      }

      if (url.pathname.startsWith('/files/')) {
        const target =
          parseKey(
            url.pathname.slice(
              '/files/'.length
            )
          )

        if (!target) {
          return json(
            { error: 'invalid_key' },
            400,
            cors
          )
        }

        if (method === 'PUT') {
          return handlePut(
            request,
            env,
            target,
            cors
          )
        }

        if (method === 'GET') {
          return handleGet(
            request,
            env,
            target,
            cors
          )
        }

        if (method === 'HEAD') {
          return handleHead(
            env,
            target,
            cors
          )
        }

        if (method === 'DELETE') {
          return handleDelete(
            env,
            target,
            cors
          )
        }

        return json(
          { error: 'method_not_allowed' },
          405,
          cors
        )
      }

      return json(
        { error: 'not_found' },
        404,
        cors
      )
    } catch (error) {
      console.error(error)

      return json(
        { error: 'internal_error' },
        500,
        cors
      )
    }
  }
}
