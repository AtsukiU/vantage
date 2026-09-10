# 株式ニュースダッシュボード

日本株・米国株それぞれの直近24時間のニュースを、RSSフィードから収集してまとめて表示するフルスクリーンのローカルWebアプリです。上部には主要指数(日経平均・TOPIX・ドル円・S&P500・NYダウ・NASDAQ・VIX)が流れるティッカーがあり、各市場のニュースはClaudeによる要約付きで確認できます。

## 使っているニュースソース(無料RSS・APIキー不要)

- 日本株: Yahoo!ニュース(経済)、Google ニュース
- 米国株: Yahoo Finance、MarketWatch、CNBC、Google News

`src/lib/feeds.ts` にフィード一覧があるので、ソースの追加・変更はここを編集してください。指数ティッカーの銘柄は `src/lib/quotes.ts` で変更できます。

## Claude によるニュース要約

各市場タブの上部に、その日の見出しをClaudeが日本語で要約した「本日のまとめ」が表示されます。利用するには `ANTHROPIC_API_KEY` が必要です。

1. `.env.local.example` を `.env.local` にコピー
2. [console.anthropic.com](https://console.anthropic.com/) で取得したAPIキーを `ANTHROPIC_API_KEY` に設定

キー未設定の場合、要約カードにはエラーメッセージが表示されますが、ニュース一覧自体は通常通り動作します。要約は15分間キャッシュされ、「再生成」ボタンで即座に更新できます。

## Node.js について

このPCのグローバルなNode.jsはバージョンが古く(Nodist管理のv11)、Next.jsの動作要件(v18.18+)を満たさないため、`.nodejs/` にNode.js 22の可搬版を同梱しています(gitignore済み)。

開発サーバーを起動する場合は、PATHにこのNode.jsを通してから実行してください。

```bash
# PowerShellの例
$env:PATH = "$PWD\.nodejs\node-v22.14.0-win-x64;$env:PATH"
npm run dev
```

または同梱の `dev.cmd` を実行してください。

```bash
.\dev.cmd
```

[http://localhost:3000](http://localhost:3000) で確認できます。

## 構成

- `src/lib/feeds.ts` — RSSフィード一覧(市場ごと)
- `src/lib/news.ts` — フィード取得・パース・重複排除・時間フィルタ
- `src/app/api/news/route.ts` — `/api/news?market=jp|us` ニュース取得API
- `src/components/NewsFeed.tsx` — ニュース一覧のUI(自動更新付き)
- `src/app/page.tsx` — 日本株/米国株タブの画面
