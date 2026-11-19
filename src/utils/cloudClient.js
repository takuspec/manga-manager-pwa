// クラウド（Cloudflare Worker + R2）との通信をまとめた窓口。
//
// 無料枠を守るための安全装置をここに集めている。
// ・再試行は1回の操作につき最大3回まで（RETRY_POLICY）
// ・失敗が続いたら通信を一時停止する（SAFETY.breakerFailures）
// ・1分あたりの通信回数に上限を設ける（SAFETY.maxRequestsPerMinute）
// 不具合で同じ取得を繰り返しても、回数が増え続けないようにするため。

const CONFIG_KEY = 'cloud-config-v1'

export const RETRY_POLICY = {
  // 最初の1回を含めた合計の試行回数
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  timeoutMs: 30000,
  uploadTimeoutMs: 120000
}

export const SAFETY = {
  maxRequestsPerMinute: 240,
  // 連続でこの回数だけ操作が失敗したら一時停止する
  breakerFailures: 5,
  breakerCooldownMs: 5 * 60 * 1000
}

const RETRYABLE_STATUS =
  new Set([408, 429, 500, 502, 503, 504])

export class CloudError extends Error {
  constructor(code, message, status = 0) {
    super(message)
    this.name = 'CloudError'
    this.code = code
    this.status = status
  }
}

export function normalizeEndpoint(value) {
  const trimmed =
    String(value || '')
      .trim()
      .replace(/\/+$/, '')

  if (!trimmed) {
    return ''
  }

  let url

  try {
    url = new URL(trimmed)
  } catch {
    return ''
  }

  const isLocal =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1'

  // 合言葉を平文で送らないよう、https だけを許可する
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && isLocal)
  ) {
    return ''
  }

  return trimmed
}

function encodeKey(key) {
  return String(key)
    .split('/')
    .map(encodeURIComponent)
    .join('/')
}

export function createCloudClient({
  fetchImpl = (...args) =>
    globalThis.fetch(...args),
  sleep = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms)
    }),
  now = () => Date.now(),
  random = () => Math.random(),
  storage = globalThis.localStorage
} = {}) {
  const state = {
    requests: 0,
    retries: 0,
    failures: 0,
    consecutiveFailures: 0,
    pausedUntil: 0,
    recent: []
  }

  const loadConfig = () => {
    try {
      const saved =
        JSON.parse(
          storage?.getItem(CONFIG_KEY) ||
            'null'
        )

      return {
        endpoint:
          normalizeEndpoint(saved?.endpoint),
        token:
          typeof saved?.token === 'string'
            ? saved.token
            : ''
      }
    } catch {
      return {
        endpoint: '',
        token: ''
      }
    }
  }

  const saveConfig = ({
    endpoint,
    token
  }) => {
    const next = {
      endpoint: normalizeEndpoint(endpoint),
      token: String(token || '').trim()
    }

    storage?.setItem(
      CONFIG_KEY,
      JSON.stringify(next)
    )

    return next
  }

  const clearConfig = () => {
    storage?.removeItem(CONFIG_KEY)
  }

  const isConfigured = () => {
    const config = loadConfig()

    return Boolean(
      config.endpoint && config.token
    )
  }

  const checkGuards = () => {
    const current = now()

    if (state.pausedUntil > current) {
      throw new CloudError(
        'paused',
        '通信の失敗が続いたため、一時停止しています。'
      )
    }

    state.recent =
      state.recent.filter((time) => {
        return current - time < 60000
      })

    if (
      state.recent.length >=
      SAFETY.maxRequestsPerMinute
    ) {
      throw new CloudError(
        'too_many_requests',
        '短時間の通信回数が上限に達しました。少し待ってください。'
      )
    }

    state.recent.push(current)
    state.requests += 1
  }

  const recordFailure = () => {
    state.failures += 1
    state.consecutiveFailures += 1

    if (
      state.consecutiveFailures >=
      SAFETY.breakerFailures
    ) {
      state.pausedUntil =
        now() + SAFETY.breakerCooldownMs
    }
  }

  const retryDelay = (
    attempt,
    response
  ) => {
    const retryAfter =
      Number(
        response?.headers?.get?.(
          'retry-after'
        )
      )

    if (
      Number.isFinite(retryAfter) &&
      retryAfter > 0
    ) {
      return Math.min(
        retryAfter * 1000,
        RETRY_POLICY.maxDelayMs
      )
    }

    // 1秒、3秒…と間隔を空け、少しばらつかせる
    const base =
      RETRY_POLICY.baseDelayMs *
      3 ** (attempt - 1)

    return Math.min(
      base * (0.75 + random() * 0.5),
      RETRY_POLICY.maxDelayMs
    )
  }

  const request = async (
    path,
    {
      method = 'GET',
      headers = {},
      body,
      timeoutMs = RETRY_POLICY.timeoutMs,
      maxAttempts = RETRY_POLICY.maxAttempts
    } = {}
  ) => {
    const config = loadConfig()

    if (!config.endpoint || !config.token) {
      throw new CloudError(
        'not_configured',
        'クラウドの接続先が設定されていません。'
      )
    }

    // 全角文字や空白が混ざった合言葉は、ブラウザが送信そのものを拒否する。
    // 「通信できませんでした」と区別できるよう、先に検査して理由を伝える。
    if (!/^[\x21-\x7e]+$/.test(config.token)) {
      throw new CloudError(
        'invalid_token',
        '合言葉に使えない文字（全角の文字や空白）が入っています。半角で入力し直してください。'
      )
    }

    let lastError = null

    for (
      let attempt = 1;
      attempt <= maxAttempts;
      attempt += 1
    ) {
      checkGuards()

      if (attempt > 1) {
        state.retries += 1
      }

      const controller =
        new AbortController()

      const timer =
        setTimeout(() => {
          controller.abort()
        }, timeoutMs)

      let response = null

      try {
        response =
          await fetchImpl(
            `${config.endpoint}${path}`,
            {
              method,
              headers: {
                ...headers,
                authorization:
                  `Bearer ${config.token}`
              },
              body,
              signal: controller.signal
            }
          )
      } catch (error) {
        lastError =
          new CloudError(
            error?.name === 'AbortError'
              ? 'timeout'
              : 'network',
            error?.name === 'AbortError'
              ? '通信が時間内に終わりませんでした。'
              : '通信できませんでした。電波の状態を確認してください。'
          )
      } finally {
        clearTimeout(timer)
      }

      if (response) {
        if (
          response.ok ||
          response.status === 304
        ) {
          state.consecutiveFailures = 0
          return response
        }

        lastError =
          new CloudError(
            response.status === 401
              ? 'unauthorized'
              : 'http',
            response.status === 401
              ? '合言葉が違います。'
              : `サーバーがエラーを返しました（${response.status}）。`,
            response.status
          )

        // 入力や設定の誤りは、やり直しても結果が変わらない
        if (
          !RETRYABLE_STATUS.has(
            response.status
          )
        ) {
          break
        }
      }

      if (
        attempt < maxAttempts
      ) {
        await sleep(
          retryDelay(attempt, response)
        )
      }
    }

    // 「まだ何も登録されていない」（404）は正常な応答なので、
    // 失敗の回数には数えない。数えると、空の年や号を続けて開いただけで
    // 通信が一時停止してしまう。
    // AI の設定がまだ（501）も、通信の不調ではないので数えない
    if (
      lastError?.status === 404 ||
      lastError?.status === 501
    ) {
      state.consecutiveFailures = 0
    } else {
      recordFailure()
    }

    throw lastError
  }

  return {
    loadConfig,
    saveConfig,
    clearConfig,
    isConfigured,
    request,

    async testConnection() {
      const response =
        await request('/health')

      return response.json()
    },

    async getUsage({
      refresh = false
    } = {}) {
      const response =
        await request(
          refresh
            ? '/usage?refresh=1'
            : '/usage'
        )

      return response.json()
    },

    async putFile(key, blob, contentType) {
      const response =
        await request(
          `/files/${encodeKey(key)}`,
          {
            method: 'PUT',
            headers: {
              'content-type':
                contentType || blob.type
            },
            body: blob,
            timeoutMs:
              RETRY_POLICY.uploadTimeoutMs
          }
        )

      return response.json()
    },

    async getFile(key) {
      const response =
        await request(
          `/files/${encodeKey(key)}`,
          {
            timeoutMs:
              RETRY_POLICY.uploadTimeoutMs
          }
        )

      return response.blob()
    },

    // 画像（JPEG を base64 にしたもの）から、表紙・目次と作品を当てる。
    // 料金がかかるので、やり直しは1回まで。
    async analyzeImages({
      candidates,
      images
    }) {
      const body =
        new Blob(
          [
            JSON.stringify({
              candidates,
              images: images.map((data) => ({
                data
              }))
            })
          ],
          { type: 'application/json' }
        )

      const response =
        await request('/ai/analyze', {
          method: 'POST',
          headers: {
            'content-type': 'application/json'
          },
          body,
          timeoutMs: 180000,
          maxAttempts: 2
        })

      return response.json()
    },

    async deleteFile(key) {
      const response =
        await request(
          `/files/${encodeKey(key)}`,
          {
            method: 'DELETE'
          }
        )

      return response.json()
    },

    getStatus() {
      const current = now()

      return {
        configured: isConfigured(),
        requests: state.requests,
        retries: state.retries,
        failures: state.failures,
        paused:
          state.pausedUntil > current,
        pausedUntil: state.pausedUntil
      }
    },

    resumeAfterPause() {
      state.pausedUntil = 0
      state.consecutiveFailures = 0
    }
  }
}

const cloudClient = createCloudClient()

export default cloudClient
