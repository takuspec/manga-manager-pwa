# 画像置き場（Cloudflare Worker + R2）

manga-manager の画像をクラウドに置くための小さなサーバーです。
R2 バケットは非公開のまま、この Worker だけが読み書きします。

## できること

| 操作 | 内容 |
|---|---|
| `GET /health` | 接続テスト |
| `GET /usage` | 保存量、今月の操作回数、推定課金額 |
| `PUT /files/<名前>` | 画像・索引の保存（1ファイル 20MB まで） |
| `GET /files/<名前>` | 取り出し |
| `DELETE /files/<名前>` | 削除 |

すべての操作に合言葉（`Authorization: Bearer <AUTH_TOKEN>`）が必要です。
保存できるのは jpg / jpeg / png / webp / json だけです。

## 初回の設定

PC のターミナルで、この `worker` フォルダに移動して実行します。

1. Cloudflare にログインする

   ```
   npx wrangler login
   ```

2. 合言葉を登録する（長くて推測されにくい文字列にする）

   ```
   npx wrangler secret put AUTH_TOKEN
   ```

3. 公開する

   ```
   npx wrangler deploy
   ```

   表示された `https://manga-images.<アカウント名>.workers.dev` が接続先URLです。
   アプリの「クラウド設定」に、この URL と合言葉を入力します。

4. （任意）操作回数も表示する

   Cloudflare の画面で「Account Analytics: Read」権限だけの API トークンを作り、登録します。

   ```
   npx wrangler secret put CF_API_TOKEN
   npx wrangler secret put CF_ACCOUNT_ID
   ```

   登録しない場合、保存量と保存分の推定額だけが表示されます。

## 動作確認

リポジトリの一番上のフォルダで実行します（Cloudflare には接続しません）。

```
node --test "worker/test/*.test.mjs"
```

## 注意

- 合言葉や API トークンは、このフォルダのファイルに書かないでください（リポジトリは公開されています）。
- バケット名を変える場合は `wrangler.toml` の `bucket_name` と `BUCKET_NAME` の両方を直します。
- 料金表は `src/index.js` の `PRICING` にあります。Cloudflare が料金を変えたらここを直します。
