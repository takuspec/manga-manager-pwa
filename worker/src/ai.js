// 画像から作品を当てる（Anthropic の Claude API を Worker から呼ぶ）。
// API キーは Worker の秘密（ANTHROPIC_API_KEY）にだけ置き、アプリには渡さない。
//
// 取り違えを防ぐため、1回の依頼で判定する画像は1枚だけにする。
// ・classify: その画像が表紙・目次・カラーページのどれか
// ・series:   その画像の作品（同じ号の目次の画像を参考に添えられる）

export const AI_LIMITS = {
  maxCandidates: 300,
  maxTitleLength: 80,
  maxBodyBytes: 12 * 1024 * 1024,
  maxImageBase64Length: 5 * 1024 * 1024
}

const DEFAULT_MODEL = 'claude-haiku-5-5'
const ANTHROPIC_URL =
  'https://api.anthropic.com/v1/messages'
const PAGE_TYPES = ['cover', 'toc', 'color', 'other']

const CLASSIFY_TOOL = {
  name: 'report_type',
  description: '画像の種類を報告する',
  input_schema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: PAGE_TYPES
      }
    },
    required: ['type']
  }
}

const SERIES_TOOL = {
  name: 'report_series',
  description: '画像の作品を報告する',
  input_schema: {
    type: 'object',
    properties: {
      series: {
        type: 'array',
        items: { type: 'string' },
        description:
          '候補の中から選んだ作品名。分からなければ空'
      }
    },
    required: ['series']
  }
}

function isBase64Image(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <=
      AI_LIMITS.maxImageBase64Length &&
    /^[A-Za-z0-9+/=]+$/.test(value)
  )
}

// 受け取った内容を検査して整える。だめなら null
export function parseAnalyzeBody(body) {
  const task = body?.task

  if (
    task !== 'classify' &&
    task !== 'series'
  ) {
    return null
  }

  if (!isBase64Image(body?.image)) {
    return null
  }

  if (
    body.toc !== undefined &&
    body.toc !== null &&
    !isBase64Image(body.toc)
  ) {
    return null
  }

  const candidates =
    Array.isArray(body?.candidates)
      ? body.candidates
          .map((title) =>
            String(title || '')
              .trim()
              .slice(0, AI_LIMITS.maxTitleLength)
          )
          .filter(Boolean)
          .slice(0, AI_LIMITS.maxCandidates)
      : []

  if (task === 'series' && candidates.length === 0) {
    return null
  }

  return {
    task,
    image: body.image,
    toc:
      task === 'series' && body.toc
        ? body.toc
        : null,
    candidates: Array.from(new Set(candidates))
  }
}

const imageBlock = (data) => ({
  type: 'image',
  source: {
    type: 'base64',
    media_type: 'image/jpeg',
    data
  }
})

export function buildAnthropicRequest(
  input,
  model = DEFAULT_MODEL
) {
  if (input.task === 'classify') {
    return {
      model,
      max_tokens: 200,
      tools: [CLASSIFY_TOOL],
      tool_choice: {
        type: 'tool',
        name: CLASSIFY_TOOL.name
      },
      messages: [
        {
          role: 'user',
          content: [
            imageBlock(input.image),
            {
              type: 'text',
              text: [
                'この画像は、週刊漫画雑誌のページを撮ったものです。種類を1つ選んで report_type で報告してください。',
                '- cover: 雑誌そのものの表紙（上部に大きな誌名のロゴと号数・発売日がある）',
                '- toc: 目次のページ（作品名と作者名が一覧で並ぶ、文字が中心のページ）',
                '- color: 作品のカラーページ（扉絵・見開きを含む。作品のタイトルロゴがあることが多い）',
                '- other: 広告など、それ以外',
                '迷ったら color にしてください。'
              ].join('\n')
            }
          ]
        }
      ]
    }
  }

  const content = [
    {
      type: 'text',
      text: '判定する画像:'
    },
    imageBlock(input.image)
  ]

  if (input.toc) {
    content.push(
      {
        type: 'text',
        text: '参考: 同じ号の目次:'
      },
      imageBlock(input.toc)
    )
  }

  content.push({
    type: 'text',
    text: [
      '「判定する画像」は週刊漫画雑誌のカラーページ（または表紙）です。描かれている作品を、下の候補から選んで report_series で報告してください。',
      '- 作品名のロゴ、タイトル、キャラクターから判断します。',
      '- 表紙なら、表紙に大きく描かれている作品を選びます。',
      '- 目次があれば、その号に載っている作品や、巻頭カラー・センターカラーの作品を確かめる参考にしてください。',
      '- 読み切り作品（目次で「読み切り」「特別読切」などとある作品や、候補にない作品）なら「読み切り」と答えます。',
      '- 自信がなければ空にしてください。候補にない名前は書かないでください。',
      '',
      `候補: ${input.candidates.join(' / ')}`
    ].join('\n')
  })

  return {
    model,
    max_tokens: 300,
    tools: [SERIES_TOOL],
    tool_choice: {
      type: 'tool',
      name: SERIES_TOOL.name
    },
    messages: [
      {
        role: 'user',
        content
      }
    ]
  }
}

// AI の答えを整える
export function normalizeAnalyzeResult(
  message,
  input
) {
  const block =
    (message?.content || []).find(
      (item) => item?.type === 'tool_use'
    )

  if (input.task === 'classify') {
    const type = block?.input?.type

    return {
      type: PAGE_TYPES.includes(type)
        ? type
        : 'color'
    }
  }

  const allowed = new Set(input.candidates)

  return {
    series: Array.from(
      new Set(
        (Array.isArray(block?.input?.series)
          ? block.input.series
          : []
        )
          .map((title) =>
            String(title || '').trim()
          )
          .filter((title) =>
            allowed.has(title)
          )
      )
    ).slice(0, 4)
  }
}

export async function handleAnalyze(
  request,
  env,
  cors,
  json,
  fetchImpl = (...args) => fetch(...args)
) {
  if (!env.ANTHROPIC_API_KEY) {
    return json(
      { error: 'ai_not_configured' },
      501,
      cors
    )
  }

  const length =
    Number(request.headers.get('content-length'))

  if (
    !Number.isFinite(length) ||
    length <= 0 ||
    length > AI_LIMITS.maxBodyBytes
  ) {
    return json(
      { error: 'too_large' },
      413,
      cors
    )
  }

  let body = null

  try {
    body = await request.json()
  } catch {
    body = null
  }

  const input = parseAnalyzeBody(body)

  if (!input) {
    return json(
      { error: 'invalid_request' },
      400,
      cors
    )
  }

  const response =
    await fetchImpl(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(
        buildAnthropicRequest(
          input,
          env.AI_MODEL || DEFAULT_MODEL
        )
      )
    })

  if (!response.ok) {
    console.error(
      'anthropic error',
      response.status,
      await response.text().catch(() => '')
    )

    // クレジット切れ・キーの無効など（やり直しても同じ）は 402 で返す。
    // アプリはこれを見て AI の判定をやめ、手動のタグ付けに切り替える
    if (
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 429
    ) {
      return json(
        {
          error: 'ai_unavailable',
          status: response.status
        },
        402,
        cors
      )
    }

    const retryAfter =
      response.headers.get('retry-after')

    return json(
      {
        error: 'ai_failed',
        status: response.status
      },
      response.status === 429 ? 429 : 502,
      retryAfter
        ? {
            ...cors,
            'retry-after': retryAfter
          }
        : cors
    )
  }

  const message = await response.json()

  return json(
    {
      ...normalizeAnalyzeResult(
        message,
        input
      ),
      usage: {
        inputTokens:
          Number(message?.usage?.input_tokens) || 0,
        outputTokens:
          Number(message?.usage?.output_tokens) || 0
      }
    },
    200,
    cors
  )
}
