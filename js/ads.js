// Google AdMob 広告（Android アプリのときだけ動く。Web 版では何もしない）
const Ads = (() => {
  const UNITS = {
    // Google 公式のテスト用広告ユニット
    test: {
      interstitial: 'ca-app-pub-3940256099942544/1033173712',
      rewarded: 'ca-app-pub-3940256099942544/5224354917',
    },
    production: {
      interstitial: 'ca-app-pub-6411535997477460/8433378929',
      rewarded: 'ca-app-pub-6411535997477460/9640105652',
    },
  };
  const cap = window.Capacitor;
  const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  const AdMob = native && cap.Plugins ? cap.Plugins.AdMob : null;
  const testing = window.AD_MODE !== 'production';
  const ids = testing ? UNITS.test : UNITS.production;

  let ready = false;           // 広告をリクエストしてよい状態（同意確認が済んだ）
  let interLoaded = false, rewardLoaded = false;
  let showing = false;
  let privacyRequired = false; // 「広告の設定」を利用者が開けるようにする必要があるか（EU など）
  const waiters = {};          // 表示中の広告が閉じたときに呼ぶ処理

  function prepareInterstitial() {
    if (!ready) return;
    AdMob.prepareInterstitial({ adId: ids.interstitial, isTesting: testing })
      .then(() => { interLoaded = true; })
      .catch(() => { interLoaded = false; });
  }
  function prepareRewarded() {
    if (!ready) return;
    AdMob.prepareRewardVideoAd({ adId: ids.rewarded, isTesting: testing })
      .then(() => { rewardLoaded = true; })
      .catch(() => { rewardLoaded = false; });
  }
  function finish(kind, result) {
    showing = false;
    Sfx.resume();
    const w = waiters[kind];
    waiters[kind] = null;
    if (w) w(result);
  }

  async function init() {
    if (!AdMob) return;
    try {
      await AdMob.initialize({ initializeForTesting: testing });
      // EU・英国などで必要な広告の同意確認（必要な地域でだけフォームが出る）
      let consent = await AdMob.requestConsentInfo();
      if (consent.status === 'REQUIRED' && consent.isConsentFormAvailable) consent = await AdMob.showConsentForm();
      ready = consent.canRequestAds !== false;
      privacyRequired = consent.privacyOptionsRequirementStatus === 'REQUIRED';
    } catch (e) {
      ready = false;
    }
    let rewarded = false;
    AdMob.addListener('interstitialAdDismissed', () => finish('inter'));
    AdMob.addListener('interstitialAdFailedToShow', () => finish('inter'));
    AdMob.addListener('onRewardedVideoAdReward', () => { rewarded = true; });
    AdMob.addListener('onRewardedVideoAdShowed', () => { rewarded = false; });
    AdMob.addListener('onRewardedVideoAdDismissed', () => finish('reward', rewarded));
    AdMob.addListener('onRewardedVideoAdFailedToShow', () => finish('reward', false));
    prepareInterstitial();
    prepareRewarded();
  }

  // 全画面広告を表示し、閉じられたら resolve する（表示できないときはすぐ resolve）
  function showInterstitial() {
    if (!AdMob || !ready || !interLoaded || showing) return Promise.resolve();
    showing = true; interLoaded = false;
    Sfx.suspend();
    return new Promise(resolve => {
      waiters.inter = () => { prepareInterstitial(); resolve(); };
      AdMob.showInterstitial().catch(() => finish('inter'));
    });
  }

  // リワード広告を表示し、最後まで見て報酬を得たら true で resolve する
  function showRewarded() {
    if (!AdMob || !ready || !rewardLoaded || showing) return Promise.resolve(false);
    showing = true; rewardLoaded = false;
    Sfx.suspend();
    return new Promise(resolve => {
      waiters.reward = ok => { prepareRewarded(); resolve(!!ok); };
      AdMob.showRewardVideoAd().catch(() => finish('reward', false));
    });
  }

  // 同意した内容をあとから変更するための Google のフォームを開く
  function showPrivacyOptions() {
    if (!AdMob) return Promise.resolve();
    return AdMob.showPrivacyOptionsForm().catch(() => {});
  }

  const initDone = AdMob ? init() : Promise.resolve();

  return {
    get available() { return !!AdMob; },
    get showing() { return showing; },
    get rewardedReady() { return !!AdMob && ready && rewardLoaded; },
    get privacyOptionsRequired() { return privacyRequired; },
    initDone,
    showPrivacyOptions,
    showInterstitial,
    showRewarded,
  };
})();
