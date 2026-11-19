// 画像から作品を当てる（Anthropic の Claude API を Worker から呼ぶ）。
// API キーは Worker の秘密（ANTHROPIC_API_KEY）にだけ置き、アプリには渡さない。

export const AI_LIMITS = {
  maxImages: 60,
  maxCandidates: 300,
  maxTitleLength: 80,
  maxBodyBytes: 30 * 1024 * 1024,
  maxImageBase64Length: 2 * 1024 * 1024
}

const DEFAULT_MODEL = 'claude-haiku-5-5'
const ANTHROPIC_URL =
  'https://api.anthropic.com/v1/messages'
const PAGE_TYPES = ['cover', 'toc', 'color', 'other']

const TOOL = {
  name: 'report_pages',
  description:
    '各画像の種類と、描かれている作品を報告する',
  input_schema: {
    type: 'object',
    properties: {
      pages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: {
              type: 'integer',
              description: '画像の番号（0から）'
            },
            type: {
              type: 'string',
              enum: PAGE_TYPES
            },
            series: {
              type: 'array',
              items: { type: 'string' },
              description:
                '候補の中から選んだ作品名。分からなければ空'
            }
          },
          required: ['index', 'type', 'series']
        }
      }
    },
    required: ['pages']
  }
}

// 受け取った内容を検査して整える。だめなら null
export function parseAnalyzeBody(body) {
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

  const images =
    Array.isArray(body?.images)
      ? body.images
      : []

  if (
    images.length === 0 ||
    images.length > AI_LIMITS.maxImages
  ) {
    return null
  }

  for (const image of images) {
    if (
      typeof image?.data !== 'string' ||
      image.data.length === 0 ||
      image.data.length >
        AI_LIMITS.maxImageBase64Length ||
      !/^[A-Za-z0-9+/=]+$/.test(image.data)
    ) {
      return null
    }
  }

  return {
    candidates: Array.from(new Set(candidates)),
    images: images.map((image) => image.data)
  }
}

export function buildAnthropicRequest(
  { candidates, images },
  model = DEFAULT_MODEL
) {
  const content = [
    {
      type: 'text',
      text: [
        '週刊漫画雑誌のページを撮った画像が、撮った順に並んでいます。',
        '何号分かが続けて入っていることがあり、それぞれの号は表紙から始まります。',
        '各画像について、次を判断して report_pages で報告してください。',
        '',
        'type:',
        '- cover: 雑誌の表紙（誌名のロゴと号数がある）',
        '- toc: 目次のページ',
        '- color: 作品のカラーページ（見開きも含む）',
        '- other: 広告など、それ以外',
        '',
        'series: その画像の作品名を、下の候補から選んでください。',
        '- 作品名のロゴ、タイトル、キャラクターから判断します。',
        '- 表紙は、表紙に大きく描かれている作品を選びます。',
        '- 目次の画像があれば、巻頭カラーやセンターカラーの作品を確かめる参考にしてください。',
        '- 候補にない読み切り作品なら「読み切り」と答えます。',
        '- 自信がなければ空にしてください。候補にない名前は書かないでください。',
        '- 目次と広告は空にします。',
        '',
        `候補: ${candidates.join(' / ')}`
      ].join('\n')
    }
  ]

  images.forEach((data, index) => {
    content.push({
      type: 'text',
      text: `画像 ${index}`
    })
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data
      }
    })
  })

  return {
    model,
    max_tokens: 8192,
    tools: [TOOL],
    tool_choice: {
      type: 'tool',
      name: TOOL.name
    },
    messages: [
      {
        role: 'user',
        content
      }
    ]
  }
}

// AI の答えを、画像の数と候補に合わせて整える
export function normalizeAnalyzeResult(
  message,
  imageCount,
  candidates
) {
  const allowed = new Set(candidates)

  const block =
    (message?.content || []).find(
      (item) =>
        item?.type === 'tool_use' &&
        item.name === TOOL.name
    )

  const pages =
    Array.from(
      { length: imageCount },
      (_, index) => ({
        index,
        type: 'color',
        series: []
      })
    )

  for (const page of block?.input?.pages || []) {
    const index = Number(page?.index)

    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= imageCount
    ) {
      continue
    }

    pages[index] = {
      index,
      type: PAGE_TYPES.includes(page.type)
        ? page.type
        : 'color',
      series: Array.from(
        new Set(
          (Array.isArray(page.series)
            ? page.series
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

  return pages
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

    return json(
      {
        error: 'ai_failed',
        status: response.status
      },
      response.status === 429 ? 429 : 502,
      cors
    )
  }

  const message = await response.json()

  return json(
    {
      pages: normalizeAnalyzeResult(
        message,
        input.images.length,
        input.candidates
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
