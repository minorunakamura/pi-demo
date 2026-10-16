# リバーシ — CPU対戦

Vite + vanilla TypeScript / HTML / CSSで動く、PC Chrome向けのリバーシです。起動すると黒（あなた）対白（CPU）の対局が始まり、パス・終局・再戦まで遊べます。対局はブラウザのメモリ内だけに保持し、保存・復元や対人戦は行いません。

## セットアップ・起動

確認基準：Node **24.21.0**、npm **11.19.0**。

```sh
npm ci
npm run dev
```

表示されたローカルURL（通常 `http://localhost:5173`）をChromeで開きます。HTMLファイルの直接起動、スマートフォン、他ブラウザは対象外です。

## 操作

- 黒が先手。初期配置は白D4/E5、黒E4/D5、石数は2対2です。左上がA1、右下がH8です。
- `＋` のある合法手をクリックするか、Tabで移動してEnter / Spaceで着手します。最初の合法手はD3/C4/F5/E6です。
- 石には「黒」「白」を表示し、直前の着手は `★` と枠、および文字で示します。手番・石数・思考中・パス・勝敗はstatus領域で通知します。
- 各マスのaccessible nameは座標と石の状態を含みます。盤面のbuttonは描画時に作り直さず、focusを保持します。
- 着手できないマスは `aria-disabled` で示し、入力も拒否します。石の状態を確認できるようTab移動の対象には残しています。
- 白の手番はCPUが自動で着手します。思考中の盤面入力は無効ですが、「最初から」は操作できます。
- 合法手がない側は理由を表示して自動パスします。双方が打てなければ空きマスがあっても終局し、最終盤面・石数・勝敗を表示します。同数は引き分けです。
- 対局中は「最初から」、終局後は「もう一度遊ぶ」で即座に初期状態へ戻ります。古いCPU応答は新しい対局に反映しません。再読み込みでも初期化されます。

## CPUと制約

CPUは共有ルールを使い、白視点で角・双方の合法手数・石数を評価する固定の最大2着手読み（minimax）です。パスは着手数に数えず、終局では勝敗を優先します。同点は行優先の先頭候補を選び、乱数・難易度選択・深い探索はありません。

CPU手番ごとにWeb Workerを起動し、完了・失敗・再開始時に終了します。探索予算は最大800ms、main側の監視は900msです。探索が間に合わなければ完了済みの浅い読み、または先頭合法手を採用します。Workerの起動・送信失敗、`error` / `messageerror`、不正応答、監視期限超過もcontrollerで一度だけ合法な代替手に確定します。

**対象PCの前面タブで32手番を実測し、着手の描画を挟む観測まで全件1秒以内（この32件の最大30.0ms）でした。** 環境・棋譜・全測定値と、開始点が異なる参考測定246.6msは後述します。800ms/900msは実時間保証ではなく、OS停止やバックグラウンド制限、ブラウザのスケジューリング遅延は制御できません。ユーザーは同じMac Chromeの無改変previewで2局遊び、「気軽に楽しめた」と回答しました。

## チェック・build成果物の確認

```sh
npm test
npm run typecheck
npm run build
npm run preview
```

`preview` のローカルURL（通常 `http://localhost:4173`）でbuild成果物を確認できます。`dev` / `preview` はCtrl+Cで終了します。

- `npm test`：Node標準test runnerで `tests/*.test.ts` を直接実行します。
- `npm run typecheck`：browser（DOM）・Worker（WebWorker）・Nodeテストのglobal型を分離して検査します。共有するstrict設定は各構成で維持します。
- `npm run build`：ViteでWorker chunkを含む成果物を `dist/` に出力します。型検査は上記の別コマンドで実行してください。
- lint scriptはありません。runtime依存はなく、dev依存はVite・TypeScript・`@types/node`のみで、バージョンはlockfileに固定しています。

### 自動テストの対象

期待値は初期配置の仕様と手計算の小局面に基づき、公開境界を検証します。

- `tests/rules.test.ts`：初期配置・合法手・8方向の反転・盤端・入力拒否・不変性・両色のパス/連続手番・満杯/空きあり終局・勝敗/引き分け（13 tests）。
- `tests/cpu.test.ts`：合法手/合法手なし・角/終局/パスの判断・入力不変性・注入時計での期限切れと未完了探索のfallback（15 tests）。
- `tests/game.test.ts`：人間の入力制限・CPU応答/失敗/起動例外/不正応答・900ms監視・完了との競合・cleanup・思考中の再開始と旧応答破棄・パス説明の保持/クリア/更新・終局/再戦（17 tests）。

`npm test`（45 tests）、`npm run typecheck`、`npm run build` の成功を確認しています。自動テストではDOMや実Workerを模倣せず、実Chromeの通信・描画・操作は別途確認します。

### Chromeでの確認済み結果（Issue #3）

対象はユーザーが承諾した **Apple M1 Pro / 32GiB / macOS 26.6（25G72）/ Chrome 155.0.8059.82 / Node 24.21.0 / npm 11.19.0**。検証対象のsourceは `4ad8a465` です。headlessではないChromeの前面タブ、CPU throttlingなし（CDP rate=1）、viewport 1200×1459 CSS px / DPR 2で確認しました。

- `npm ci` → `npm test` → `npm run typecheck` → `npm run build` はすべてexit 0。45 tests成功、0 vulnerabilities。`npm ci` には既存の `fsevents@2.3.3` install-script未承認の警告があります。設定変更・警告抑制はしていません。
- `dev`（`http://127.0.0.1:5174/`）と `preview`（`http://127.0.0.1:4174/`）で実Workerを使い、黒が毎回行優先の先頭合法手を選ぶ1局ずつを終局（黒7対白57）まで確認しました。初期配置・4合法手、マウス着手と反転、空きの非合法/占有マス/CPU手番中/終局後の入力拒否、文字の手番・石数・思考中・勝敗、`＋` の合法手と `★` / 枠 / 座標の直前手、再戦を確認しました。
- native keyboardイベントのTab / Enter / SpaceのみでD3への着手と再開始を確認しました。CPU応答後は黒3対白3となり、D3のfocusが保持され、白い4pxのvisible focus（offset 3px）が描画後も見えることを確認しました。
- `dev` で下記の既存test fixtureを一時的なCDP response overrideから `createGame` の第3引数へ渡し、黒/白それぞれの自動パスと連続手番、パス理由と次の手番の併記、黒パス後の白連続2手を終局まで確認しました。空き1マスの白勝ち、空き62マスの1対1の引き分け、満杯32対32の引き分け、終局後の入力拒否と再戦も確認しました。
- 実Workerが返したresponseを一時保留し、思考中の再開始を3回行いました。CPU中の盤面入力を拒否し、初期盤面に戻り、新しい白手番中に古いcallbackを呼んでも盤面が変わらず、新しい応答だけが反映されることを確認しました。この保留操作は性能測定には使っていません。
- overrideと新規document用の計測scriptを解除してreloadし、検証用入口がない通常の `dev` で再度D3→CPU応答（3対3）を確認しました。その後、無改変の `preview` で `assets/cpu.worker-QizSlZig.js` の実リクエスト、1局、再開始、再度のCPU応答を確認しました。検証中のconsole error / uncaught exceptionは0件。恒久的なharness・盤面編集機能・隠し入口は追加していません。

- Rootも実差分と一時harnessを読み、`npm test`（45 pass）、`npm run typecheck`、`npm run build`、`git diff --check`、`node /tmp/pi-demo-issue3/validate-report.mjs` がすべてexit 0となることを確認し、32件のデータを棋譜・CPU選択・READMEへ照合しました。
- Rootは無改変previewの別newPageでも、実Worker chunk `cpu.worker-QizSlZig.js` の1リクエスト、不正/CPU手番中の入力拒否、D3→C5で3対3、focus保持、文字表示、再開始で2対2、console error 0を確認しました。click前からCPU着手後のdouble rAFまでは参考値28.5msでした（根拠：`/tmp/pi-demo-issue3/root-direct.mjs`）。

先行Issue #2でRootが確認した、同期的なWorker起動失敗時の代替手とパス説明の保持も既存の確認結果です。今回の性能結果とは分けて扱います。

### Chromeでの手動確認

`dev` と `preview` のそれぞれで確認します。特にpreviewではWorker chunkの読込みとconsoleエラーの有無も確認してください。

1. 白D4/E5・黒E4/D5、2対2、黒の合法手4つを表示する。空きの非合法マス・占有マスでは変化しない。
2. 黒の着手で石が反転し、白の「思考中」表示後にCPUが合法手を打ち、手番・石数・直前手が更新される。CPU中の追加着手は拒否される。
3. Tabのfocusが見え、Enter / Spaceで合法手を選べる。着手とCPU応答の描画後も同じ盤面buttonのfocusが残る。キーボードで再開始もできる。
4. 思考中の「最初から」を繰り返し、旧対局の白石が初期盤面へ混ざらない。速すぎる場合だけDevTools breakpoint等で一時的に応答を遅らせ、確認後に解除する。
5. 1局を終局まで遊び、最終盤面・石数・勝敗と「もう一度遊ぶ」を確認する。DevTools consoleにエラーがないことを確認する。
6. パス・空きあり双方手なし・引き分けは、自動テストの既知局面を開発時限定の一時harnessから `createGame` の第3引数へ渡し、パス理由と次の手番の併記、終局後の入力拒否、再戦を確認する。恒久的な盤面編集機能や隠し入口は追加しない。

### CPU応答時間の実測（Issue #3）

探索予算 **800ms**、main監視 **900ms**、評価係数 **角100 / 合法手数10 / 石数1（空き16以下5）**、最大2着手を変更せず測定しました。通常1局の全30 CPU手番と既知の黒パス局面の白連続2手番、計32件で **16.8〜30.0ms、最大30.0ms（G18）、全件1秒未満** でした。初回WorkerのG1は23.1ms、最多15候補のG9/G10は25.7/27.2ms。G28は通常対局中の黒パス後の白連続手で、これも測定対象に含めています。

別条件の参考値として、Rootの独立予備測定は初手D3の**人間click直前からCPU着手後のdouble rAFまで246.6ms**でした（`/tmp/pi-demo-issue3/baseline.json`）。上の32件とは開始点・条件が異なるため集計へ混ぜておらず、30.0msは全観測の最大値ではありません。Rootのpreview確認の28.5msも別の参考値です。これらの参考測定はChrome/browserやViteの初回負荷まで含むcold startの保証測定ではありません。

#### 計測・再現方法

1. 上記環境で `dev` を開き、タブを前面にしてCPU throttlingを無効にします。今回の計測は起動済みChromeの新規pageでHTTP cacheをclearしてreload後に行い、G1がそのpageの初回Workerです。Chrome process自体のcold start測定ではありません。
2. DevToolsの一時的なresponse override等で、`src/game.ts` の `startCpu` が白手番を受理した直後（guard通過後、request作成/Worker起動前）の `performance.now()` を開始時刻として記録します。CPU確定時の `onChange(state)` が同期的に `render` を終えた後、**二重の `requestAnimationFrame` の2回目**で再び `performance.now()` を記録し、差分を取ります。DOM更新直後や1回目のrAFは描画前なので完了時刻にしません。2つのframeの間に描画機会を挟む保守的な観測で、scanoutの厳密な時刻を測るものではありません。
3. 各requestごとに開始時の盤面・白合法手数・パス、応答した手、render時刻/1回目/2回目のrAF時刻を別々に保存します。パスを挟む白連続手も別requestとして記録します。全件で開始/終了時の `document.visibilityState === 'visible'` と `document.hasFocus()`、合法な実Worker応答、対象マスの白石表示、2回目rAFが1回目より後であることをassertしました。
4. 通常対局Gは黒が毎回先頭合法手を選び、下の棋譜で局面を再現します。境界局面Pは下記fixtureを一時的に `createGame` の第3引数へ渡します。探索・Worker通信・描画は通常コードのままで、応答の保留・CPU throttling・breakpointを性能測定中には使いません。
5. 最後にoverride・計測scriptを解除してreloadし、通常動作を再確認します。計測用codeはrepositoryに残しません。今回の一時harness（assert付き）・盤面を含む生データ・console記録・画面は検証環境の `/tmp/pi-demo-issue3/{verify.mjs,report.json,*.png}` にあります。一時artifactであり、checkoutへの同梱物ではありません。

Gの棋譜（`B`=黒、`W`=白。W:F8の後は黒が自動パス）：

```text
B:D3 W:C5 B:B6 W:F3 B:F4 W:E3 B:D2 W:C3 B:F2 W:C4
B:C2 W:E2 B:D1 W:F1 B:F5 W:B5 B:E1 W:C6 B:G1 W:A6
B:B3 W:G4 B:G3 W:H3 B:G2 W:H1 B:H2 W:C1 B:B1 W:A1
B:B2 W:H4 B:B4 W:A2 B:A3 W:A4 B:A5 W:G5 B:H5 W:H6
B:G6 W:D6 B:E6 W:G7 B:A7 W:A8 B:B7 W:B8 B:C7 W:C8
B:H7 W:H8 B:G8 W:F8 W:F7 B:F6 W:D7 B:E7 W:E8 B:D8
```

全測定値（msは小数1桁、空き/候補はCPU手番開始時。G1〜G8が序盤、G9〜G22が中盤、G23〜G30/P1/P2が終盤）：

| CPU手番 | 空き | 白の候補数 | 着手 | 描画を挟む観測まで (ms) |
| --- | ---: | ---: | --- | ---: |
| G1 | 59 | 3 | C5 | 23.1 |
| G2 | 57 | 5 | F3 | 23.5 |
| G3 | 55 | 6 | E3 | 24.8 |
| G4 | 53 | 9 | C3 | 27.6 |
| G5 | 51 | 8 | C4 | 28.9 |
| G6 | 49 | 12 | E2 | 29.8 |
| G7 | 47 | 14 | F1 | 21.1 |
| G8 | 45 | 14 | B5 | 23.7 |
| G9 | 43 | 15 | C6 | 25.7 |
| G10 | 41 | 15 | A6 | 27.2 |
| G11 | 39 | 12 | G4 | 27.5 |
| G12 | 37 | 12 | H3 | 21.5 |
| G13 | 35 | 11 | H1 | 23.8 |
| G14 | 33 | 10 | C1 | 25.3 |
| G15 | 31 | 9 | A1 | 26.6 |
| G16 | 29 | 9 | H4 | 28.7 |
| G17 | 27 | 9 | A2 | 28.7 |
| G18 | 25 | 7 | A4 | 30.0 |
| G19 | 23 | 5 | G5 | 20.8 |
| G20 | 21 | 5 | H6 | 22.6 |
| G21 | 19 | 6 | D6 | 24.8 |
| G22 | 17 | 6 | G7 | 28.0 |
| G23 | 15 | 5 | A8 | 29.5 |
| G24 | 13 | 7 | B8 | 19.9 |
| G25 | 11 | 6 | C8 | 22.3 |
| G26 | 9 | 5 | H8 | 24.1 |
| G27 | 7 | 5 | F8 | 24.4 |
| G28 | 6 | 4 | F7 | 16.8 |
| G29 | 4 | 2 | D7 | 27.2 |
| G30 | 2 | 2 | E8 | 28.0 |
| P1 | 2 | 2 | A1 | 24.0 |
| P2 | 1 | 1 | H1 | 25.3 |

#### 境界確認に使用した既知局面

`tests/rules.test.ts` と `tests/game.test.ts` の `position` と同じ表記（各行A〜H、上から1〜8、`B`=黒、`W`=白、`.`=空き）です。各局面は `status: 'playing', lastMove: null, passedPlayer: null` で渡し、controllerに正規化させます。盤面編集機能ではなく、一時harnessからだけ渡しました。

| 局面 | 8行の盤面（`/`区切り） | 初期turn / 確認した進行 |
| --- | --- | --- |
| P：黒パス | `.BWWWWB./WWWWWWWW/WWWWWWWW/WWWWWWWW/WWWWWWWW/WWWWWWWW/WWWWWWWW/WWWWWWWW` | `black` → 白A1（P1）→ 黒パス → 白H1（P2）→ 0対64。黒パスの説明は終局まで残り、再開始で消える |
| 白パス | `.WBBBBW./BBBBBBBB/BBBBBBBB/BBBBBBBB/BBBBBBBB/BBBBBBBB/BBBBBBBB/BBBBBBBB` | `white` → 黒A1 → 白パス → 黒H1 → 64対0 |
| 空きあり双方手なし | `WWWWWWW./WWWWWWWW/WWWWWWWW/WWWWWWWW/WWWWWWWW/WWWWWWWW/WWWWWWWW/WWWWWWWW` | `black` → 空き1の0対63で白勝ち |
| 空きあり引き分け | `B......./......../......../......../......../......../......../.......W` | `black` → 空き62の1対1で引き分け |
| 満杯の引き分け | `.WBBBBBB/BBBBBBBB/BBBBBBBB/BBBBBBBB/WWWWWWWW/WWWWWWWW/WWWWWWWW/WWWWWWWW` | `black` → 黒A1 → 32対32で引き分け |

### ユーザー実対局・実行環境の制約

- **ユーザーが同じMac Chromeの無改変preview（`http://127.0.0.1:4174/`）で「2局遊んだ」「気軽に楽しめた」と明示回答しました。** 回答した選択肢の説明は「不自然な手は目立たず、現在の強さでよい」です。ユーザー対局の得点・棋譜は取得していません。これは当該ユーザーの2局の確認結果であり、普遍的な楽しさの保証ではありません。
- 数値は対象PC/前面タブ/記録した局面での観測結果です。全PC・全局面やOS停止・バックグラウンド制限まで含む厳密な1秒保証ではありません。対象外の端末・ブラウザやscreen readerの読み上げ実機確認は行っていません。
