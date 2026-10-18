// JET STRIKE - メインゲームロジック
(() => {
  'use strict';
  const V3 = THREE.Vector3, Q = THREE.Quaternion;
  const AX = new V3(1, 0, 0), AY = new V3(0, 1, 0), AZ = new V3(0, 0, 1), UP = AY;
  const DECK_Y = 20, GEAR_H = 1.9, CAT_Z = 40, BOW_Z = -170, TOUCH_Z = 150;
  const MACH1 = 340;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const _v1 = new V3(), _v2 = new V3(), _v3 = new V3(), _v4 = new V3(), _v5 = new V3();
  const _q1 = new Q(), _q2 = new Q();
  const $ = id => document.getElementById(id);

  // ---------------------------------------------------------------- 描画基盤
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setSize(innerWidth, innerHeight);
  $('game').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 1, 40000);
  const world = Models.buildWorld(scene);
  scene.fog = world.fog;
  FX.init(scene, camera);
  const tracers = new FX.Tracers(scene, 900);
  const speedLines = new FX.SpeedLines(scene, 240);

  const overlay = $('overlay');
  const octx = overlay.getContext('2d');
  const radar = $('radar');
  const rctx = radar.getContext('2d');

  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    overlay.width = innerWidth * dpr; overlay.height = innerHeight * dpr;
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- 空母
  function makeCarrier(enemy, pos, rotY, hp) {
    const mesh = Models.buildCarrier(enemy);
    mesh.position.copy(pos); mesh.rotation.y = rotY;
    scene.add(mesh);
    mesh.updateMatrixWorld();
    return {
      isCarrier: true, enemy, mesh, pos: mesh.position, quat: mesh.quaternion.clone(), inv: mesh.quaternion.clone().invert(),
      hp, maxHp: hp, alive: true, dying: 0, boomT: 0, megaDone: false, fires: [], aaT: 1, launchT: 4,
      turrets: mesh.userData.turrets, radar: mesh.children[mesh.userData.radarIndex], vel: new V3(), aim: new V3(),
    };
  }
  const toLocal = (c, p, out) => out.copy(p).sub(c.pos).applyQuaternion(c.inv);
  const toWorld = (c, lp, out) => out.copy(lp).applyQuaternion(c.quat).add(c.pos);
  const _cl = new V3();
  function carrierHit(c, p, m) {
    m = m || 0;
    toLocal(c, p, _cl);
    if (_cl.y < -10 || _cl.y > 58 + m) return false;
    if (Math.abs(_cl.x) < 37 + m && _cl.y < 21 + m && Math.abs(_cl.z + 0.5) < 168 + m) return true;
    return _cl.x > 25 - m && _cl.x < 37 + m && _cl.z > 8 - m && _cl.z < 42 + m;
  }
  function carrierAim(c, out) { return toWorld(c, _v5.set(0, 18, 0), out); }

  const home = makeCarrier(false, new V3(0, 0, 0), 0, 1);
  let enemyCarrier = null;
  const sinking = [];

  // ---------------------------------------------------------------- プレイヤー
  const player = {
    mesh: Models.buildJet(false), pos: new V3(), quat: new Q(), vel: new V3(), speed: 0,
    fwd: new V3(0, 0, -1), up: new V3(0, 1, 0), right: new V3(1, 0, 0),
    fuel: 100, hp: 100, ammo: 1000, msl: 4, abOn: false, ab: 0, forcedAB: 0, gunT: 0, gunSide: 0,
    lockTarget: null, lockTime: 0, locked: false, lockBeep: 0, prevSpeed: 0,
  };
  scene.add(player.mesh);
  const MAX_AMMO = 1000, MAX_MSL = 4;

  function axes(o) {
    o.fwd.set(0, 0, -1).applyQuaternion(o.quat);
    o.up.set(0, 1, 0).applyQuaternion(o.quat);
    o.right.set(1, 0, 0).applyQuaternion(o.quat);
  }

  const G = {
    state: 'title', t: 0, st: 0, score: 0, kills: 0, stage: 1, lives: 3, best: 0,
    shake: 0, dmgFlash: 0, camMode: 'chase', invert: false, paused: false, camBlend: 1, orbitA: 0,
    launchPhase: '', catSpeed: 0, refuel: false, ready: false, stageClearT: 0, deathPos: new V3(),
    land: null, warnT: 0, fade: 0, fadeDir: 0, onFadeMid: null,
  };
  try { G.best = +localStorage.getItem('jetstrike_best') || 0; } catch (e) { /* 保存不可 */ }
  $('best').textContent = G.best;

  // ---------------------------------------------------------------- 入力
  const keys = {};
  const touch = { x: 0, y: 0, fire: false, ab: false, brake: false };
  addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    if (e.repeat) { keys[e.code] = true; return; }
    keys[e.code] = true;
    Sfx.init();
    onKey(e.code);
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  function onKey(code) {
    if (G.state === 'title') { if (code === 'Enter' || code === 'Space') startGame(); return; }
    if (G.state === 'gameover') { if (code === 'Enter') startGame(); return; }
    if (code === 'KeyP' || code === 'Escape') { togglePause(); return; }
    if (G.paused) return;
    if (code === 'KeyC') G.camMode = G.camMode === 'chase' ? 'cockpit' : 'chase';
    if (code === 'KeyV') { G.invert = !G.invert; showMsg('', G.invert ? '上下操作：反転（↑で機首下げ）' : '上下操作：通常（↑で機首上げ）', 1.5); }
    if (code === 'KeyF' || code === 'KeyK') fireMissile();
    if (code === 'KeyL') tryLanding();
    if ((code === 'Space' || code === 'Enter') && G.state === 'deck') tryLaunch();
  }

  function readInput() {
    let pitch = 0, roll = 0, yaw = 0;
    if (keys.KeyW || keys.ArrowUp) pitch += 1;
    if (keys.KeyS || keys.ArrowDown) pitch -= 1;
    if (G.invert) pitch = -pitch;
    if (keys.KeyD || keys.ArrowRight) roll += 1;
    if (keys.KeyA || keys.ArrowLeft) roll -= 1;
    if (keys.KeyE) yaw += 1;
    if (keys.KeyQ) yaw -= 1;
    pitch = clamp(pitch - touch.y * (G.invert ? -1 : 1), -1, 1);
    roll = clamp(roll + touch.x, -1, 1);
    return {
      pitch, roll, yaw,
      fire: !!(keys.Space || keys.KeyJ || touch.fire),
      ab: !!(keys.ShiftLeft || keys.ShiftRight || touch.ab),
      brake: !!(keys.KeyX || keys.ControlLeft || keys.ControlRight || touch.brake),
    };
  }

  // タッチ操作
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  (function setupTouch() {
    const zone = $('stickZone'), base = $('stickBase'), knob = $('stickKnob');
    let id = null, cx = 0, cy = 0;
    zone.addEventListener('pointerdown', e => {
      Sfx.init();
      id = e.pointerId; zone.setPointerCapture(id);
      const r = base.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      move(e);
    });
    const move = e => {
      if (e.pointerId !== id) return;
      let dx = (e.clientX - cx) / 70, dy = (e.clientY - cy) / 70;
      const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      touch.x = dx; touch.y = dy;
      knob.style.transform = `translate(${dx * 45}px,${dy * 45}px)`;
    };
    zone.addEventListener('pointermove', move);
    const end = e => { if (e.pointerId !== id) return; id = null; touch.x = touch.y = 0; knob.style.transform = ''; };
    zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
    const hold = (el, key) => {
      el.addEventListener('pointerdown', e => { e.preventDefault(); Sfx.init(); touch[key] = true; el.classList.add('on'); });
      const off = () => { touch[key] = false; el.classList.remove('on'); };
      el.addEventListener('pointerup', off); el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off);
    };
    hold($('tFire'), 'fire'); hold($('tAB'), 'ab'); hold($('tBrake'), 'brake');
    $('tMsl').addEventListener('pointerdown', e => { e.preventDefault(); fireMissile(); });
    $('tAct').addEventListener('pointerdown', e => { e.preventDefault(); Sfx.init(); if (G.state === 'deck') tryLaunch(); else tryLanding(); });
    $('tCam').addEventListener('pointerdown', e => { e.preventDefault(); G.camMode = G.camMode === 'chase' ? 'cockpit' : 'chase'; });
  })();

  $('startBtn').addEventListener('click', () => { Sfx.init(); startGame(); });
  $('retryBtn').addEventListener('click', () => { Sfx.init(); startGame(); });

  function togglePause() {
    if (G.state === 'title' || G.state === 'gameover') return;
    G.paused = !G.paused;
    $('pause').classList.toggle('hidden', !G.paused);
    if (G.paused) Sfx.engine(false, 0, 0, 0);
  }

  // ---------------------------------------------------------------- メッセージ
  let msgT = 0;
  function showMsg(main, sub, dur) {
    if (main !== null) $('centerMsg').textContent = main;
    $('subMsg').textContent = sub || '';
    $('centerMsg').style.opacity = main ? 1 : 0;
    $('subMsg').style.opacity = sub ? 1 : 0;
    msgT = dur || 2;
  }

  // ---------------------------------------------------------------- ゲーム進行
  const enemies = [];
  const bullets = [];
  const missiles = [];

  function clearWorld() {
    for (const e of enemies) scene.remove(e.mesh);
    enemies.length = 0; bullets.length = 0;
    for (const m of missiles) scene.remove(m.mesh);
    missiles.length = 0;
    if (enemyCarrier) scene.remove(enemyCarrier.mesh);
    for (const c of sinking) scene.remove(c.mesh);
    sinking.length = 0;
    enemyCarrier = null;
  }

  function startGame() {
    clearWorld();
    G.score = 0; G.kills = 0; G.stage = 1; G.lives = 3; G.stageClearT = 0; G.paused = false;
    $('title').classList.add('hidden'); $('gameover').classList.add('hidden'); $('pause').classList.add('hidden');
    $('hud').classList.remove('hidden');
    $('touch').classList.toggle('hidden', !isTouch);
    spawnStage();
    resupply();
    enterDeck(false);
    showMsg('MISSION START', `STAGE ${G.stage}　敵空母を撃沈せよ！`, 3);
  }

  function spawnStage() {
    const ang = rand(-0.7, 0.7) + (G.stage % 2 === 0 ? Math.PI * rand(0.25, 0.4) * (Math.random() < 0.5 ? -1 : 1) : 0);
    const d = Math.min(11000, 7000 + G.stage * 500);
    const pos = new V3(Math.sin(ang) * d, 0, -Math.cos(ang) * d);
    enemyCarrier = makeCarrier(true, pos, rand(0, Math.PI * 2), 100 + (G.stage - 1) * 35);
    const n = maxEnemies();
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), r = rand(1200, 2500);
      const p = new V3(pos.x + Math.cos(a) * r, rand(500, 1200), pos.z + Math.sin(a) * r);
      const dir = new V3(-Math.sin(a), 0, Math.cos(a));
      spawnEnemy(p, dir, 200);
    }
  }
  const maxEnemies = () => Math.min(9, 3 + G.stage);

  function resupply() {
    player.fuel = 100; player.hp = 100; player.ammo = MAX_AMMO; player.msl = MAX_MSL;
  }

  function placeOnDeck(z) {
    toWorld(home, _v1.set(0, DECK_Y + GEAR_H, z), player.pos);
    player.quat.copy(home.quat);
    player.speed = 0; player.vel.set(0, 0, 0);
    axes(player);
  }

  function enterDeck(refuel) {
    G.state = 'deck'; G.st = 0; G.refuel = refuel; G.ready = !refuel;
    if (!refuel) placeOnDeck(CAT_Z);
    player.mesh.visible = true;
    player.mesh.parts.gear.visible = true;
    player.lockTarget = null; player.locked = false;
    G.camBlend = 0.02;
  }

  function tryLaunch() {
    if (G.state !== 'deck' || !G.ready) return;
    placeOnDeck(CAT_Z);
    G.state = 'launch'; G.st = 0; G.launchPhase = 'spool'; G.catSpeed = 0;
    G.camBlend = 0.05;
    Sfx.spool();
    showMsg('', 'カタパルト射出準備…', 1.2);
  }

  function nextStage() {
    if (enemyCarrier) sinking.push(enemyCarrier);
    G.stage++;
    spawnStage();
    showMsg(`STAGE ${G.stage}`, '新たな敵空母艦隊を発見！ レーダーを確認せよ', 3.5);
    Sfx.beep(660, 0.15); Sfx.beep(990, 0.25);
  }

  function gameOver() {
    G.state = 'gameover';
    if (G.score > G.best) { G.best = G.score; try { localStorage.setItem('jetstrike_best', G.best); } catch (e) { /* 保存不可 */ } }
    $('goScore').textContent = G.score; $('goKills').textContent = G.kills; $('goStage').textContent = G.stage;
    $('goBest').textContent = G.best; $('best').textContent = G.best;
    $('gameover').classList.remove('hidden');
    $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
    Sfx.engine(false, 0, 0, 0);
  }

  function shakeAt(p, amount, range) {
    const d = camera.position.distanceTo(p);
    G.shake = Math.max(G.shake, amount * clamp(1 - d / range, 0, 1));
  }
  const vol = (p, range) => clamp(1 - camera.position.distanceTo(p) / range, 0, 1);

  // ---------------------------------------------------------------- 飛行
  function updateFlight(dt, inp) {
    const p = player;
    const engineOn = p.fuel > 0;
    const ctrl = p.speed < 90 ? 0.45 : 1;
    _q1.setFromAxisAngle(AX, inp.pitch * 1.55 * dt * ctrl); p.quat.multiply(_q1);
    _q1.setFromAxisAngle(AZ, -inp.roll * 3.3 * dt * ctrl); p.quat.multiply(_q1);
    _q1.setFromAxisAngle(AY, -inp.yaw * 0.55 * dt * ctrl); p.quat.multiply(_q1);
    axes(p);
    // 傾けると自然に旋回するアシスト
    const bank = p.right.y;
    _q1.setFromAxisAngle(UP, bank * 1.05 * dt * ctrl); p.quat.premultiply(_q1);
    // ロール入力がない時は水平に戻す
    if (!inp.roll && Math.abs(p.fwd.y) < 0.85 && p.up.y > -0.2) {
      _q1.setFromAxisAngle(AZ, -bank * 1.6 * dt); p.quat.multiply(_q1);
    }
    p.quat.normalize();
    axes(p);

    p.forcedAB = Math.max(0, p.forcedAB - dt);
    p.abOn = engineOn && (p.forcedAB > 0 || inp.ab);
    let target = 250;
    if (p.abOn) target = 445;
    if (inp.brake && p.forcedAB <= 0) { target = 125; p.abOn = false; }
    if (!engineOn) target = 0;
    const acc = target > p.speed ? (p.abOn ? 75 : 32) : (inp.brake ? 65 : engineOn ? 22 : 9);
    p.speed += clamp(target - p.speed, -acc * dt, acc * dt);
    p.speed -= p.fwd.y * 32 * dt;
    p.speed = clamp(p.speed, 0, 540);
    p.ab += ((p.abOn ? 1 : 0) - p.ab) * Math.min(1, dt * 6);

    // 失速
    if (p.speed < 85) {
      const k = (85 - p.speed) / 85;
      _v1.crossVectors(p.fwd, _v2.set(0, -1, 0));
      if (_v1.lengthSq() > 1e-4) { _v1.normalize(); _q1.setFromAxisAngle(_v1, k * 1.1 * dt); p.quat.premultiply(_q1); axes(p); }
    }
    p.vel.copy(p.fwd).multiplyScalar(p.speed);
    if (p.speed < 85) p.vel.y -= (85 - p.speed) * 0.7;
    p.pos.addScaledVector(p.vel, dt);

    // 燃料
    const burn = !engineOn ? 0 : p.abOn ? 2.7 : inp.brake ? 0.55 : 0.8;
    const before = p.fuel;
    p.fuel = Math.max(0, p.fuel - burn * dt);
    if (before > 0 && p.fuel <= 0) { showMsg('FLAME OUT', '燃料切れ！ エンジン停止… 滑空して母艦へ！', 3); Sfx.beep(300, 0.4, 0.2); }

    // マッハ突破
    if (p.prevSpeed < MACH1 && p.speed >= MACH1) {
      FX.vaporCone(_v1.copy(p.pos).addScaledVector(p.fwd, 2), p.fwd, p.up, p.right, p.vel);
      Sfx.sonic(); G.shake = Math.max(G.shake, 0.9);
      showMsg(null, 'MACH 1 突破！', 1.2);
    }
    p.prevSpeed = p.speed;

    // 機銃
    p.gunT -= dt;
    if (inp.fire && p.ammo > 0 && p.gunT <= 0) {
      p.gunT = 1 / 18;
      p.ammo--;
      p.gunSide = 1 - p.gunSide;
      const b = newBullet(0);
      b.p.copy(p.pos).addScaledVector(p.fwd, 9).addScaledVector(p.right, p.gunSide ? 1.4 : -1.4).addScaledVector(p.up, 0.2);
      b.v.copy(p.fwd).multiplyScalar(1350);
      b.v.x += rand(-12, 12); b.v.y += rand(-12, 12); b.v.z += rand(-12, 12);
      b.v.add(p.vel);
      b.life = 1.5; b.dmg = 1;
      FX.spawnFire(b.p.x, b.p.y, b.p.z, p.vel.x, p.vel.y, p.vel.z, 0.05, 2.5, 4, FX.K_FLASH, 0, 0, 1, 1, 1, 0.9);
      Sfx.shot();
    }

    // 低空でのしぶき
    if (p.pos.y < 45 && p.speed > 180) {
      const n = p.pos.y < 20 ? 3 : 1;
      for (let i = 0; i < n; i++) FX.spray(_v1.set(p.pos.x, 0, p.pos.z).addScaledVector(p.fwd, -10), p.vel);
    }
    // 翼端ベイパー
    if (p.speed > 230 && Math.abs(inp.pitch) > 0.5) {
      for (const s of [-7.8, 7.8]) {
        _v1.copy(p.pos).addScaledVector(p.right, s).addScaledVector(p.fwd, -3);
        FX.vapor(_v1, _v2.copy(p.vel).multiplyScalar(0.85), 0.8, 0.45, 0.3);
      }
    }

    // 衝突判定
    if (p.pos.y < 2) return crash('sea');
    if (carrierHit(home, p.pos, 2)) return crash('carrier');
    if (enemyCarrier && carrierHit(enemyCarrier, p.pos, 2)) return crash('carrier');
    if (p.pos.y > 9000) p.pos.y = 9000;
  }

  function crash(reason) {
    const p = player;
    FX.explosion(p.pos, 2.4, p.vel);
    FX.explosion(_v1.copy(p.pos).addScaledVector(p.vel, 0.15), 1.6, p.vel, { noDebris: true });
    Sfx.boom(3, 1);
    G.shake = 2.2;
    G.deathPos.copy(p.pos);
    if (G.deathPos.y < 5) G.deathPos.y = 5;
    p.mesh.visible = false;
    G.state = 'dead'; G.st = 0;
    G.lives--;
    showMsg(reason === 'shot' ? '撃墜された！' : '墜落！', G.lives > 0 ? `残機 ${G.lives}` : '', 3);
  }

  function damagePlayer(d, at) {
    if (G.state !== 'flight') return;
    player.hp -= d;
    G.dmgFlash = Math.min(1, G.dmgFlash + 0.35 + d * 0.03);
    G.shake = Math.max(G.shake, 0.35 + d * 0.04);
    Sfx.hit();
    FX.hitSpark(at || player.pos);
    if (player.hp <= 0) { player.hp = 0; crash('shot'); }
  }

  // ---------------------------------------------------------------- 着艦
  function inLandingZone() {
    if (G.state !== 'flight') return false;
    toLocal(home, player.pos, _v1);
    return Math.hypot(_v1.x, _v1.z) < 3200 && player.pos.y < 900;
  }

  function tryLanding() {
    if (!inLandingZone()) {
      if (G.state === 'flight') showMsg(null, '着艦するには母艦の近く（3km以内・高度900m以下）へ', 1.6);
      return;
    }
    const lp = toLocal(home, player.pos, new V3());
    const lf = player.fwd.clone().applyQuaternion(home.inv);
    const direct = lp.z > 650 && Math.abs(lp.x) < 1400 && lf.z < -0.35;
    if (direct) beginLandingPath(lp, lf, player.speed);
    else {
      // 進入コースへワープ（暗転演出）
      G.state = 'landing'; G.land = null;
      G.fade = 0; G.fadeDir = 1;
      G.onFadeMid = () => {
        const s = new V3(rand(-60, 60), 160, 1900);
        toWorld(home, s, player.pos);
        player.quat.copy(home.quat); axes(player);
        beginLandingPath(s, new V3(0, 0, -1), 160);
        G.camBlend = 1;
        speedLines.seeded = false;
      };
    }
    showMsg('', '着艦アプローチ開始 — フックダウン', 2.5);
  }

  function beginLandingPath(lp, lf, speed) {
    const pts = [lp.clone(), lp.clone().addScaledVector(lf, 260)];
    for (const c of [new V3(0, 95, 1100), new V3(0, 55, 650), new V3(0, 36, 360)]) {
      if (c.z < pts[pts.length - 1].z - 150) pts.push(c);
    }
    pts.push(new V3(0, DECK_Y + GEAR_H, TOUCH_Z));
    for (const v of pts) toWorld(home, v, v);
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    G.state = 'landing';
    G.land = { curve, len: curve.getLength(), s: 0, v0: clamp(speed, 95, 200), phase: 'air', rollSpeed: 0 };
    player.mesh.parts.gear.visible = true;
  }

  function updateLanding(dt) {
    const L = G.land, p = player;
    if (!L) { p.pos.addScaledVector(p.vel, dt); return; } // 暗転中
    if (L.phase === 'air') {
      const u = L.s / L.len;
      const v = L.v0 + (72 - L.v0) * u;
      L.s += v * dt;
      p.speed = v;
      if (L.s >= L.len) {
        L.phase = 'roll'; L.rollSpeed = 72;
        toWorld(home, _v1.set(0, DECK_Y + GEAR_H, TOUCH_Z), p.pos);
        p.quat.copy(home.quat);
        Sfx.thud(); G.shake = 1.4;
        showMsg('TRAP!', 'アレスティングワイヤー捕捉！', 1.5);
        for (let i = 0; i < 20; i++) FX.steam(p.pos, 1);
        return;
      }
      const t = Math.min(1, L.s / L.len);
      L.curve.getPointAt(t, _v1);
      const tan = L.curve.getTangentAt(t, _v2);
      const tan2 = L.curve.getTangentAt(Math.min(1, t + 30 / L.len), _v3);
      const turn = _v4.crossVectors(tan, tan2).y;
      p.vel.subVectors(_v1, p.pos).divideScalar(Math.max(dt, 1e-4));
      p.pos.copy(_v1);
      quatFromDir(tan, clamp(-turn * 25, -1, 1), _q2);
      p.quat.slerp(_q2, 1 - Math.exp(-dt * 6));
      axes(p);
      p.abOn = false; p.ab *= 0.9;
    } else {
      L.rollSpeed = Math.max(0, L.rollSpeed - 34 * dt);
      p.speed = L.rollSpeed;
      toLocal(home, p.pos, _v1);
      _v1.z -= L.rollSpeed * dt;
      toWorld(home, _v1, p.pos);
      p.vel.set(0, 0, -L.rollSpeed).applyQuaternion(home.quat);
      if (L.rollSpeed > 10) {
        _v2.copy(p.pos).addScaledVector(p.fwd, 8).setY(DECK_Y + 0.3);
        for (let i = 0; i < 3; i++) FX.spawnFire(_v2.x, _v2.y, _v2.z, rand(-20, 20), rand(5, 30), rand(-20, 20), 0.35, 1, 0.3, FX.K_SPARK, 1, 40, 1, 1, 1, 1);
      }
      if (L.rollSpeed <= 0) {
        enterDeck(true);
        showMsg('着艦成功！', '給油・補給中…', 2);
        G.score += 50;
      }
    }
  }

  // ---------------------------------------------------------------- 発艦
  function updateLaunch(dt) {
    const p = player;
    if (G.launchPhase === 'spool') {
      p.ab = Math.min(1, G.st / 1.0);
      p.abOn = true;
      G.shake = Math.max(G.shake, 0.15 + G.st * 0.25);
      for (let i = 0; i < 3; i++) FX.steam(_v1.copy(p.pos).addScaledVector(p.fwd, rand(-6, 30)).setY(DECK_Y + 0.5), 1.4);
      if (G.st > 1.3) {
        G.launchPhase = 'cat'; G.st = 0;
        Sfx.catapult();
        G.shake = 1.6;
        showMsg('LAUNCH!!', '', 1.2);
      }
    } else {
      G.catSpeed += 52 * dt;
      p.speed = G.catSpeed;
      p.vel.copy(p.fwd).multiplyScalar(p.speed);
      p.pos.addScaledVector(p.vel, dt);
      G.shake = Math.max(G.shake, 1.1);
      for (let i = 0; i < 4; i++) FX.steam(_v1.copy(p.pos).addScaledVector(p.fwd, rand(5, 40)).setY(DECK_Y + 0.5), 2);
      _v1.copy(p.pos).addScaledVector(p.fwd, -4).setY(DECK_Y + 0.3);
      for (let i = 0; i < 3; i++) FX.spawnFire(_v1.x, _v1.y, _v1.z, rand(-30, 30), rand(10, 50), rand(-30, 30), 0.4, 1, 0.3, FX.K_SPARK, 1, 40, 1, 1, 1, 1);
      toLocal(home, p.pos, _v2);
      if (_v2.z < BOW_Z) {
        G.state = 'flight'; G.st = 0;
        p.speed = Math.max(p.speed, 160);
        p.prevSpeed = p.speed;
        _q1.setFromAxisAngle(AX, 0.14); p.quat.multiply(_q1); axes(p);
        p.forcedAB = 2.5;
        p.mesh.parts.gear.visible = false;
        G.camBlend = 0.06;
        showMsg('TAKE OFF!!', '敵空母へ向かえ！', 2);
      }
    }
  }

  // ---------------------------------------------------------------- 甲板
  function updateDeck(dt) {
    const p = player;
    p.speed = 0; p.abOn = false; p.ab *= 0.9;
    if (G.refuel && !G.ready) {
      p.fuel = Math.min(100, p.fuel + 38 * dt);
      p.hp = Math.min(100, p.hp + 40 * dt);
      p.ammo = Math.min(MAX_AMMO, p.ammo + 450 * dt);
      if (G.st > 0.8 && p.msl < MAX_MSL && Math.floor(G.st * 2) !== Math.floor((G.st - dt) * 2)) p.msl++;
      if (p.fuel >= 100 && p.hp >= 100 && p.ammo >= MAX_AMMO && p.msl >= MAX_MSL) {
        p.ammo = MAX_AMMO;
        G.ready = true;
        // 給油が終わったら発艦位置へ
        placeOnDeck(CAT_Z);
        showMsg('給油完了！', 'SPACE / ENTER で発艦', 3);
        Sfx.beep(880, 0.12); Sfx.beep(1320, 0.18);
      }
    }
  }

  // ---------------------------------------------------------------- 弾
  function newBullet(team) {
    const b = { p: new V3(), o: new V3(), v: new V3(), life: 1, team, dmg: 1, flak: false };
    bullets.push(b);
    return b;
  }

  function segHit(a, b, c, r) {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
    const l2 = abx * abx + aby * aby + abz * abz;
    let t = l2 > 0 ? (acx * abx + acy * aby + acz * abz) / l2 : 0;
    t = clamp(t, 0, 1);
    const dx = a.x + abx * t - c.x, dy = a.y + aby * t - c.y, dz = a.z + abz * t - c.z;
    return dx * dx + dy * dy + dz * dz < r * r;
  }

  const airborne = () => G.state === 'flight';

  function updateBullets(dt) {
    tracers.begin();
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.o.copy(b.p);
      b.p.addScaledVector(b.v, dt);
      b.life -= dt;
      let dead = b.life <= 0;
      if (b.team === 0) {
        for (const e of enemies) {
          if (e.alive && segHit(b.o, b.p, e.pos, 14)) { hitEnemy(e, b.dmg, b.p); dead = true; break; }
        }
        if (!dead && enemyCarrier && enemyCarrier.alive && carrierHit(enemyCarrier, b.p)) {
          damageCarrier(enemyCarrier, 0.4, b.p); dead = true;
        }
      } else if (airborne()) {
        if (segHit(b.o, b.p, player.pos, b.flak ? 9 : 7)) { damagePlayer(b.dmg, b.p); dead = true; }
        else if (b.flak && b.life <= 0) {
          FX.flak(b.p);
          if (b.p.distanceTo(player.pos) < 35) damagePlayer(4, player.pos);
        }
      }
      if (b.p.y < 0) {
        if (Math.random() < 0.25) FX.spray(b.p, _v1.set(0, 0, 0));
        dead = true;
      }
      if (dead) { bullets[i] = bullets[bullets.length - 1]; bullets.pop(); continue; }
      const sp = b.v.length() || 1;
      const len = b.team === 0 ? 30 : 22;
      const k = len / sp;
      if (b.team === 0) tracers.add(b.p.x, b.p.y, b.p.z, b.p.x - b.v.x * k, b.p.y - b.v.y * k, b.p.z - b.v.z * k, 1, 0.85, 0.35, 2.2);
      else tracers.add(b.p.x, b.p.y, b.p.z, b.p.x - b.v.x * k, b.p.y - b.v.y * k, b.p.z - b.v.z * k, 1, b.flak ? 0.55 : 0.25, 0.15, b.flak ? 3 : 2);
    }
    tracers.end();
  }

  // ---------------------------------------------------------------- ミサイル
  const mslGeo = new THREE.CylinderGeometry(0.17, 0.17, 3.2, 8); mslGeo.rotateX(Math.PI / 2);
  const mslMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 });

  function targetPos(t, out) {
    return t.isCarrier ? carrierAim(t, out) : out.copy(t.pos);
  }

  function fireMissile() {
    const p = player;
    if (G.state !== 'flight' || p.msl <= 0) return;
    const idx = MAX_MSL - p.msl;
    p.msl--;
    const pm = p.mesh.parts.msl[idx];
    if (pm) pm.visible = false;
    const side = idx % 2 === 0 ? 1 : -1;
    const m = {
      mesh: new THREE.Mesh(mslGeo, mslMat),
      pos: p.pos.clone().addScaledVector(p.right, side * (idx < 2 ? 3 : 5)).addScaledVector(p.up, -1.2),
      prev: new V3(), dir: p.fwd.clone(), speed: p.speed + 10, t: 0, life: 9,
      target: p.locked ? p.lockTarget : null,
    };
    scene.add(m.mesh);
    missiles.push(m);
    Sfx.missile();
    showMsg(null, m.target ? 'FOX 2 — ミサイル発射！' : 'ミサイル発射（無誘導）', 1);
  }

  function updateMissiles(dt) {
    for (let i = missiles.length - 1; i >= 0; i--) {
      const m = missiles[i];
      m.t += dt; m.life -= dt;
      m.speed = Math.min(720, m.speed + 300 * dt);
      const tgt = m.target;
      if (tgt && tgt.alive && m.t > 0.25) {
        const tp = targetPos(tgt, _v1);
        const d = tp.distanceTo(m.pos);
        if (!tgt.isCarrier) tp.addScaledVector(tgt.vel, clamp(d / m.speed, 0, 1.5));
        _v2.subVectors(tp, m.pos).normalize();
        rotateToward(m.dir, _v2, 3.2 * dt);
      }
      m.prev.copy(m.pos);
      m.pos.addScaledVector(m.dir, m.speed * dt);
      m.mesh.position.copy(m.pos);
      m.mesh.quaternion.setFromUnitVectors(AZ, _v3.copy(m.dir).negate());
      // 噴射炎と煙
      _v4.copy(m.pos).addScaledVector(m.dir, -2);
      FX.engineGlow(_v4, _v5.set(0, 0, 0), 3.2);
      FX.smokePuff(_v4, 2.2, 0.85, 1.8, 0.45);

      let boom = false;
      for (const e of enemies) {
        if (e.alive && segHit(m.prev, m.pos, e.pos, 20)) { killEnemy(e, true); boom = true; break; }
      }
      if (!boom && enemyCarrier && enemyCarrier.alive && carrierHit(enemyCarrier, m.pos, 3)) {
        FX.explosion(m.pos, 2.4);
        Sfx.boom(2.4, vol(m.pos, 6000));
        shakeAt(m.pos, 1.5, 2500);
        damageCarrier(enemyCarrier, 12, m.pos);
        boom = true;
      }
      if (!boom && (m.pos.y < 0 || m.life <= 0)) {
        FX.explosion(m.pos.y < 0 ? m.pos.setY(1) : m.pos, 0.8);
        boom = true;
      }
      if (boom) { scene.remove(m.mesh); missiles.splice(i, 1); }
    }
  }

  function updateLock(dt) {
    const p = player;
    if (G.state !== 'flight') { p.lockTarget = null; p.locked = false; return; }
    let best = null, bestA = 0.42;
    const consider = (t, tp) => {
      _v2.subVectors(tp, p.pos);
      const d = _v2.length();
      if (d > 5200 || d < 30) return;
      const a = Math.acos(clamp(_v2.dot(p.fwd) / d, -1, 1));
      if (a < bestA) { bestA = a; best = t; }
    };
    for (const e of enemies) if (e.alive) consider(e, e.pos);
    if (enemyCarrier && enemyCarrier.alive) consider(enemyCarrier, carrierAim(enemyCarrier, _v3));
    if (best !== p.lockTarget) { p.lockTarget = best; p.lockTime = 0; p.locked = false; }
    else if (best) {
      p.lockTime += dt;
      p.lockBeep -= dt;
      if (!p.locked && p.lockTime > 0.55) { p.locked = true; Sfx.beep(1600, 0.12, 0.1); }
      else if (!p.locked && p.lockBeep <= 0) { p.lockBeep = 0.14; Sfx.beep(900, 0.04, 0.05); }
    }
  }

  // ---------------------------------------------------------------- 敵機
  function spawnEnemy(pos, dir, speed) {
    const mesh = Models.buildJet(true);
    mesh.parts.gear.visible = false;
    scene.add(mesh);
    const hp = 6 + G.stage;
    const e = {
      mesh, pos: pos.clone(), dir: dir.clone().normalize(), prev: new V3(), vel: new V3(), speed, hp, maxHp: hp, alive: true,
      bank: 0, fireT: rand(0.5, 2), burst: 0, evade: 0, evadeP: new V3(), orbit: rand(0, Math.PI * 2), orbitR: rand(1300, 2600),
      altOff: rand(-250, 500), skill: rand(0.7, 1.05), turn: Math.min(1.15, 0.72 + G.stage * 0.05), spin: new V3(), home: pos.clone(),
    };
    enemies.push(e);
    return e;
  }

  function hitEnemy(e, dmg, at) {
    e.hp -= dmg;
    FX.hitSpark(at);
    if (e.hp <= 0) killEnemy(e, false);
  }

  function killEnemy(e, byMissile) {
    if (!e.alive) return;
    e.alive = false;
    FX.explosion(e.pos, byMissile ? 2.0 : 1.6, e.vel);
    Sfx.boom(1.8, vol(e.pos, 5000));
    shakeAt(e.pos, 1.3, 1500);
    e.spin.set(rand(-3, 3), rand(-2, 2), rand(-5, 5));
    e.vel.multiplyScalar(0.6);
    if (e.pos.y > 5) {
      G.kills++;
      G.score += byMissile ? 150 : 100;
      showMsg('撃墜！', `+${byMissile ? 150 : 100}`, 1.2);
    }
  }

  function updateEnemies(dt) {
    const pAir = airborne();
    const ecAlive = enemyCarrier && enemyCarrier.alive;
    const nearEC = ecAlive && player.pos.distanceTo(enemyCarrier.pos) < 6500;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (!e.alive) {
        // 炎上しながら墜ちていく残骸
        e.vel.y -= 28 * dt;
        e.pos.addScaledVector(e.vel, dt);
        _q1.setFromEuler(new THREE.Euler(e.spin.x * dt, e.spin.y * dt, e.spin.z * dt));
        e.mesh.quaternion.multiply(_q1);
        e.mesh.position.copy(e.pos);
        FX.burn(e.pos, 1.3, e.vel);
        FX.burn(e.pos, 0.9, e.vel);
        if (e.pos.y < 0) {
          FX.splash(e.pos, 1.3);
          FX.explosion(e.pos.setY(2), 0.9, null, { noDebris: true });
          Sfx.boom(1, vol(e.pos, 3000));
          scene.remove(e.mesh);
          enemies.splice(i, 1);
        }
        continue;
      }
      const toP = _v2.subVectors(player.pos, e.pos);
      const dP = toP.length();
      const attacking = pAir && (dP < 4500 || nearEC);
      const aim = _v1;
      if (e.evade > 0) { e.evade -= dt; aim.copy(e.evadeP); }
      else if (attacking) aim.copy(player.pos).addScaledVector(player.vel, clamp(dP / 950, 0, 2) * e.skill);
      else {
        const c = ecAlive ? enemyCarrier.pos : e.home;
        e.orbit += dt * 0.11;
        aim.set(c.x + Math.cos(e.orbit) * e.orbitR, 650 + e.altOff, c.z + Math.sin(e.orbit) * e.orbitR);
      }
      const des = _v3.subVectors(aim, e.pos).normalize();
      if (e.pos.y < 260) des.y = Math.max(des.y, 0.05 + 0.4 * (1 - e.pos.y / 260));
      if (e.pos.y > 4000) des.y = Math.min(des.y, -0.1);
      des.normalize();
      if (attacking && dP < 170 && e.evade <= 0) {
        e.evade = rand(1.5, 2.8);
        e.evadeP.copy(e.pos).addScaledVector(e.dir, 700).add(_v4.set(rand(-500, 500), rand(-200, 400), rand(-500, 500)));
        e.evadeP.y = Math.max(350, e.evadeP.y);
      }
      e.prev.copy(e.dir);
      rotateToward(e.dir, des, e.turn * dt);
      const turned = _v4.crossVectors(e.prev, e.dir).y;
      const tb = clamp(-turned / (e.turn * dt + 1e-6), -1, 1) * 1.25;
      e.bank += (tb - e.bank) * Math.min(1, dt * 3);
      const tgtSpd = attacking ? (dP > 1500 ? 300 : 225) : 195;
      e.speed += (tgtSpd - e.speed) * dt * 0.5;
      e.vel.copy(e.dir).multiplyScalar(e.speed);
      e.pos.addScaledVector(e.vel, dt);
      quatFromDir(e.dir, e.bank, e.mesh.quaternion);
      e.mesh.position.copy(e.pos);
      const fl = e.speed > 260 ? 1 : 0.3;
      for (const f of e.mesh.parts.flames) f.scale.set(1, fl * rand(0.85, 1.1), 1);
      for (const f of e.mesh.parts.cores) f.scale.set(1, fl * rand(0.85, 1.1), 1);

      // 射撃
      if (attacking && dP < 1150) {
        const cosA = toP.dot(e.dir) / dP;
        if (cosA > 0.985) {
          e.fireT -= dt;
          if (e.fireT <= 0) {
            const b = newBullet(1);
            b.p.copy(e.pos).addScaledVector(e.dir, 9);
            b.v.copy(e.dir).multiplyScalar(980);
            b.v.x += rand(-22, 22); b.v.y += rand(-22, 22); b.v.z += rand(-22, 22);
            b.v.add(e.vel);
            b.life = 1.6; b.dmg = 3;
            if (Math.random() < 0.5) Sfx.beep(170, 0.03, 0.04 * vol(e.pos, 1500));
            e.fireT = 0.09;
            if (++e.burst > 7) { e.burst = 0; e.fireT = rand(0.9, 1.8) / (0.8 + G.stage * 0.1); }
          }
        }
      }
      // 損傷時は煙を吐く
      if (e.hp < e.maxHp * 0.5) FX.burn(e.pos, 0.5, e.vel);
      if (pAir && dP < 13) { killEnemy(e, false); damagePlayer(100); }
      if (e.pos.y < 3) killEnemy(e, false);
    }
  }

  // ---------------------------------------------------------------- 敵空母
  function damageCarrier(c, dmg, at) {
    if (!c.alive) return;
    c.hp -= dmg;
    FX.hitSpark(at, true);
    const before = Math.floor((c.hp + dmg) / 6), after = Math.floor(c.hp / 6);
    if (after < before && c.fires.length < 12) {
      const lp = toLocal(c, at, new V3());
      lp.y = Math.max(lp.y, 21);
      c.fires.push(lp);
    }
    if (c.hp <= 0) {
      c.hp = 0; c.alive = false; c.dying = 0; c.boomT = 0;
      G.score += 2000;
      showMsg('敵空母 撃沈！！', '+2000　大爆発に巻き込まれるな！', 3);
    }
  }

  function updateCarrierFires(c, intensity) {
    for (const lp of c.fires) {
      toWorld(c, lp, _v1);
      if (Math.random() < 0.7 * intensity) FX.burn(_v1, 1.6 * intensity);
    }
  }

  function updateEnemyCarrier(dt) {
    const c = enemyCarrier;
    if (!c) return;
    c.radar.rotation.y += dt * 1.5;
    if (c.alive) {
      updateCarrierFires(c, 1);
      // 対空砲火
      const d = c.pos.distanceTo(player.pos);
      if (airborne() && d < 3200) {
        c.aaT -= dt;
        if (c.aaT <= 0) {
          c.aaT = Math.max(0.05, 0.16 - G.stage * 0.012);
          const tp = c.turrets[(Math.random() * c.turrets.length) | 0];
          const b = newBullet(1);
          toWorld(c, _v1.set(tp[0], tp[1], tp[2]), b.p);
          const dist = b.p.distanceTo(player.pos);
          const lead = dist / 820;
          _v2.copy(player.pos).addScaledVector(player.vel, lead * rand(0.6, 1.1));
          b.v.subVectors(_v2, b.p).normalize();
          b.v.x += rand(-0.035, 0.035); b.v.y += rand(-0.035, 0.035); b.v.z += rand(-0.035, 0.035);
          b.v.normalize().multiplyScalar(820);
          b.flak = Math.random() < 0.45;
          b.life = b.flak ? lead * rand(0.85, 1.05) : 4;
          b.dmg = 2;
          FX.spawnFire(b.p.x, b.p.y, b.p.z, 0, 0, 0, 0.06, 4, 6, FX.K_FLASH, 0, 0, 1, 1, 1, 0.8);
        }
      }
      // 艦載機の発艦
      c.launchT -= dt;
      const alive = enemies.filter(e => e.alive).length;
      if (c.launchT <= 0) {
        c.launchT = Math.max(3, 8 - G.stage * 0.6);
        if (alive < maxEnemies()) {
          const p = toWorld(c, _v1.set(0, DECK_Y + 3, -175), new V3());
          const dir = new V3(0, 0.12, -1).applyQuaternion(c.quat);
          spawnEnemy(p, dir, 170);
        }
      }
    } else {
      c.dying += dt;
      updateCarrierFires(c, 1.4);
      if (c.dying < 4.5) {
        c.boomT -= dt;
        if (c.boomT <= 0) {
          c.boomT = rand(0.1, 0.32);
          toWorld(c, _v1.set(rand(-30, 30), rand(20, 40), rand(-150, 150)), _v2);
          const s = rand(1.6, 3.2);
          FX.explosion(_v2, s);
          Sfx.boom(s, vol(_v2, 8000));
          shakeAt(_v2, 1.2, 4000);
        }
      } else if (!c.megaDone) {
        c.megaDone = true;
        carrierAim(c, _v1);
        FX.explosion(_v1, 7);
        for (const z of [-130, 0, 130]) FX.explosion(toWorld(c, _v3.set(0, 25, z), _v2), 4.5, null, { noDebris: true });
        FX.shockwave(_v1, 1100, 1.6);
        FX.shockwave(_v1.setY(1), 900, 2.2, true, 0xffffff);
        FX.splash(_v1, 4);
        Sfx.boom(7, Math.max(0.5, vol(_v1, 12000)));
        shakeAt(_v1, 3, 6000);
        G.stageClearT = 9;
        setTimeout(() => showMsg('STAGE CLEAR!', '燃料を確認し、母艦へ帰還せよ', 4), 1500);
      }
    }
  }

  function updateSinking(dt) {
    for (let i = sinking.length - 1; i >= 0; i--) {
      const c = sinking[i];
      c.dying += dt;
      c.mesh.position.y -= dt * 1.4;
      c.mesh.rotation.z += dt * 0.008;
      c.mesh.updateMatrixWorld();
      c.quat.copy(c.mesh.quaternion);
      if (c.mesh.position.y > -25) updateCarrierFires(c, 0.8);
      if (c.mesh.position.y < -70) { scene.remove(c.mesh); sinking.splice(i, 1); }
    }
    const c = enemyCarrier;
    if (c && !c.alive && c.megaDone) {
      c.mesh.position.y -= dt * 1.4;
      c.mesh.rotation.z += dt * 0.008;
      c.quat.copy(c.mesh.quaternion);
    }
  }

  // ---------------------------------------------------------------- 計算ユーティリティ
  const qv1 = new V3(), qv2 = new V3(), qv3 = new V3(), qm = new THREE.Matrix4(), qq = new Q();
  function quatFromDir(dir, bank, out) {
    qv1.crossVectors(dir, UP);
    if (qv1.lengthSq() < 1e-6) qv1.set(1, 0, 0);
    qv1.normalize();
    qv2.crossVectors(qv1, dir).normalize();
    qv3.copy(dir).negate();
    qm.makeBasis(qv1, qv2, qv3);
    out.setFromRotationMatrix(qm);
    if (bank) { qq.setFromAxisAngle(AZ, -bank); out.multiply(qq); }
    return out;
  }
  const rtAxis = new V3();
  function rotateToward(dir, target, maxAng) {
    const ang = Math.acos(clamp(dir.dot(target), -1, 1));
    if (ang <= maxAng) { dir.copy(target); return; }
    rtAxis.crossVectors(dir, target);
    if (rtAxis.lengthSq() < 1e-8) rtAxis.set(0, 1, 0);
    rtAxis.normalize();
    dir.applyAxisAngle(rtAxis, maxAng).normalize();
  }

  // ---------------------------------------------------------------- 自機の見た目
  function updatePlayerVisual() {
    const p = player, m = p.mesh;
    m.position.copy(p.pos);
    m.quaternion.copy(p.quat);
    m.visible = G.state !== 'dead' && G.state !== 'gameover' && !(G.camMode === 'cockpit' && ['flight', 'launch', 'landing'].includes(G.state));
    const on = p.fuel > 0 && G.state !== 'dead';
    const thr = G.state === 'deck' ? 0.15 : 0.45;
    const len = on ? (thr + p.ab * 1.2) * rand(0.85, 1.15) : 0;
    for (const f of m.parts.flames) { f.visible = len > 0.01; f.scale.set(1 + p.ab * 0.25, len, 1 + p.ab * 0.25); }
    for (const f of m.parts.cores) { f.visible = len > 0.01; f.scale.set(1, len * 1.1, 1); }
    for (let i = 0; i < m.parts.msl.length; i++) m.parts.msl[i].visible = i >= MAX_MSL - p.msl;
    if (on && p.ab > 0.5 && G.state !== 'deck') {
      for (const x of [0.62, -0.62]) {
        _v1.copy(p.pos).addScaledVector(p.right, x).addScaledVector(p.fwd, -9.5);
        FX.engineGlow(_v1, _v2.copy(p.vel).multiplyScalar(0.7), 2.4 * p.ab);
      }
    }
    // 被弾時の煙
    if (p.hp < 40 && (G.state === 'flight' || G.state === 'landing')) FX.burn(_v1.copy(p.pos).addScaledVector(p.fwd, 4), 0.5, p.vel);
  }

  // ---------------------------------------------------------------- カメラ
  const camQuat = new Q();
  const camOff = new V3(0, 4.6, 18);
  const camDesP = new V3(), camDesQ = new Q();
  const _m = new THREE.Matrix4();
  let fov = 60;

  function lookQuat(eye, target, out) {
    _m.lookAt(eye, target, UP);
    return out.setFromRotationMatrix(_m);
  }

  function updateCamera(dt) {
    const p = player;
    let targetFov = 60;
    let blend = G.camBlend;
    const speedF = clamp((p.speed - 120) / 330, 0, 1);
    if (G.state === 'title' || G.state === 'deck' || G.state === 'gameover') {
      G.orbitA += dt * 0.12;
      const r = G.state === 'title' ? 46 : 30;
      camDesP.set(Math.sin(G.orbitA) * r, G.state === 'title' ? 14 : 8, Math.cos(G.orbitA) * r).add(p.pos);
      lookQuat(camDesP, _v1.copy(p.pos).add(_v2.set(0, 1.5, 0)), camDesQ);
      targetFov = 55;
      camQuat.copy(p.quat);
    } else if (G.state === 'dead') {
      G.orbitA += dt * 0.25;
      camDesP.set(Math.sin(G.orbitA) * 230, 95, Math.cos(G.orbitA) * 230).add(G.deathPos);
      lookQuat(camDesP, G.deathPos, camDesQ);
      targetFov = 60;
      blend = Math.min(blend, 1 - Math.exp(-dt * 2));
    } else {
      if (G.camMode === 'cockpit') {
        camDesP.set(0, 1.2, -3.6).applyQuaternion(p.quat).add(p.pos);
        camDesQ.copy(p.quat);
        camQuat.copy(p.quat);
      } else {
        camQuat.slerp(p.quat, 1 - Math.exp(-dt * 6.5));
        let back = 17 + speedF * 8 + p.ab * 3;
        let upOff = 4.6;
        if (G.state === 'launch' && G.launchPhase === 'spool') { back = 19; upOff = 4.2; }
        camOff.set(0, upOff, back);
        camDesP.copy(camOff).applyQuaternion(camQuat).add(p.pos);
        _q1.setFromAxisAngle(AX, -0.05);
        camDesQ.copy(camQuat).multiply(_q1);
      }
      if (G.state === 'launch' && G.launchPhase === 'cat') blend = 1 - Math.exp(-dt * 2.2);
      targetFov = 64 + speedF * 30 + p.ab * 6;
      if (G.state === 'launch' && G.launchPhase === 'cat') targetFov = 64 + Math.min(1, G.st / 1.5) * 34;
    }
    camera.position.lerp(camDesP, blend);
    camera.quaternion.slerp(camDesQ, blend);
    if (camera.position.y < 3) camera.position.y = 3;
    G.camBlend = Math.min(1, G.camBlend + dt * 0.7);

    // 振動
    if (G.shake > 0.001) {
      const s = G.shake;
      camera.position.x += rand(-1, 1) * s * 0.5;
      camera.position.y += rand(-1, 1) * s * 0.5;
      camera.position.z += rand(-1, 1) * s * 0.5;
      camera.rotateZ(rand(-1, 1) * s * 0.006);
      camera.rotateX(rand(-1, 1) * s * 0.004);
      G.shake *= Math.exp(-dt * 3.5);
    }
    // スピードで常に細かく揺れる
    if (['flight', 'launch'].includes(G.state)) {
      const s = speedF * speedF * 0.12 + p.ab * 0.08;
      camera.position.x += rand(-1, 1) * s; camera.position.y += rand(-1, 1) * s;
    }
    fov += (targetFov - fov) * Math.min(1, dt * 3);
    camera.fov = fov;
    camera.updateProjectionMatrix();
    FX.setScale(renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)));
  }

  // ---------------------------------------------------------------- HUD
  const projV = new V3();
  function project(wp) {
    projV.copy(wp).project(camera);
    const behind = projV.z > 1;
    let x = (projV.x + 1) / 2 * innerWidth, y = (1 - projV.y) / 2 * innerHeight;
    if (behind) { x = innerWidth - x; y = innerHeight - y; }
    const on = !behind && x > 0 && x < innerWidth && y > 0 && y < innerHeight;
    return { x, y, behind, on };
  }

  function edgeArrow(s, color, label) {
    const cx = innerWidth / 2, cy = innerHeight / 2;
    let dx = s.x - cx, dy = s.y - cy;
    if (s.behind && Math.abs(dx) < 1 && Math.abs(dy) < 1) dy = 1;
    const a = Math.atan2(dy, dx);
    const rx = innerWidth / 2 - 50, ry = innerHeight / 2 - 50;
    const k = Math.min(rx / Math.abs(Math.cos(a) || 1e-6), ry / Math.abs(Math.sin(a) || 1e-6));
    const x = cx + Math.cos(a) * k, y = cy + Math.sin(a) * k;
    octx.save(); octx.translate(x, y); octx.rotate(a);
    octx.fillStyle = color;
    octx.beginPath(); octx.moveTo(18, 0); octx.lineTo(-8, -11); octx.lineTo(-8, 11); octx.closePath(); octx.fill();
    octx.restore();
    octx.fillStyle = color; octx.font = 'bold 13px monospace'; octx.textAlign = 'center';
    octx.fillText(label, x - Math.cos(a) * 32, y - Math.sin(a) * 26 + 4);
  }

  function bracket(x, y, r, color, lw) {
    const k = r * 0.45;
    octx.strokeStyle = color; octx.lineWidth = lw || 2;
    octx.beginPath();
    octx.moveTo(x - r, y - r + k); octx.lineTo(x - r, y - r); octx.lineTo(x - r + k, y - r);
    octx.moveTo(x + r - k, y - r); octx.lineTo(x + r, y - r); octx.lineTo(x + r, y - r + k);
    octx.moveTo(x + r, y + r - k); octx.lineTo(x + r, y + r); octx.lineTo(x + r - k, y + r);
    octx.moveTo(x - r + k, y + r); octx.lineTo(x - r, y + r); octx.lineTo(x - r, y + r - k);
    octx.stroke();
  }

  const km = d => (d >= 1000 ? (d / 1000).toFixed(1) + 'km' : Math.round(d) + 'm');

  function drawOverlay() {
    octx.clearRect(0, 0, innerWidth, innerHeight);
    if (!['flight', 'landing', 'launch', 'deck'].includes(G.state)) return;
    const p = player;
    const flying = G.state === 'flight';

    // 照準
    if (flying) {
      const s = project(_v1.copy(p.pos).addScaledVector(p.fwd, 700));
      if (!s.behind) {
        octx.strokeStyle = 'rgba(157,255,176,0.9)'; octx.lineWidth = 2;
        octx.beginPath(); octx.arc(s.x, s.y, 16, 0, Math.PI * 2); octx.stroke();
        octx.beginPath();
        octx.moveTo(s.x - 28, s.y); octx.lineTo(s.x - 8, s.y); octx.moveTo(s.x + 8, s.y); octx.lineTo(s.x + 28, s.y);
        octx.moveTo(s.x, s.y + 8); octx.lineTo(s.x, s.y + 20);
        octx.stroke();
        octx.fillStyle = 'rgba(157,255,176,0.9)'; octx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
      }
    }

    // 敵機マーカー
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = e.pos.distanceTo(p.pos);
      if (d > 9000) continue;
      const s = project(e.pos);
      if (!s.on) continue;
      const r = clamp(2400 / d, 8, 30);
      const isT = p.lockTarget === e;
      bracket(s.x, s.y, r, isT && p.locked ? '#ff3030' : 'rgba(255,90,70,0.9)', isT ? 3 : 2);
      octx.fillStyle = 'rgba(255,120,100,0.95)'; octx.font = 'bold 11px monospace'; octx.textAlign = 'center';
      octx.fillText(km(d), s.x, s.y + r + 13);
    }

    // 敵空母
    if (enemyCarrier && enemyCarrier.alive) {
      const tp = carrierAim(enemyCarrier, _v2);
      const d = tp.distanceTo(p.pos);
      const s = project(tp);
      if (s.on) {
        bracket(s.x, s.y, clamp(30000 / d, 14, 70), '#ff5040', p.lockTarget === enemyCarrier ? 3.5 : 2.5);
        octx.fillStyle = '#ff7060'; octx.font = 'bold 13px monospace'; octx.textAlign = 'center';
        octx.fillText('TARGET ' + km(d), s.x, s.y - clamp(30000 / d, 14, 70) - 8);
      } else edgeArrow(s, '#ff5040', 'TGT');
    }

    // ロックオン表示
    if (flying && p.lockTarget) {
      const tp = targetPos(p.lockTarget, _v3);
      const s = project(tp);
      if (s.on) {
        octx.save(); octx.translate(s.x, s.y);
        if (p.locked) {
          octx.strokeStyle = '#ff2020'; octx.lineWidth = 3;
          octx.rotate(Math.PI / 4);
          octx.strokeRect(-26, -26, 52, 52);
          octx.restore();
          octx.fillStyle = '#ff2020'; octx.font = 'bold 15px monospace'; octx.textAlign = 'center';
          octx.fillText('LOCK', s.x, s.y + 52);
        } else {
          const k = 1 - Math.min(1, p.lockTime / 0.55);
          octx.strokeStyle = '#ffd040'; octx.lineWidth = 2;
          octx.rotate(G.t * 4);
          octx.beginPath(); octx.arc(0, 0, 24 + k * 50, 0, Math.PI * 1.5); octx.stroke();
          octx.restore();
        }
      }
    }

    // 母艦
    {
      const tp = toWorld(home, _v2.set(0, 25, 0), _v4);
      const d = tp.distanceTo(p.pos);
      const s = project(tp);
      const low = p.fuel < 35;
      const col = low && Math.floor(G.t * 3) % 2 ? '#ffffff' : '#50ff8a';
      if (G.state !== 'deck' && G.state !== 'launch') {
        if (s.on) {
          octx.strokeStyle = col; octx.lineWidth = 2;
          octx.beginPath(); octx.moveTo(s.x, s.y - 14); octx.lineTo(s.x + 14, s.y); octx.lineTo(s.x, s.y + 14); octx.lineTo(s.x - 14, s.y); octx.closePath(); octx.stroke();
          octx.fillStyle = col; octx.font = 'bold 13px monospace'; octx.textAlign = 'center';
          octx.fillText('HOME ' + km(d), s.x, s.y - 20);
        } else edgeArrow(s, col, 'HOME');
      }
    }
  }

  function drawRadar() {
    const W = radar.width, c = W / 2, R = W / 2 - 6;
    const RANGE = 13000, k = R / RANGE;
    rctx.clearRect(0, 0, W, W);
    rctx.fillStyle = 'rgba(0,30,10,0.55)';
    rctx.beginPath(); rctx.arc(c, c, R, 0, Math.PI * 2); rctx.fill();
    rctx.strokeStyle = 'rgba(157,255,176,0.6)'; rctx.lineWidth = 2; rctx.stroke();
    rctx.strokeStyle = 'rgba(157,255,176,0.2)';
    for (const f of [0.33, 0.66]) { rctx.beginPath(); rctx.arc(c, c, R * f, 0, Math.PI * 2); rctx.stroke(); }
    const p = player;
    const h = Math.atan2(p.fwd.x, -p.fwd.z);
    const sh = Math.sin(h), ch = Math.cos(h);
    const plot = (wp, color, size, shape) => {
      const dx = wp.x - p.pos.x, dz = wp.z - p.pos.z;
      const f = dx * sh - dz * ch, r = dx * ch + dz * sh;
      let x = r * k, y = -f * k;
      const l = Math.hypot(x, y);
      if (l > R - 4) { x *= (R - 4) / l; y *= (R - 4) / l; }
      rctx.fillStyle = color;
      if (shape === 'sq') rctx.fillRect(c + x - size, c + y - size, size * 2, size * 2);
      else { rctx.beginPath(); rctx.arc(c + x, c + y, size, 0, Math.PI * 2); rctx.fill(); }
    };
    plot(home.pos, '#50ff8a', 7, 'sq');
    if (enemyCarrier && enemyCarrier.alive) plot(enemyCarrier.pos, Math.floor(G.t * 2) % 2 ? '#ff4030' : '#ffa090', 8, 'sq');
    for (const e of enemies) if (e.alive) plot(e.pos, '#ff5040', 4);
    for (const m of missiles) plot(m.pos, '#ffffff', 2);
    // 自機
    rctx.fillStyle = '#ffffff';
    rctx.beginPath(); rctx.moveTo(c, c - 10); rctx.lineTo(c + 7, c + 8); rctx.lineTo(c, c + 4); rctx.lineTo(c - 7, c + 8); rctx.closePath(); rctx.fill();
    rctx.fillStyle = 'rgba(157,255,176,0.8)'; rctx.font = 'bold 18px monospace'; rctx.textAlign = 'center';
    rctx.fillText('N', c - sh * (R - 16), c - ch * (R - 16) + 6);
  }

  const hudEls = {};
  ['score', 'stage', 'kills', 'lives', 'speed', 'mach', 'alt', 'thr', 'fuelBar', 'fuelTxt', 'hpBar', 'hpTxt', 'ammo', 'msl', 'warning', 'hint', 'ecWrap', 'ecBar', 'centerMsg', 'subMsg'].forEach(id => (hudEls[id] = $(id)));
  const setText = (el, v) => { v = String(v); if (el._v !== v) { el._v = v; el.textContent = v; } };
  const setHtml = (el, v) => { if (el._h !== v) { el._h = v; el.innerHTML = v; } };

  function updateHUD(dt) {
    const p = player, h = hudEls;
    setText(h.score, G.score); setText(h.stage, G.stage); setText(h.kills, G.kills);
    setText(h.lives, '✈'.repeat(Math.max(0, G.lives)));
    setText(h.speed, Math.round(p.speed * 3.6));
    setText(h.mach, (p.speed / MACH1).toFixed(2));
    setText(h.alt, Math.max(0, Math.round(p.pos.y)));
    setText(h.thr, p.abOn ? '▶▶ AFTERBURNER' : p.fuel <= 0 ? 'ENGINE OFF' : '');
    const fuel = Math.ceil(p.fuel);
    h.fuelBar.style.width = p.fuel + '%';
    h.fuelBar.style.background = p.fuel < 15 ? '#ff3b2f' : p.fuel < 35 ? '#ffc23b' : '#9dffb0';
    setText(h.fuelTxt, fuel + '%');
    h.hpBar.style.width = Math.max(0, p.hp) + '%';
    h.hpBar.style.background = p.hp < 30 ? '#ff3b2f' : p.hp < 60 ? '#ffc23b' : '#9dffb0';
    setText(h.hpTxt, Math.ceil(Math.max(0, p.hp)) + '%');
    setText(h.ammo, Math.floor(p.ammo)); setText(h.msl, p.msl);
    if (enemyCarrier && enemyCarrier.alive) {
      h.ecWrap.style.display = '';
      h.ecBar.style.width = (enemyCarrier.hp / enemyCarrier.maxHp * 100) + '%';
    } else h.ecWrap.style.display = 'none';

    // 警告
    let warn = '';
    if (G.state === 'flight') {
      const homeD = Math.hypot(p.pos.x - home.pos.x, p.pos.z - home.pos.z);
      const need = homeD / 250 * 0.8 + 6; // 巡航で帰るのに必要な燃料の目安
      if (p.fuel <= 0) warn = 'FLAME OUT — Lキーで着艦できる距離まで滑空せよ';
      else if (p.fuel < 15 || p.fuel < need) warn = 'BINGO FUEL!! 今すぐ母艦へ帰還せよ';
      else if (p.fuel < 35) warn = 'FUEL LOW — 母艦へ帰還せよ';
      if (p.hp < 30) warn = (warn ? warn + '<br>' : '') + 'DAMAGE CRITICAL';
      if (p.pos.y < 150 && p.fwd.y < -0.25) warn = 'PULL UP!! PULL UP!!';
      if (Math.hypot(p.pos.x, p.pos.z) > 22000) warn = (warn ? warn + '<br>' : '') + '作戦空域外 — 引き返せ';
      if (warn) {
        G.warnT -= dt;
        if (G.warnT <= 0) { G.warnT = p.fuel < 15 || warn.startsWith('PULL') ? 0.5 : 1.2; Sfx.beep(warn.startsWith('PULL') ? 1100 : 740, 0.12, 0.08); }
      }
    }
    setHtml(h.warning, warn ? `<span class="blink">${warn}</span>` : '');

    let hint = '';
    if (G.state === 'deck') hint = G.ready ? '<span class="blink">SPACE / ENTER : 発艦！</span>' : `給油・補給中… ${Math.floor(p.fuel)}%`;
    else if (G.state === 'flight' && inLandingZone()) hint = `<span class="blink" style="color:#50ff8a">L : 着艦アプローチ</span>`;
    else if (G.state === 'flight' && p.fuel < 35) hint = '<span style="color:#ffc23b">緑の HOME マーカーの方向へ飛べ</span>';
    setHtml(h.hint, hint);

    if (msgT > 0) {
      msgT -= dt;
      if (msgT <= 0) { h.centerMsg.style.opacity = 0; h.subMsg.style.opacity = 0; }
    }
    G.dmgFlash = Math.max(0, G.dmgFlash - dt * 1.8);
    $('damageFlash').style.opacity = G.dmgFlash;
    const speedF = clamp((p.speed - 150) / 300, 0, 1);
    $('vignette').style.opacity = ['flight', 'launch'].includes(G.state) ? speedF * 0.8 + p.ab * 0.2 : 0.15;
  }

  // ---------------------------------------------------------------- メインループ
  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (G.paused) { renderer.render(scene, camera); return; }
    G.t += dt; G.st += dt;
    const inp = readInput();

    switch (G.state) {
      case 'title': if (G.st < 0.02) placeOnDeck(CAT_Z); break;
      case 'deck': updateDeck(dt); break;
      case 'launch': updateLaunch(dt); break;
      case 'flight': updateFlight(dt, inp); break;
      case 'landing': updateLanding(dt); break;
      case 'dead':
        if (G.st > 3.8) {
          if (G.lives > 0) {
            resupply();
            enterDeck(false);
            showMsg('再出撃準備完了', 'SPACE / ENTER で発艦', 2.5);
          } else gameOver();
        }
        break;
    }
    if (G.state !== 'title' && G.state !== 'gameover') {
      updateLock(dt);
      updateEnemies(dt);
      updateEnemyCarrier(dt);
      updateSinking(dt);
      updateBullets(dt);
      updateMissiles(dt);
      if (G.stageClearT > 0) { G.stageClearT -= dt; if (G.stageClearT <= 0) nextStage(); }
    }
    home.radar.rotation.y += dt * 1.2;

    // 暗転（着艦ワープ）
    if (G.fadeDir !== 0) {
      G.fade += G.fadeDir * dt * 2.5;
      if (G.fadeDir > 0 && G.fade >= 1) { G.fade = 1; G.fadeDir = -1; if (G.onFadeMid) { G.onFadeMid(); G.onFadeMid = null; } }
      if (G.fadeDir < 0 && G.fade <= 0) { G.fade = 0; G.fadeDir = 0; }
      $('fade').style.opacity = G.fade;
    }

    updatePlayerVisual();
    updateCamera(dt);
    _v1.set(0, 0, -1).applyQuaternion(camera.quaternion);
    const flyingish = G.state === 'flight' || G.state === 'launch' || G.state === 'landing';
    speedLines.update(camera.position, _v1, flyingish ? player.speed : 0, player.ab);
    FX.update(dt);
    world.update(camera.position);
    const pv = player.speed / 450;
    Sfx.engine(G.state !== 'dead' && G.state !== 'title' && G.state !== 'gameover' && player.fuel > 0,
      G.state === 'deck' ? 0.2 : 0.6, flyingish ? clamp(pv, 0, 1) : 0, player.ab);

    renderer.render(scene, camera);
    if (G.state !== 'title' && G.state !== 'gameover') {
      drawOverlay();
      drawRadar();
      updateHUD(dt);
    } else octx.clearRect(0, 0, innerWidth, innerHeight);
  }

  placeOnDeck(CAT_Z);
  camera.position.set(40, 30, 60);
  camera.lookAt(player.pos);
  requestAnimationFrame(loop);

  // デバッグ・自動テスト用
  window.__game = { G, player, enemies, get enemyCarrier() { return enemyCarrier; }, home, startGame, tryLaunch, tryLanding, fireMissile, keys };
})();
