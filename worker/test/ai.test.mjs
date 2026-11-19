import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildAnthropicRequest,
  handleAnalyze,
  normalizeAnalyzeResult,
  parseAnalyzeBody
} from '../src/ai.js'

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...headers
    }
  })

const makeRequest = (body) => {
  const text = JSON.stringify(body)

  return new Request('https://w.example/ai/analyze', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'content-length': String(text.length)
    },
    body: text
  })
}

test('入力の検査: 画像がない・多すぎる・形が違うものは断る', () => {
  assert.equal(parseAnalyzeBody({ images: [] }), null)
  assert.equal(
    parseAnalyzeBody({
      images: Array.from({ length: 61 }, () => ({ data: 'QUJD' }))
    }),
    null
  )
  assert.equal(
    parseAnalyzeBody({ images: [{ data: 'not base64!' }] }),
    null
  )

  assert.deepEqual(
    parseAnalyzeBody({
      candidates: [' ONE PIECE ', 'ONE PIECE', ''],
      images: [{ data: 'QUJD' }]
    }),
    {
      candidates: ['ONE PIECE'],
      images: ['QUJD']
    }
  )
})

test('依頼の形: 候補と番号付きの画像を送り、報告の道具を必ず使わせる', () => {
  const request =
    buildAnthropicRequest({
      candidates: ['ONE PIECE', '呪術廻戦'],
      images: ['QUJD', 'REVG']
    })

  assert.equal(request.tool_choice.name, 'report_pages')
  assert.match(request.messages[0].content[0].text, /ONE PIECE \/ 呪術廻戦/)

  const images =
    request.messages[0].content.filter(
      (item) => item.type === 'image'
    )

  assert.equal(images.length, 2)
  assert.equal(images[1].source.data, 'REVG')
})

test('答えの整理: 候補にない作品名や範囲外の番号は捨てる', () => {
  const pages =
    normalizeAnalyzeResult(
      {
        content: [
          {
            type: 'tool_use',
            name: 'report_pages',
            input: {
              pages: [
                { index: 0, type: 'cover', series: ['ONE PIECE', '知らない作品'] },
                { index: 5, type: 'cover', series: [] },
                { index: 1, type: 'weird', series: ['読み切り'] }
              ]
            }
          }
        ]
      },
      3,
      ['ONE PIECE', '読み切り']
    )

  assert.deepEqual(pages, [
    { index: 0, type: 'cover', series: ['ONE PIECE'] },
    { index: 1, type: 'color', series: ['読み切り'] },
    { index: 2, type: 'color', series: [] }
  ])
})

test('API キーがなければ、設定がまだだと返す', async () => {
  const response =
    await handleAnalyze(
      makeRequest({ images: [{ data: 'QUJD' }] }),
      {},
      {},
      json
    )

  assert.equal(response.status, 501)
})

test('Claude API を呼んで、整えた答えを返す', async () => {
  let sent = null

  const response =
    await handleAnalyze(
      makeRequest({
        candidates: ['ONE PIECE'],
        images: [{ data: 'QUJD' }]
      }),
      { ANTHROPIC_API_KEY: 'sk-test' },
      {},
      json,
      async (url, init) => {
        sent = { url, init }

        return json(
          {
            content: [
              {
                type: 'tool_use',
                name: 'report_pages',
                input: {
                  pages: [
                    { index: 0, type: 'cover', series: ['ONE PIECE'] }
                  ]
                }
              }
            ],
            usage: { input_tokens: 1200, output_tokens: 40 }
          },
          200
        )
      }
    )

  assert.equal(sent.init.headers['x-api-key'], 'sk-test')
  assert.equal(JSON.parse(sent.init.body).model, 'claude-haiku-5-5')

  const body = await response.json()

  assert.deepEqual(body.pages, [
    { index: 0, type: 'cover', series: ['ONE PIECE'] }
  ])
  assert.equal(body.usage.inputTokens, 1200)
})

test('Claude API が失敗したら 502 を返す', async () => {
  console.error = () => {}

  const response =
    await handleAnalyze(
      makeRequest({ images: [{ data: 'QUJD' }] }),
      { ANTHROPIC_API_KEY: 'sk-test' },
      {},
      json,
      async () => json({ error: 'x' }, 500)
    )

  assert.equal(response.status, 502)
})
