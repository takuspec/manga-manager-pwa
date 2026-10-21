# スマホから修正・公開する

## 最初の1回：Codex Cloud

1. WebまたはデスクトップのCodexで「Work in → Cloud → Create environment」を選ぶ（画面の表記は提供状況により異なる）。
2. GitHub連携で `takuspec/manga-manager-pwa` を選択する。
3. Node.js 24、インストールコマンド `npm ci`、確認コマンド `npm run build` を指定する。
4. 環境の準備・検証結果を確認し、Publishで保存する。
5. スマホのCodexでこの環境を選び、修正を依頼する。

GitHubの認証・接続は利用者のアカウントで行う。トークンをチャットやリポジトリに貼り付ける必要はない。

## 毎回の作業

依頼例：

> 作者名で検索できるようにして。既存の読了データを維持して、ビルドを確認し、PRを作って。

変更確認後の依頼例：

> このPRをmainに取り込み、GitHub Pagesへの公開成功まで確認して。

PRではActionsがビルドを確認する。mainへ取り込むと同じワークフローが自動公開する。

- 公開先：https://takuspec.github.io/manga-manager-pwa/
- 実行結果：https://github.com/takuspec/manga-manager-pwa/actions
- Pages設定：https://github.com/takuspec/manga-manager-pwa/settings/pages

Pagesの公開元は「GitHub Actions」を使用する。手動再実行はActionsの「Build and deploy Pages → Run workflow」でmainを選ぶ。

アプリの読了データは各端末のブラウザー内にあり、GitHubやCodex Cloudには自動同期されない。保存処理の変更前にはアプリからバックアップする。

## ローカル開発

```sh
npm ci
npm run dev
npm run build
npm run lint
```

公開後に古い画面が出る場合はアプリを閉じて再度開く。データを失うため、ブラウザーのサイトデータ消去で更新しない。
