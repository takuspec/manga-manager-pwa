// テスト用の R2 バケットの代役（メモリ上に保存する）

async function toBytes(body) {
  if (body == null) {
    return new Uint8Array()
  }

  return new Uint8Array(
    await new Response(body).arrayBuffer()
  )
}

export class FakeBucket {
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
