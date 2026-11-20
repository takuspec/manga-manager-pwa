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

test('入力の検査: 種類・画像・候補の形が違うものは断る', () => {
  assert.equal(parseAnalyzeBody({ task: 'x', image: 'QUJD' }), null)
  assert.equal(parseAnalyzeBody({ task: 'classify', image: 'not base64!' }), null)
  assert.equal(parseAnalyzeBody({ task: 'series', image: 'QUJD', candidates: [] }), null)
  assert.equal(
    parseAnalyzeBody({ task: 'series', image: 'QUJD', toc: '!!', candidates: ['A'] }),
    null
  )

  assert.deepEqual(
    parseAnalyzeBody({
      task: 'series',
      image: 'QUJD',
      toc: 'REVG',
      candidates: [' ONE PIECE ', 'ONE PIECE', '']
    }),
    {
      task: 'series',
      magazine: '',
      image: 'QUJD',
      toc: 'REVG',
      candidates: ['ONE PIECE']
    }
  )
})

test('依頼の形: 1回に1枚。作品の判定には目次を添えられる', () => {
  const classify =
    buildAnthropicRequest({
      task: 'classify',
      image: 'QUJD',
      toc: null,
      candidates: []
    })

  assert.equal(classify.tool_choice.name, 'report_type')
  assert.equal(
    classify.messages[0].content.filter((item) => item.type === 'image').length,
    1
  )

  const series =
    buildAnthropicRequest({
      task: 'series',
      image: 'QUJD',
      toc: 'REVG',
      candidates: ['ONE PIECE', '呪術廻戦']
    })

  const images =
    series.messages[0].content.filter((item) => item.type === 'image')

  assert.equal(series.tool_choice.name, 'report_series')
  assert.deepEqual(
    images.map((item) => item.source.data),
    ['QUJD', 'REVG']
  )
  assert.match(
    series.messages[0].content.at(-1).text,
    /ONE PIECE \/ 呪術廻戦/
  )
})

test('答えの整理: 知らない種類はカラー、候補にない作品名は捨てる', () => {
  const answer = (input) => ({
    content: [{ type: 'tool_use', name: 'x', input }]
  })

  assert.deepEqual(
    normalizeAnalyzeResult(answer({ type: 'weird' }), { task: 'classify' }),
    { type: 'color' }
  )
  assert.deepEqual(
    normalizeAnalyzeResult(answer({ type: 'toc' }), { task: 'classify' }),
    { type: 'toc' }
  )
  assert.deepEqual(
    normalizeAnalyzeResult(
      answer({ series: ['ONE PIECE', '知らない作品', '読み切り'] }),
      { task: 'series', candidates: ['ONE PIECE', '読み切り'] }
    ),
    { series: ['ONE PIECE', '読み切り'] }
  )
})

test('API キーがなければ、設定がまだだと返す', async () => {
  const response =
    await handleAnalyze(
      makeRequest({ task: 'classify', image: 'QUJD' }),
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
        task: 'series',
        image: 'QUJD',
        candidates: ['ONE PIECE']
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
                name: 'report_series',
                input: { series: ['ONE PIECE'] }
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

  assert.deepEqual(body.series, ['ONE PIECE'])
  assert.equal(body.usage.inputTokens, 1200)
})

test('Claude API が混んでいたら 429、失敗なら 502 を返す', async () => {
  console.error = () => {}

  const busy =
    await handleAnalyze(
      makeRequest({ task: 'classify', image: 'QUJD' }),
      { ANTHROPIC_API_KEY: 'sk-test' },
      {},
      json,
      async () =>
        new Response('{}', {
          status: 429,
          headers: { 'retry-after': '5' }
        })
    )

  assert.equal(busy.status, 429)
  assert.equal(busy.headers.get('retry-after'), '5')

  const failed =
    await handleAnalyze(
      makeRequest({ task: 'classify', image: 'QUJD' }),
      { ANTHROPIC_API_KEY: 'sk-test' },
      {},
      json,
      async () => json({ error: 'x' }, 500)
    )

  assert.equal(failed.status, 502)
})

test('クレジット切れなど（Claude API の 400・401）は 402 を返す', async () => {
  console.error = () => {}

  for (const status of [400, 401, 403]) {
    const response =
      await handleAnalyze(
        makeRequest({ task: 'classify', image: 'QUJD' }),
        { ANTHROPIC_API_KEY: 'sk-test' },
        {},
        json,
        async () => json({ error: { type: 'invalid_request_error' } }, status)
      )

    assert.equal(response.status, 402)
  }
})
