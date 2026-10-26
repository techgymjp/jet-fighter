# Web ゲームをスマホアプリ化（Android / iOS）して公開するための引き継ぎメモ

JET STRIKE（このリポジトリ）で、Web ゲームを Android アプリにして Google Play に公開し、iOS アプリにして App Store に申請するところまで進めました（AdMob 広告入り）。
ほかの Web ゲームを同じようにアプリ化するときに、別のセッション（Claude Code）へ渡すためのメモです。1〜6 章が Android、**7 章が iOS** です。

**別セッションへの頼み方の例**

> techgymjp/jet-fighter の docs/ANDROID_PORTING.md を読んで、このゲームを同じ構成で Android 化してください。パッケージ名は jp.techgym.〇〇 です。

> techgymjp/jet-fighter の docs/ANDROID_PORTING.md の 7 章を読んで、このゲームを同じ構成で iOS 化してください。Bundle ID は jp.techgym.〇〇 です。

参考実装はこのリポジトリです。迷ったら同じファイルを見てまねしてください。

**Claude Code へ: 頼まれたら、最初の返事ですぐに次の 2 つを伝える**（ユーザーが AdMob・Play Console の登録を始めるのに、いち早く必要なため。作業を進めながら後で伝えるのでは遅い）

| 項目 | 伝えること |
| --- | --- |
| パッケージ名 | `jp.techgym.〇〇`。指定に `-` などの使えない文字があれば、直した名前（下の 3 章の 1）をはっきり伝える |
| アプリ名 | ストアのアプリ名の案（日本語・英語、それぞれ 30 字以内）と、ホーム画面に出る短い名前（日本語・英語） |

案を変えたいと言われたら、すぐに差し替える（`android/app/src/main/res/values/strings.xml`、`values-en/strings.xml`、`capacitor.config.json` の `appName`、ストアの掲載文）。

---

## 1. もう済んでいること（ゲームごとにやり直さなくてよい）

| 項目 | 状態 | ゲームごとに必要なこと |
| --- | --- | --- |
| Google Play デベロッパー アカウント | TECH GYM の組織アカウントで登録・本人確認済み | なし（同じアカウントで「アプリを作成」するだけ） |
| AdMob アカウント | 作成済み（パブリッシャー ID `pub-6411535997477460`） | アプリの追加と広告ユニットの作成 |
| app-ads.txt | `https://techgym.jp/app-ads.txt` に設置済み | なし（パブリッシャー単位なので全アプリ共通） |
| 欧州の規制（GDPR）メッセージ | JET STRIKE 向けに公開済み | 新しいアプリをメッセージの対象アプリに追加する |
| プライバシーポリシー | 日本語 https://techgym.jp/privacy-policy/ ・英語 https://techgym.jp/privacy-policy-en/ | なし（同じ URL を使う） |
| アップロード鍵（upload.jks） | ユーザーの PC に保管済み | 同じ鍵を使い回してよい。リポジトリごとに GitHub Secrets へ 4 つ登録する（下記） |

---

## 2. 技術構成（このリポジトリと同じにする）

- **Capacitor 8**（`@capacitor/core` / `@capacitor/android` 8.5.2、`@capacitor/cli` 8.5.2）
  - プラグイン：`@capacitor/app`（戻るボタン）、`@capacitor/share`（シェア）、`@capacitor-community/admob`（広告）
  - ゲームのファイルはアプリに同梱する（オフラインで遊べる）。外部サーバーを読む方式にはしない
  - バンドラーは使わず、ネイティブ機能は `window.Capacitor.Plugins.X` から呼ぶ。Web 版では `Capacitor` がないので何もしないように書く
- **`scripts/build-web.js`**：`index.html` `css` `js` などを `www/` にコピーし、次の 2 ファイルを生成する
  - `www/js/ads-config.js`：`ADMOB_MODE=production` のときだけ本番広告、それ以外はテスト広告
  - `www/js/build-info.js`：タイトル画面に出すバージョン（`v1.0.0 (build 12)` など）
- **`capacitor.config.json`**：`appId` はパッケージ名、`webDir` は `www`
- **`.gitignore`**：`node_modules/` と `www/` を除外
- **`vercel.json`**：`package.json` を足すと Vercel がビルドが必要と判断して失敗するので、`buildCommand: "npm run build"`、`outputDirectory: "www"` を指定する

### Android 側（`android/`）

- `AndroidManifest.xml`
  - 画面の向き：横画面ゲームは `android:screenOrientation="sensorLandscape"`（縦画面ゲームなら `sensorPortrait`）
  - AdMob のアプリ ID を `com.google.android.gms.ads.APPLICATION_ID` の meta-data に入れる（値は `res/values/strings.xml` の `admob_app_id`）
- `MainActivity.java`：システムバーを隠して全画面、プレイ中は画面を消さない（`FLAG_KEEP_SCREEN_ON`）
- `app/build.gradle`
  - `versionCode` は環境変数 `VERSION_CODE`（CI の実行回数）、`versionName` は `VERSION_NAME`（`package.json` の version）
  - `signingConfigs.debug` はリポジトリに入れた `app/debug.keystore`（パスワード android）。CI のどのビルドでも上書きインストールできるようにするため
  - `signingConfigs.release` は環境変数（GitHub Secrets）から渡すアップロード鍵
  - `minifyEnabled false`（Play Console の「難読化ファイルがない」警告は無視してよい）
- アイコンと起動画面：`assets/` の元画像から生成

### ゲーム側（JavaScript）でやったこと

- 戻るボタン：プレイ中はポーズ、タイトルや結果画面ではアプリを終了
- 別アプリに切り替えたら（`visibilitychange`）自動でポーズし、音（WebAudio）も止める
- シェア：アプリでは `@capacitor/share` で Android の共有メニューを出す
- タッチ操作の案内文：アプリではキー名ではなくボタン名で表示
- タイトル画面にビルド番号とプライバシーポリシーへのリンクを表示
- EU など同意が必要な地域向けに、タイトル画面に「広告の設定」ボタン（`showPrivacyOptions`）

### 広告の基本ルール（これから Android 化するゲームはこれに合わせる）

| 種類 | 出す場面 |
| --- | --- |
| バナー | **トップ（タイトル）画面・操作説明（あそびかた）画面・ポーズ画面・結果画面だけ**（画面の下中央）。プレイ中は操作ボタンと重なるので出さない |
| 全画面広告（インタースティシャル） | **「プレイを始める（トップ・操作説明から）」「トップ画面に戻る（操作説明・ポーズ・結果画面から）」「ポーズ画面からの再開」「結果画面からもう一度プレイする（次の面に行く）」のたびに、毎回出す**（2 回に 1 回などに間引かない） |
| リワード広告 | ゲーム性に合った「チート」を 1 つ用意し、それを使うときにだけ見てもらう（下の「リワードの決め方」） |

**リワードの決め方**

- そのゲームで「一番悔しい失敗」を取り返せるものにする。点数や順位を直接もらえるものにはしない
- 見るかどうかは遊ぶ人が選ぶ。失敗の様子（ボールの行方・相手が走り去るところなど）を見届けられるよう、案内は 2〜4 秒待ってから出し、数秒で自動的に消して先へ進める
- 1 ゲームで使える回数に上限をつける（5 回など）。使ったことは結果画面とシェア文に「やり直し N 回」のように出す
- やり直すときは、そのプレーの成績を取り消し、同じ配置・同じ乱数で再現する（1 プレーごとに乱数の種をゲームの種から作っておく）
- 広告を最後まで見たとき（`onRewardedVideoAdReward`）だけ効く。途中で閉じたり読み込めなかったりしたら、何もせず先へ進める

| ゲーム | リワード（チート） |
| --- | --- |
| techgymjp/jet-fighter（JET STRIKE） | 最後の残機を失ったときの「CONTINUE?」で残機 +1（1 ゲーム 1 回） |
| techgymjp/jackal（ジャッカル） | 失敗したプレーをやり直す（1 ゲーム 5 回） |
| techgymjp/corner-kick（コーナーキック） | 外したコーナーキックをもう一度蹴り直す（1 ゲーム 5 回。10 本で何点取れるかを競うので、1 本を取り返すのが一番自然） |

- 面（ステージ）がないゲームでは、結果画面の「もう一度」（次のゲームへ）を「次の面に行く」として扱う（例: techgymjp/jackal）
- トップ画面は、ゲーム名・ひとこと・ベスト記録と「プレイ」「あそびかた」のボタンだけにして、文字を大きくする。操作説明は別の「あそびかた」画面にまとめる（スマホの横画面では、トップに説明を詰め込むと文字が小さすぎて読めない。例: techgymjp/corner-kick）
- 広告ユニット ID は種類ごとに届くことがある。ID が空の種類は本番ビルドで出さないようにしておくと、そろうまでも先にビルドできる（jackal の `ads.js`）
- 実機がなくても、ブラウザで `window.Capacitor` と `Plugins.AdMob` のニセモノを入れて、広告を出す場面が合っているかを確かめられる

### 広告（`js/ads.js`）— JET STRIKE の場合（上の基本ルールより前に作ったもの）

- インタースティシャル：ゲームオーバー後に「もう一度」を押したとき、2 回に 1 回
- リワード：最後の残機を失ったときの「CONTINUE?」画面で、見ると残機 +1（1 ゲーム 1 回、10 秒で自動的にゲームオーバー）
- バナーは入れない（横画面では操作ボタンと重なる）
- 起動時に UMP（Google の同意確認）を実行。同意確認でエラーになっても広告は出せるようにする（ここで止まると広告が一切出なくなる）
- 広告は先読みし、失敗したら 20 秒後に再挑戦。表示時に未読み込みなら最大 8 秒だけ待つ
- テスト用の広告ユニット ID（Google 公式）と本番の ID を持ち、`window.AD_MODE` で切り替える

### GitHub Actions（`.github/workflows/android.yml`）

1. `npm ci` → `npm run build` → `npx cap sync android` → `./gradlew assembleDebug`
2. 既定ブランチなら、Release `android-latest` に `xxx.apk` を `gh release upload --clobber` で差し替える（Release を消して作り直すと、その間ダウンロードが 404 になる）
3. Secrets があれば、`ADMOB_MODE=production npm run build` → `npx cap copy android` → `./gradlew bundleRelease` で署名付き AAB を作り、Artifact に上げる
- `concurrency` で古いビルドを取り消す。`timeout-minutes` を付けて固まったまま待たされないようにする
- 動作確認用 APK の URL は `https://github.com/techgymjp/<リポジトリ>/releases/latest/download/<名前>.apk`。QR コードにしておくとスマホで入れやすい
- **リリース画面の QR コードを作って、リポジトリと README に入れ、ユーザーにも渡す**
  - QR にするのはリリース画面 `https://github.com/techgymjp/<リポジトリ>/releases/tag/android-latest`（APK 直接より、説明とビルド番号が見えるので分かりやすい）
  - 作り方：`npx --yes qrcode -w 600 -o docs/apk-qr.png "https://github.com/techgymjp/<リポジトリ>/releases/tag/android-latest"`
  - README の「Android アプリ」に、リリース画面の URL・APK 直接の URL・`docs/apk-qr.png` を書く（例: techgymjp/jackal、techgymjp/corner-kick）
  - Release は既定ブランチのビルドで初めてできる。QR を渡す前に、リリース画面に APK が載っているかを確かめる
- **クラウドの Claude Code では dl.google.com に接続できず Android SDK を入れられないので、ビルドは GitHub Actions に任せる**

---

## 3. ゲームごとにやる手続き（ユーザーが画面で行う）

1. **パッケージ名を決める**：`jp.techgym.〇〇`。Google Play に一度出すと変更できない
   - 使える文字は英小文字・数字・`_` だけ（`-` は使えない）。リポジトリ名に `-` があるときは抜く（例: corner-kick → `jp.techgym.cornerkick`）
2. **AdMob**
   - 「アプリを追加」→ Android →「ストアに掲載されていない」で登録
   - バナー・インタースティシャル・リワードの広告ユニットを作成（上の「広告の基本ルール」）
   - アプリ ID（`ca-app-pub-…~…`）と広告ユニット ID 3 つを Claude Code に渡す
   - 「プライバシーとメッセージ」→「欧州の規制」のメッセージに、新しいアプリを対象として追加
3. **GitHub Secrets**（Google Play 用の署名付き AAB を作るために、アップロード鍵を GitHub に預ける）

   1. GitHub でそのゲームのリポジトリを開き、上のタブの **Settings** →左の **Secrets and variables** → **Actions** を開く
      （Settings が見えないときは、リポジトリの管理者の権限がない）
   2. 「Repository secrets」の **New repository secret** を押し、Name と Secret を入れて **Add secret**。これを下の 4 つ分くり返す

      | Name | Secret に入れるもの |
      | --- | --- |
      | `ANDROID_KEYSTORE_BASE64` | upload.jks を文字にしたもの（下の 3） |
      | `ANDROID_KEYSTORE_PASSWORD` | キーストアのパスワード |
      | `ANDROID_KEY_ALIAS` | `upload` |
      | `ANDROID_KEY_PASSWORD` | 鍵のパスワード（キーストアのパスワードと同じにしていれば同じもの） |

   3. upload.jks を文字にしてクリップボードにコピーする（upload.jks のあるフォルダで実行し、そのまま Secret 欄に貼る）
      - Mac（ターミナル）：`base64 -i upload.jks | tr -d '\n' | pbcopy`
      - Windows（PowerShell）：`[Convert]::ToBase64String([IO.File]::ReadAllBytes("upload.jks")) | Set-Clipboard`
   4. 確かめる：Actions タブ →「Android build」→ **Run workflow**（または次の push）で動かし、終わった実行の下の Artifacts に
      `〇〇-release-aab` が出ていれば成功。出ないときは 4 つの Name のつづりを確認する
   - Secret は登録後に中身を見られない（上書きだけできる）。パスワードを間違えたら同じ Name で登録し直す
   - **Secret の中身やパスワードはチャット（Claude Code を含む）に貼らない**。Claude Code には「登録した」とだけ伝えればよい
   - リポジトリごとに登録が必要（ほかのリポジトリの Secrets は使えない）。鍵そのものは全ゲームで同じものを使ってよい

4. **Play Console**
   - 「アプリを作成」：アプリ名、デフォルトの言語 日本語、ゲーム、無料
   - ストアの掲載情報：アプリ名（30 字）、簡単な説明（80 字）、詳しい説明、アイコン 512×512、フィーチャーグラフィック 1024×500、スクリーンショット（1920×1080 など）。英語（en-US）は「翻訳を管理」から追加
   - アプリのコンテンツ（見つからなければ URL 末尾を `app-content/overview` に）
     - プライバシーポリシー：https://techgym.jp/privacy-policy/
     - アプリのアクセス権：制限なし
     - 広告：含む
     - 広告 ID：使用する（目的は「広告またはマーケティング」と「アナリティクス」）。申告しないと AAB アップロード時にエラー
     - コンテンツのレーティング：ゲームの内容に合わせて回答
     - ターゲットユーザー：13 歳以上（13 歳未満を含めると広告に制限がかかる）
     - データセーフティ：アプリ自体は個人情報を集めない。AdMob が広告 ID とアプリの操作を広告・アナリティクス目的で収集・共有。通信は暗号化
   - 製品版リリース：**必ず「テストとリリース」→「製品版」で「新しいリリースを作成」する**（オープンテストやクローズドテストで作るとテスト版としてしか公開されない）。Play App Signing を有効にし、Actions の Artifact からダウンロードした `.aab` をアップロード。リリースノートは `<ja-JP>…</ja-JP>` `<en-US>…</en-US>` で書く
   - 「公開の概要」→「変更を審査に送信」
   - 送信前に「製品版」→「リリース」タブにリリースがあることを確認する。審査後は「公開の概要」→「送信アクティビティ」で、「製品版」の中にバージョン（例：`10 (1.0.0)`）が入っているかを確認する（国 / 地域の追加だけだとアプリ本体は公開されない）
5. **公開後**：AdMob でアプリを Google Play のストアに紐づける

ストア用の画像と紹介文は、ゲームを自動操作してスクリーンショットを撮り、日英で下書きを作るところまで Claude Code に任せられる（このリポジトリの `docs/store/` が例）。

---

## 4. 守ること

- **アップロード鍵（upload.jks）とパスワードは、チャット・AI へのアップロード・リポジトリへのコミットで絶対に共有しない**。誤って共有したら削除し、必要なら Play Console で鍵のリセットを申請する
- **本番の広告を自分でタップしない**（AdMob アカウント停止の対象）。動作確認は Release の APK（テスト広告）で行う
- 公開記事や教材に **GitHub の URL は載せない**
- D-U-N-S 番号や AdMob の ID など、具体的な値は公開記事に書かない
- コミットメッセージや PR にモデル名を入れない

---

## 5. ライセンス（リポジトリごとに追加する）

Web ゲームもアプリ（APK / AAB は ZIP 形式で、中の HTML / JavaScript を取り出せる）も、コードを見られることは防げません。
コピーしたアプリを勝手に出されたときに、Google Play の「知的財産権の侵害の申し立て」で削除を求めやすくするため、各リポジトリに `LICENSE` を置きます。

- このリポジトリの `LICENSE` をコピーし、ゲーム名（2 行目）だけ書き換える
- 内容：著作権はテックジム株式会社に帰属（All rights reserved）。許可なく複製・改変・再配布、Web サイトやアプリ（Google Play、App Store など）として公開・販売すること、名前・ロゴ・アイコン・画像の使用を禁止
- 例外：テックジムの受講生が学習目的で複製・改変することは許可。ただし、アプリストアでの公開、広告の掲載、販売などの商用利用は禁止し、著作権表示を残す
- 日本語と英語の両方で書く
- 同梱しているライブラリ（Three.js など）は、それぞれのライセンス（MIT など）のままにし、`LICENSE` の「Third-party software」に書く。ライブラリのライセンスファイルも消さない
- README に「ライセンス」の項目を足し、上の内容を短く書く

あわせて、Google Play に先に公開して名前を押さえ、ときどき似たアプリが出ていないか検索する。

---

## 6. つまずいたところ

| 症状 | 原因と対処 |
| --- | --- |
| Vercel で「No Output Directory named public」 | `package.json` を追加したため。`vercel.json` で `www` を指定する（有料プランは不要） |
| QR コードの APK ダウンロードが 404 | Release を削除→作り直ししていたため。Release は残して APK だけ `--clobber` で差し替える |
| 「広告を見て続行」が出ない | 古い APK のままだった。タイトル画面のビルド番号で確認する。広告の先読み・再挑戦と、同意確認エラー時の続行も入れておく |
| 縦の短い画面で結果画面がはみ出す | 横画面のスマホは高さが小さい。`max-height: 500px` の横向き用メディアクエリで詰める |
| AAB アップロードで広告 ID のエラー | 「アプリのコンテンツ」の広告 ID を「使用する」で申告する |
| app-ads.txt を開くとサイトの通常ページが出る | Ads.txt Manager の「App-ads.txt」ページに貼る。WordPress の「パーマリンク」を変更せずに保存し、キャッシュも削除する |
| Play Console で電話番号確認が押せない | 本人確認と書類の審査が終わるまで待つ |
| 審査が通って「公開」になったのに、ストアに表示されない（製品版が「非アクティブ」「リリースなし」） | リリースをオープンテストで作っていた。製品版に入ったのは国 / 地域の設定だけだった。「製品版」→「新しいリリースを作成」→「ライブラリから追加」で同じ App Bundle を選び、審査に送り直す（同じバージョンコードは再アップロードできないので、ライブラリから選ぶ） |
| App Bundle が「有効」なのにストアにない | 「有効」はどこかのトラック（テスト含む）で使われているという意味。製品版に入っているとは限らない |

---

## 7. iOS 版（App Store）

JET STRIKE の iOS 版で行ったことです。Android 版ができていれば、同じ Capacitor のプロジェクトに `ios/` を足すだけで作れます。Mac での作業手順は `docs/IOS_BUILD.md` にあります。

### 7-1. もう済んでいること

| 項目 | 状態 | ゲームごとに必要なこと |
| --- | --- | --- |
| Apple Developer Program | 登録済み（Team ID `GNM3VTX9YG`）。**最初は個人で登録していたため、組織（TECH GYM）への移行を Apple に申請中**。移行後も Team ID・アプリはそのまま | なし（年会費 99 米ドルの更新だけ） |
| App Store Connect | 利用可能 | アプリの作成 |
| AdMob | Android と同じアカウント | iOS 用のアプリと広告ユニットを作る（Android とは別） |
| app-ads.txt | 設置済み | なし（iOS も同じファイルで有効） |
| Mac | ユーザーの自宅の Mac でビルドする | 手順は `docs/IOS_BUILD.md` |

### 7-2. ゲームごとにやる手続き（ユーザーがブラウザで行う）

1. **Apple Developer**（developer.apple.com）→「Certificates, Identifiers & Profiles」→「Identifiers」→「＋」→「App IDs」→「App」
   - Description：ゲーム名を英数字で（例：`JET STRIKE`。記号や「〜」は使えないことがある）
   - Bundle ID：「Explicit」で `jp.techgym.〇〇`（Android のパッケージ名とそろえる）
   - Capabilities：何もチェックしない（AdMob やシェアに特別な機能は不要）
2. **App Store Connect**（appstoreconnect.apple.com）→「マイ App」→「＋」→「新規 App」
   - プラットフォーム：iOS ／ 名前：Google Play と同じ（30 文字以内、App Store 全体で重複不可）／ プライマリ言語：日本語
   - バンドル ID：1 で登録したもの ／ SKU：ゲーム名の英字（例：`jetstrike`。あとから変更不可）／ ユーザアクセス：アクセス制限なし
3. **AdMob**
   - 「アプリを追加」→ **iOS** →「ストアに掲載されていない」で登録し、インタースティシャルとリワードの広告ユニットを作る
   - アプリ ID と広告ユニット ID 2 つを Claude Code に渡す（広告ユニットを消して作り直したら、新しい ID を渡し直す）
   - 「プライバシーとメッセージ」→「欧州の規制」のメッセージに iOS アプリも追加する
4. **App Store Connect の入力**
   - App 情報：カテゴリ「ゲーム」（サブカテゴリ「アクション」など）、プライバシーポリシー https://techgym.jp/privacy-policy/
   - 価格：無料 ／ 年齢制限：質問に答える ／ App のプライバシー：AdMob が収集するデータを申告（`docs/IOS_BUILD.md` の 5 章）
   - バージョンのページ：スクリーンショット、ヘッダ、検索結果の画像、説明文（Google Play 用の文章を流用）、サポート URL、著作権、ビルド

### 7-3. 技術構成（Claude Code が行う）

- `npm install @capacitor/ios@<@capacitor/core と同じ版>` → `npm run build` → `npx cap add ios`。Swift Package Manager の構成で `ios/` ができる（CocoaPods 不要）。クラウドの Linux でも生成できる
- `ios/.gitignore` が `App/App/public` と生成された `capacitor.config.json` を除外するので、そのままコミットしてよい
- **Xcode プロジェクト**（`ios/App/App.xcodeproj/project.pbxproj`）
  - `DEVELOPMENT_TEAM = GNM3VTX9YG;`（`CODE_SIGN_STYLE = Automatic` のあとに追加）
  - `TARGETED_DEVICE_FAMILY = 1;`（iPhone 専用。iPad 用のスクリーンショットが不要になる。iPad では iPhone 用の画面で動く）
  - `MARKETING_VERSION = 1.0.0;`（`package.json` の version とそろえる）
  - トラッキング確認の説明文を日英で出すため、`App/en.lproj/InfoPlist.strings` と `App/ja.lproj/InfoPlist.strings` を作り、PBXVariantGroup（InfoPlist.strings）・PBXFileReference・PBXBuildFile・Resources・`knownRegions` に `ja` を追加する
- **Info.plist**（`ios/App/App/Info.plist`）
  - `GADApplicationIdentifier`：AdMob の iOS 用アプリ ID
  - `SKAdNetworkItems`：Google の `cstr6suwn9.skadnetwork`（Google の iOS 導入ガイドにある残りの ID も足すとよい）
  - `NSUserTrackingUsageDescription`：トラッキング確認の説明（英語。日本語は ja.lproj で上書き）
  - `CFBundleLocalizations`：`en`, `ja`
  - `ITSAppUsesNonExemptEncryption`：false（輸出コンプライアンスの質問を省く）
  - `UISupportedInterfaceOrientations`：横画面のゲームは LandscapeLeft / LandscapeRight だけ（縦画面のゲームなら Portrait だけ）
  - `UIRequiresFullScreen`：true ／ `UIStatusBarHidden`：true ／ `UIViewControllerBasedStatusBarAppearance`：false
  - `UIRequiredDeviceCapabilities`：`arm64`
- **AppDelegate.swift**：`application.isIdleTimerDisabled = true`（プレイ中に画面を消さない）
- **アイコン**：`Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` を 1024×1024 の**透過なし**の画像に差し替える（`assets/icon-only.png` から作る）。起動画面（Splash.imageset の 3 枚、2732×2732）も差し替える
- **`capacitor.config.json`**：`"ios": { "backgroundColor": "#000000" }`
- **`package.json`** の scripts：
  - `ios:sync`：`npm run build && npx cap sync ios`（テスト広告）
  - `ios:release`：`ADMOB_MODE=production npm run build && npx cap sync ios`（本番広告。App Store 用はこちら）
  - `ios:open`：`npx cap open ios`
- **広告（`js/ads.js`）**
  - 広告ユニットを `UNITS.android` と `UNITS.ios` に分け、`Capacitor.getPlatform()` で切り替える。iOS のテスト用ユニット：インタースティシャル `ca-app-pub-3940256099942544/4411468910`、リワード `ca-app-pub-3940256099942544/1712485313`
  - 同意確認（UMP）のあと、iOS だけ `trackingAuthorizationStatus()` が `notDetermined` なら `requestTrackingAuthorization()` を呼ぶ（断られても広告は出せる）
- **戻るボタン**（`@capacitor/app` の backButton）は iOS では呼ばれないだけなので、そのままでよい
- **GitHub Actions**（`.github/workflows/ios.yml`）：`macos-latest` で `npm ci` → `npx cap sync ios` → `xcodebuild … -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build`。署名なしで「ビルドできるか」だけを push のたびに確認する（公開リポジトリなら無料）。署名とアップロードは Mac の Xcode で行う

### 7-4. ストア用の画像（Claude Code が Playwright で撮影する）

| 画像 | サイズ | 撮り方 |
| --- | --- | --- |
| スクリーンショット | **2622 × 1206**（iPhone 6.3 インチ、横向き）。日英 各 4 枚 | viewport 874 × 402、deviceScaleFactor 3、`isMobile` / `hasTouch` |
| ヘッダ | 3840 × 1646（21:9） | viewport 1280 × 549 ×3 で撮って下を 1px 切る。HUD を消し、文字は入れない（App Store がアプリ名を重ねる） |
| 検索結果 | 3840 × 2560（3:2） | viewport 1280 × 854 ×3 で撮って中央を切り出す |

- App Store Connect のスクリーンショットの欄は「Dynamic Island 搭載 iPhone（中型ディスプレイ）」。**6.9 インチ（2868 × 1320）は受け付けられず、6.3 インチ（2622 × 1206）で通った**
- 撮影のスクリプトは Google Play 用と同じ（場面を `__game` で作り、撮影中は自機の `hp` を大きくして撃墜されないようにする。敵空母撃沈の場面は、ミサイルが外れたら撃ち直す）
- JPEG / PNG、透過なし。保存先は `docs/store/ios/`

### 7-5. つまずいたところ（iOS）

| 症状 | 原因と対処 |
| --- | --- |
| 6.9 インチのスクリーンショットがアップロードできない | 欄が「中型ディスプレイ」だった。2622 × 1206（6.3 インチ）で作り直す |
| AdMob の広告ユニットが消えていた | 作り直して、新しい ID を `js/ads.js` に入れ直す |
| Xcode の Team に会社名ではなく個人名が出る | Apple Developer に個人で登録していた。販売元に個人名が出て、EU の事業者申告では個人の連絡先が公開される。developer.apple.com/contact から「個人から組織への変更」を申し込む（D-U-N-S 番号が必要。数日〜数週間）。移行を待つ間もビルドのアップロードと TestFlight は進められる。審査への提出は移行後にする |
| ヘッダ・検索結果の欄が赤枠になる | ヘッダを入れたら、検索結果の画像（3:2）も入れる |
| 本番広告とテスト広告の取り違え | App Store 用は必ず `npm run ios:release`。Xcode から実機で試すときは `npm run ios:sync` に戻す |
