★3楽曲解説プロジェクトの次の1バッチを完走する。`/loop /next-batch` から毎ティック呼ばれる想定。
このコマンド自体はリポジトリ内の状態（`work-ledger.json`）だけを進捗の正とする — 会話履歴を
遡って前回の続きを推測しないこと。`/clear` 直後でも、このファイルと台帳だけで再開できる。

## 前提: usage ゲート

このコマンドを呼ぶ側（`/loop` のティック）が `~/.claude/scripts/usage_gate.py` で
`go` 判定を確認済みという前提で動く。バッチの途中で usage を再チェックしない —
**開始したら PR まで完走する**。

## 手順

1. **選ぶ**: `npm run seed:work-ledger -- --report` で todo 数が最多の作曲家を確認する。
   - 8曲以上の作曲家: 1作曲家=1バッチ。15曲以上なら概ね半分に分割
   - 3〜7曲: 3〜4人まとめて1バッチ
   - 1〜2曲: 時代・国籍が近い作曲家を約10人（≒12曲）まとめて1バッチ
   - バッチサイズは上限14

2. **調査**: 3〜4曲ごとに1体、Agent（general-purpose、background不要・foreground可）を並列起動する。
   プロンプトの必須条件:
   - 「事実の箇条書きのみを返せ。日本語でも英語でも散文・下書きコピーを書くな。
     いかなる出典からも4語を超える連続引用をするな。各事実に出典種別
     （Wikipedia / IMSLP / 出版社 / 楽譜序文）を付けよ」
   - 出力上限: 1曲あたり最大12行、レポート全体で最大60行。表や前置き・まとめの散文は書かない
   - 必須項目: 作曲年、初演（日付・場所・演奏者）、献呈先、楽章一覧（速度標語・調）、
     編成の特記事項、出版年、愛称の由来、受容または逸話を1点（伝説なら`UNCERTAIN`と明記）、
     **生没年の範囲外の年号を全て明示的にフラグ**
   - 作曲年+検証可能な事情1点すら返せないなら`THIN`を返す

3. **執筆**: `data/editorial/works/<composerId>.json` に追記する。分量仕様は
   `CONTRIBUTING.md` の「★3解説の長さと構成」節に従う（ja/enとも1段落、structure/story
   それぞれの目標字数・語数、年号は両フィールド合計2つまで）。
   - `THIN`の曲は`structure`のみ書き`story`を省く
   - `structure`すら書けないなら台帳を`skip`にし`note`に理由を書く。**物語を創作しない**

4. **`npx tsx scripts/seed/build-editorial.ts`** — 集約を再生成。**5の前に必ず実行**

5. **`npm run check:work-editorial -- <id...>`** — バッチのidのみ（`--all`は使わない）。
   - 年号失敗: その年が正しい場合のみ`work-facts.json`に`extraYears`を追記
   - 類似度失敗: 書き直す。曲名自体が長すぎて引っかかる場合のみ`work-facts.json`の
     `allowedPhrases`に曲名を一字一句そのまま追記（`CONTRIBUTING.md`の該当節参照）
   - 修正したら4から再実行

6. **`npm run seed:work-ledger -- --sync`**。`skip`にした曲があれば`note`を手で書く

7. **`npm test && npm run lint && npm run build`**

8. **スポットチェック**:
   ```
   npm run dev -- --port 3100    # バックグラウンドで起動しておく
   ```
   バッチから2件（両フィールドありのものと、あればstructureのみのもの）を
   `http://localhost:3100/ja/works/<id>` と `/en/works/<id>` で開き、「解説」セクションが
   出て「まだ準備中です」の点線ボックスが消えていることを確認する。

9. **コミット** — `data/editorial/works/<id>.json`（1〜4ファイル）、`works.json`、
   `work-ledger.json`、（あれば）`work-facts.json`。コミットメッセージ:
   ```
   editorial: ★3 <作曲家名> バッチN <M>曲分のstructure/storyを追加 (#PR)

   <日本語の曲名を全件列挙、読点区切り>。

   check:work-editorial で<M>曲全件パスを確認。work-facts.json に <id>(<年>) を記録。
   ★3進捗: X/442。
   ```
   1バッチ1ブランチ・1PR、squash-merge。**同時に開くバッチPRは常に1本**
   （全バッチが`works.json`・`work-ledger.json`・`work-facts.json`を触るため）。
   PRを作成したらマージまで行い、`main`を最新化してから終える。

10. **★3のtodoが0なら**、その旨を報告してループを終了する（★2は別途スコープ拡大の判断が要る）。
    todoが残っていれば、このティックの成果（バッチ番号・曲数・PR番号）を1〜2行で要約して終える。

## 参照

- `CONTRIBUTING.md`「楽曲の解説文を書く」節 — スキーマ、分量仕様、`allowedPhrases`、進捗管理
- `data/editorial/work-facts.json` — 生没年外の年号の許可リスト、`allowedPhrases`
- `scripts/seed/check-work-editorial.ts` — 年号・類似度チェック本体
- `scripts/seed/build-work-ledger.ts` — 台帳の唯一の変更手段（`--report`/`--sync`）
