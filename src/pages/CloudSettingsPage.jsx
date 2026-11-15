import { useState } from 'react'
import cloudClient, {
  RETRY_POLICY,
  SAFETY
} from '../utils/cloudClient'

const CLOUDFLARE_BILLING_URL =
  'https://dash.cloudflare.com/?to=/:account/billing'

function formatGb(bytes, bytesPerGb) {
  const gb = bytes / bytesPerGb

  if (gb < 0.01 && bytes > 0) {
    return '0.01 GB未満'
  }

  return `${gb.toFixed(2)} GB`
}

function formatCount(value) {
  return Number(value).toLocaleString(
    'ja-JP'
  )
}

function formatUsd(value) {
  return `$${Number(value).toFixed(2)}`
}

function formatDateTime(value) {
  const date = new Date(value)

  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('ja-JP')
}

function UsageMeter({
  label,
  valueLabel,
  ratio
}) {
  const percent =
    Math.max(0, ratio) * 100

  return (
    <div className="cloud-usage-meter">
      <div className="cloud-usage-meter-head">
        <span>{label}</span>
        <strong>{valueLabel}</strong>
      </div>

      <div
        className="cloud-usage-bar"
        role="img"
        aria-label={`${label}: 無料枠の${percent.toFixed(
          1
        )}%`}
      >
        <div
          className={
            ratio >= 1
              ? 'cloud-usage-bar-fill over'
              : ratio >= 0.8
                ? 'cloud-usage-bar-fill near'
                : 'cloud-usage-bar-fill'
          }
          style={{
            width: `${Math.min(
              100,
              Math.max(
                percent,
                percent > 0 ? 1 : 0
              )
            )}%`
          }}
        />
      </div>

      <div className="cloud-usage-meter-foot">
        無料枠の{' '}
        {percent < 0.1 && percent > 0
          ? '0.1%未満'
          : `${percent.toFixed(1)}%`}
        {ratio >= 1
          ? '（超過分は課金されます）'
          : ''}
      </div>
    </div>
  )
}

function UsagePanel({ usage }) {
  const {
    pricing,
    storage,
    operations,
    estimate
  } = usage

  const freeBytes =
    pricing.free.storageGb *
    pricing.bytesPerGb

  return (
    <div className="cloud-usage">
      <div className="cloud-usage-cost">
        <span>今月の推定課金額</span>
        <strong>
          {formatUsd(estimate.totalUsd)}
        </strong>
        <small>
          {estimate.totalUsd === 0
            ? estimate.complete
              ? '無料枠の範囲内です'
              : '保存量は無料枠の範囲内です'
            : '無料枠を超えた分の概算です'}
        </small>
      </div>

      <UsageMeter
        label={`保存量（${formatCount(
          storage.objects
        )}ファイル）`}
        valueLabel={`${formatGb(
          storage.bytes,
          pricing.bytesPerGb
        )} / ${pricing.free.storageGb} GB`}
        ratio={storage.bytes / freeBytes}
      />

      {operations ? (
        <>
          <UsageMeter
            label="今月の書き込み・一覧"
            valueLabel={`${formatCount(
              operations.classA
            )} / ${formatCount(
              pricing.free.classA
            )} 回`}
            ratio={
              operations.classA /
              pricing.free.classA
            }
          />

          <UsageMeter
            label="今月の読み出し"
            valueLabel={`${formatCount(
              operations.classB
            )} / ${formatCount(
              pricing.free.classB
            )} 回`}
            ratio={
              operations.classB /
              pricing.free.classB
            }
          />
        </>
      ) : (
        <p className="cloud-settings-note">
          {usage.analyticsError
            ? '操作回数を取得できませんでした。APIトークンの設定を確認してください。'
            : '操作回数は未設定のため表示していません。表示するには、Worker に API トークンを登録します（worker/README.md の手順4）。'}
        </p>
      )}

      {usage.truncated && (
        <p className="cloud-settings-note">
          ファイル数が多いため、保存量は一部だけを数えた値です。
        </p>
      )}

      <p className="cloud-settings-note">
        {formatDateTime(usage.fetchedAt)}{' '}
        時点。金額は {pricing.checkedAt}{' '}
        時点の料金表による概算で、実際の請求額は Cloudflare の画面で確認できます。
      </p>

      <a
        className="cloud-settings-link"
        href={CLOUDFLARE_BILLING_URL}
        target="_blank"
        rel="noreferrer"
      >
        Cloudflare で請求を確認する
      </a>
    </div>
  )
}

function CloudSettingsPage({ navigate }) {
  const [config, setConfig] =
    useState(() =>
      cloudClient.loadConfig()
    )

  const [message, setMessage] =
    useState(null)

  const [usage, setUsage] =
    useState(null)

  const [busy, setBusy] =
    useState('')

  const [status, setStatus] =
    useState(() =>
      cloudClient.getStatus()
    )

  const refreshStatus = () => {
    setStatus(cloudClient.getStatus())
  }

  const run = async (name, action) => {
    setBusy(name)
    setMessage(null)

    try {
      await action()
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error?.message ||
          '失敗しました。'
      })
    } finally {
      setBusy('')
      refreshStatus()
    }
  }

  const handleSave = () => {
    const saved =
      cloudClient.saveConfig(config)

    setConfig(saved)
    refreshStatus()

    if (!saved.endpoint) {
      setMessage({
        type: 'error',
        text: '接続先は https:// で始まるURLを入力してください。'
      })
      return false
    }

    if (!saved.token) {
      setMessage({
        type: 'error',
        text: '合言葉を入力してください。'
      })
      return false
    }

    setMessage({
      type: 'ok',
      text: '保存しました。'
    })
    return true
  }

  const handleTest = () => {
    if (!handleSave()) {
      return
    }

    run('test', async () => {
      await cloudClient.testConnection()

      setMessage({
        type: 'ok',
        text: '接続できました。'
      })
    })
  }

  const handleUsage = (refresh) => {
    run('usage', async () => {
      setUsage(
        await cloudClient.getUsage({
          refresh
        })
      )
    })
  }

  return (
    <div className="app">
      <div className="series-page-header">
        <button
          className="back-button"
          onClick={() => navigate('/')}
        >
          ← 戻る
        </button>

        <div className="title series-page-title">
          クラウド設定
        </div>

        <div />
      </div>

      <div className="cloud-settings">
        <section className="cloud-settings-section">
          <h2>接続先</h2>

          <label className="cloud-settings-field">
            <span>接続先URL</span>
            <input
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="https://manga-images.xxxx.workers.dev"
              value={config.endpoint}
              onChange={(event) =>
                setConfig({
                  ...config,
                  endpoint:
                    event.target.value
                })
              }
            />
          </label>

          <label className="cloud-settings-field">
            <span>合言葉</span>
            <input
              type="password"
              autoComplete="off"
              value={config.token}
              onChange={(event) =>
                setConfig({
                  ...config,
                  token: event.target.value
                })
              }
            />
          </label>

          <p className="cloud-settings-note">
            この端末の中だけに保存されます。iPhone と iPad それぞれで入力してください。
          </p>

          <div className="cloud-settings-actions">
            <button
              type="button"
              onClick={handleSave}
              disabled={Boolean(busy)}
            >
              保存
            </button>

            <button
              type="button"
              className="cloud-settings-secondary"
              onClick={handleTest}
              disabled={Boolean(busy)}
            >
              {busy === 'test'
                ? '確認中…'
                : '接続テスト'}
            </button>
          </div>

          {message && (
            <div
              className={
                message.type === 'error'
                  ? 'cloud-settings-message error'
                  : 'cloud-settings-message'
              }
              role="status"
            >
              {message.text}
            </div>
          )}
        </section>

        <section className="cloud-settings-section">
          <h2>使用状況と課金</h2>

          {usage ? (
            <UsagePanel usage={usage} />
          ) : (
            <p className="cloud-settings-note">
              保存量、今月の操作回数、推定課金額を確認できます。
            </p>
          )}

          <div className="cloud-settings-actions">
            <button
              type="button"
              onClick={() =>
                handleUsage(Boolean(usage))
              }
              disabled={
                Boolean(busy) ||
                !status.configured
              }
            >
              {busy === 'usage'
                ? '取得中…'
                : usage
                  ? '更新'
                  : '使用状況を見る'}
            </button>
          </div>
        </section>

        <section className="cloud-settings-section">
          <h2>通信の安全装置</h2>

          <ul className="cloud-settings-list">
            <li>
              再試行は1回の操作につき最大{' '}
              {RETRY_POLICY.maxAttempts - 1}{' '}
              回まで（合計{' '}
              {RETRY_POLICY.maxAttempts}{' '}
              回）
            </li>
            <li>
              {SAFETY.breakerFailures}{' '}
              回続けて失敗すると{' '}
              {SAFETY.breakerCooldownMs /
                60000}{' '}
              分間、通信を止める
            </li>
            <li>
              通信は1分あたり{' '}
              {SAFETY.maxRequestsPerMinute}{' '}
              回まで
            </li>
          </ul>

          <p className="cloud-settings-note">
            アプリを開いてからの通信:{' '}
            {formatCount(status.requests)}{' '}
            回（うち再試行{' '}
            {formatCount(status.retries)}{' '}
            回、失敗{' '}
            {formatCount(status.failures)}{' '}
            回）
          </p>

          {status.paused && (
            <div className="cloud-settings-message error">
              失敗が続いたため、
              {formatDateTime(
                status.pausedUntil
              )}{' '}
              まで通信を止めています。
              <button
                type="button"
                className="cloud-settings-secondary"
                onClick={() => {
                  cloudClient.resumeAfterPause()
                  refreshStatus()
                }}
              >
                今すぐ再開
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default CloudSettingsPage
