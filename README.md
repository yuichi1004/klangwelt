# Klangwelt

クラシック音楽を「探して、知って、聴く」ためのポータルサイト。作曲家・年代・定番度・ジャンルで絞り込み、楽曲ごとの解説を読み、Spotify / YouTube Music へワンクリックで飛べる。日本語と英語に対応。

A classical music portal: browse by composer, period, how standard a work is, and genre, read notes on each work, and jump straight to Spotify or YouTube Music. Japanese and English.

## 構成

Next.js 16（App Router）を `output: "export"` で完全静的出力する。サーバーレス関数も middleware も使わないため、Vercel の無料枠では帯域以外を消費しない。

| | |
|---|---|
| 作曲家 | 220名 |
| 楽曲（詳細ページあり） | 約1,300曲（`data/curation/` によるキュレーションで増減する） |
| 楽曲（作曲家ページから閲覧可） | 25,195曲 |
| 肖像画 | 213点（すべてライセンス検証済み） |
| 生成ページ数 | 約3,000（2言語） |

```
assets/brand/            ロゴ原画（アイコン生成の元、配信はしない）
data/
  raw/openopus.json      Open Opus の生レスポンス（シード時に取得、コミット済み）
  catalog/               配信用に整形した JSON（サーバーコンポーネントが直接 import）
  ja/                    手書きの日本語データ（作曲家名・曲名の訳）
  editorial/             手書きの解説文（日英）
  curation/              手書きの定番度（★1〜5。ranking.json が★5の並び順）
  portraits.json         肖像画1点ごとの出典・ライセンス台帳
public/
  index.html             `/` の言語振り分け（静的、JS のみ）
  favicon.ico, icon-*.png, apple-touch-icon.png
  portraits/             肖像画
  data/                  遅延ロードされる JSON（全曲インデックス・作曲家別全作品）
scripts/seed/            データ取得・生成スクリプト（手動実行）
src/lib/title/           英語タイトルの解析と和訳エンジン
```

## 開発

```bash
npm install
npm run dev        # http://localhost:3000/ja
npm test           # Vitest（ロジック・データ整合性・ライセンス検証）
npm run test:e2e   # Playwright（デスクトップ + モバイル実機相当）
npm run build      # out/ に静的出力
npx serve out      # 出力を静的配信して確認
```

## ブラウザ自動化

システムにインストール済みの Chrome を使うため、Playwright のブラウザダウンロードも `install-deps`（要 root）も不要。

- `npm run test:e2e` — 絞り込み・お気に入り・レスポンシブ・言語切替の E2E。`playwright.config.ts` の `webServer` が `next dev` を自動起動する。
- `npm run test:e2e:ui` — ステップを追いながらデバッグする UI モード。
- `.mcp.json` — Claude Code 用の Playwright MCP。承認して Claude Code を再起動すると、対話的にページを開いて確認できるようになる。

## データの更新

シードスクリプトはビルド時ではなく手動で実行する。生成物をコミットすることで、`next build` が外部 API の障害やレート制限に左右されなくなる。

```bash
npm run seed:openopus    # Open Opus から作曲家・楽曲を取得（約2分）
npm run seed:portraits   # Wikidata/Commons から肖像画を取得（約15分）
npm run seed:catalog     # 配信用 JSON を生成（数秒）
npm run build:icons      # assets/brand のロゴから favicon 一式を生成
```

`seed:catalog` は他の2つの出力と `data/ja/`・`data/editorial/`・`data/curation/` を読むので、日本語データ・解説文・定番度を書き足したあとは必ず再実行する。定番度の書き方は `CONTRIBUTING.md` を参照。

## デプロイ

Vercel にリポジトリを接続するだけでよい。Next.js が自動検出され、`out/` が配信される。`vercel.json` は不要。

| 項目 | 消費 |
|---|---|
| サーバーレス関数呼び出し | 0 |
| Image Optimization | 0（`images.unoptimized`、肖像画は自前ホスト） |
| 実行時の外部 API | なし |

[Vercel Web Analytics](https://vercel.com/docs/analytics) を有効化している。`@vercel/analytics/next` の `<Analytics />` をルートレイアウト（`src/app/[locale]/layout.tsx`）に置くだけの構成で、サーバーレス関数は使わない。訪問データは Vercel ダッシュボードの Analytics タブで確認できる。

## ライセンスと出典

- **楽曲・作曲家メタデータ**: [Open Opus](https://openopus.org/) — CC0 1.0（パブリックドメイン）。同プロジェクトの PHP 実装は GPLv3 だが、本プロジェクトはコードを一切利用していないため GPL は及ばない。
- **肖像画**: Wikimedia Commons。Wikidata の P18 プロパティ経由で取得し、パブリックドメインまたは CC のフリーライセンスと確認できたものだけを採用している。Open Opus も肖像画を配布しているが、1点ごとの出典・ライセンスを開示しておらず、収録作曲家220名のうち72名は1955年以降に没または存命であるため、再配布は避けた。判定ロジックは `src/lib/licenses.ts`、台帳は `data/portraits.json`、検証テストは `src/lib/licenses.test.ts` にある。
- **ロゴ・ファビコン**: `assets/brand/klangwelt-k.jpg` を元に生成。本プロジェクト固有の素材。
- **解説文**: 本プロジェクトのために書き下ろしたもの。執筆時の注意は [CONTRIBUTING.md](./CONTRIBUTING.md) を参照。
- **Spotify / YouTube Music**: 各サービスの検索ページへのリンクのみ。本サイトは両社と提携関係にない。

サイト上の全出典は `/ja/credits`（`/en/credits`）で確認できる。
