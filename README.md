# JET STRIKE 〜 音速の翼 〜

ジェット戦闘機のスピード感を体感できる 3D ブラウザゲームです（Three.js 使用）。

空母からカタパルトで一気に射出 → 敵機を撃墜 → 敵空母を撃沈！
燃料が尽きる前に母艦へ戻って着艦し、給油・補給をしてまた発艦します。

## 遊び方

`index.html` をブラウザで開くだけで遊べます（ビルド・サーバー不要、オフラインで動作します）。

### 操作方法

| キー | 操作 |
| --- | --- |
| W / S（↑ / ↓） | 機首 上げ / 下げ（V キーで上下反転） |
| A / D（← / →） | ロール（傾けると旋回） |
| Q / E | ラダー |
| SHIFT | アフターバーナー（速いが燃料を多く消費） |
| X | 減速 |
| SPACE / J | 機銃 |
| F / K | ミサイル（照準内の敵を一定時間捉えるとロックオン → 誘導） |
| L | 着艦アプローチ開始（母艦から 3km 以内・高度 900m 以下） |
| SPACE / ENTER | 甲板上で発艦 |
| C | 視点切替（後方 / コックピット） |
| P / ESC | ポーズ |

スマートフォン・タブレットではタッチ操作（左側の仮想スティック＋右側のボタン）に対応しています。

## ゲームの流れ

1. **発艦** — エンジンをスプールアップし、カタパルトで甲板から急加速して射出されます。
2. **戦闘** — 敵機は敵空母から次々と発艦してきます。敵空母に近づくと対空砲火（曳光弾・炸裂弾）が飛んできます。
   敵空母に近づくと「敵空母を発見！」のガイドが出て、画面下に今やるべきこと（ロックオン → F でミサイル、ミサイル切れなら機銃掃射 or 補給）が表示されます。
   命中すると「HIT」「MISSILE HIT!」が表示され、敵空母ゲージ（残り％表示）が光って揺れます。
3. **敵空母撃沈** — 体力ゲージをゼロにすると連鎖爆発のあと大爆発して沈没。ステージクリアで次の敵空母が出現します。
4. **帰還・着艦** — 燃料が少なくなると警告が出ます。緑の HOME マーカーを目指して飛び、L キーで着艦。
   アレスティングワイヤーで停止したら自動で給油・修理・弾薬補給が行われ、再び発艦できます。

燃料がゼロになるとエンジンが停止し滑空状態になります。墜落・撃墜で残機が減り、0 になるとゲームオーバーです。

ゲームオーバー画面には、スコア・称号・撃墜数や最高速度などの戦績表・次回へのヒントを表示します。「シェア」ボタンでは、スマホなど共有機能のある端末では共有シート（対応端末は最後の瞬間の画像つき）、それ以外では X の投稿画面が開きます。シェアにはゲーム紹介記事の URL（https://techgym.jp/column/claude-code-game-jet-fighter/）が付きます。

## Android 版（Google Play 配布用）

[Capacitor](https://capacitorjs.com/) でゲームのファイルをアプリ内に同梱しているため、ネットにつながっていなくても遊べます。

- 横画面固定・全画面表示（ステータスバー／ナビゲーションバーを隠す）
- プレイ中は画面が暗くならない
- Android の戻るボタンでポーズ（タイトル・結果画面ではアプリを終了）
- 別のアプリに切り替えると自動でポーズし、音も止まる
- 「シェア」は Android の共有メニューから LINE や X などを選べる
- 案内文はタッチ操作のボタン名で表示

アプリ ID は `jp.techgym.jetstrike` です（Google Play に一度公開すると変更できません）。

### 広告（Google AdMob）

Android アプリでのみ広告を表示します（Web 版には広告は出ません）。

| 広告 | タイミング |
| --- | --- |
| インタースティシャル（全画面） | ゲームオーバー後に「もう一度」を押したとき、2 回に 1 回 |
| リワード | 最後の残機を失ったときの「CONTINUE?」画面で「広告を見て続行」を選ぶと、残機 +1 で再出撃（1 ゲーム 1 回まで、10 秒で自動的にゲームオーバー） |

- EU・英国など同意が必要な地域では、初回起動時に Google の同意確認画面が出ます。
- 広告 ID は `js/ads.js`、AdMob のアプリ ID は `android/app/src/main/res/values/strings.xml` にあります。
- 動作確認用 APK（Release の `jet-strike.apk`）は常に **Google のテスト広告** を表示します。自分でタップしても問題ありません。
- Google Play 用の .aab をビルドするときだけ、CI が `ADMOB_MODE=production` で本番の広告に切り替えます（`scripts/build-web.js` が `js/ads-config.js` を書き換えます）。
- 本番の広告を自分でタップするとアカウント停止の対象になるので注意してください。

### ビルド方法

**GitHub Actions（自動）**: Web 版や `android/` を変更して push すると、`.github/workflows/android.yml` が動作確認用の APK を作ります。
既定ブランチのビルドは GitHub の Release（`android-latest`）に自動で載るので、Android 端末で次の URL を開くか QR コードを読み取るだけで最新版をダウンロードできます。

https://github.com/techgymjp/jet-fighter/releases/latest/download/jet-strike.apk

<img src="docs/apk-qr.png" alt="APK ダウンロード用 QR コード" width="180">

ダウンロードした `jet-strike.apk` を開き、「提供元不明のアプリ」のインストールを許可するとインストールできます。
動作確認用の署名鍵（`android/app/debug.keystore`）はリポジトリで固定しているので、新しいビルドもアンインストールせずに上書きインストールできます。
（Release に載る APK はデバッグ版です。Google Play には下の手順で作る署名済み .aab を使います）

**手元の PC（Android Studio）**:

```bash
npm ci
npm run android:sync   # Web ファイルを www/ にまとめて Android プロジェクトへコピー
npm run android:open   # Android Studio で開く
```

### Google Play へ公開する手順

1. アップロード鍵を作成し、安全な場所に保管する（なくすと更新版を出せなくなります）
   ```bash
   keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000
   base64 -w0 upload.jks > upload.jks.base64   # macOS は base64 -i upload.jks
   ```
2. GitHub のリポジトリの Settings → Secrets and variables → Actions に次の 4 つを登録する
   | 名前 | 内容 |
   | --- | --- |
   | `ANDROID_KEYSTORE_BASE64` | `upload.jks.base64` の中身 |
   | `ANDROID_KEYSTORE_PASSWORD` | キーストアのパスワード |
   | `ANDROID_KEY_ALIAS` | `upload`（作成時に指定した別名） |
   | `ANDROID_KEY_PASSWORD` | 鍵のパスワード |
3. Actions の「Android build」を実行すると、署名済みの `jet-strike-release-aab`（.aab）ができる
4. [Google Play Console](https://play.google.com/console) でアプリを作成し、.aab をアップロードする
   （ストア掲載情報・スクリーンショット・プライバシーポリシー・コンテンツのレーティングなどの入力が必要です。
   広告を入れているので「広告を含む」の申告、データセーフティでの広告 ID の申告、デベロッパーのサイトへの app-ads.txt の設置も必要です）

バージョン番号（versionCode）は Actions の実行回数が自動で使われます。表示用のバージョン名は `package.json` の `version` です。

## スピード感・爽快感の演出

- 速度に応じて広がる視野角（FOV）、流れるスピードライン、周辺減光、カメラ振動
- マッハ 1 突破時のベイパーコーン（衝撃雲）とソニックブーム
- 低空飛行時の海面の水しぶき、急旋回時の翼端ベイパー
- 爆発：閃光・火球・火花・黒煙・炎を引く破片・衝撃波リング・閃光ライト・水柱
- 撃墜した敵機は炎上しながら墜落し、海面で水柱を上げます
- 効果音は WebAudio で合成（外部音声ファイルなし）

## ファイル構成

```
index.html        画面構成（HUD・タイトル・タッチ操作）
css/style.css     スタイル
js/main.js        ゲームロジック（飛行・戦闘・着艦・給油・敵 AI・HUD）
js/effects.js     爆発・煙・曳光弾・スピードラインなどのエフェクト
js/models.js      戦闘機・空母・海・空・雲のモデル生成
js/audio.js       効果音（WebAudio 合成）
js/ads.js         Google AdMob 広告（Android アプリのみ）
js/ads-config.js  広告のモード（test / production）
js/vendor/        Three.js r160（MIT License）
icon.svg          アプリアイコンの元画像（assets/ に Android 用の元画像）
android/          Android アプリのプロジェクト（Capacitor）
scripts/          Android に同梱する Web ファイルを www/ にまとめるスクリプト
```
