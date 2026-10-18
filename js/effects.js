// 爆炎・煙・火花・衝撃波・曳光弾・スピードラインなどのエフェクト
const FX = (() => {
  const K_FIRE = 0, K_SPARK = 1, K_FLASH = 2, K_SMOKE = 3, K_WATER = 4, K_GLOW = 5;
  const uScale = { value: 600 };
  const rand = (a, b) => a + Math.random() * (b - a);

  const VS = `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale;
    varying float vA; varying vec3 vC;
    void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv;
      gl_PointSize = aAlpha <= 0.0 ? 0.0 : aSize * uScale / max(1.0, -mv.z); vA = aAlpha; vC = aColor; }`;
  const FS_ADD = `varying float vA; varying vec3 vC;
    void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0; if (d > 1.0) discard;
      float a = pow(1.0 - d, 1.5); gl_FragColor = vec4(vC * (0.7 + 0.9 * (1.0 - d)), a * vA); }`;
  const FS_SMOKE = `varying float vA; varying vec3 vC;
    void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0; if (d > 1.0) discard;
      float a = smoothstep(1.0, 0.25, d); gl_FragColor = vec4(vC * (0.8 + 0.25 * (1.0 - d)), a * vA); }`;

  class Particles {
    constructor(scene, max, additive) {
      this.max = max; this.i = 0;
      this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
      this.col = new Float32Array(max * 3); this.base = new Float32Array(max * 3);
      this.size = new Float32Array(max); this.alpha = new Float32Array(max);
      this.life = new Float32Array(max); this.maxLife = new Float32Array(max).fill(1);
      this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
      this.drag = new Float32Array(max); this.grav = new Float32Array(max);
      this.a0 = new Float32Array(max); this.kind = new Uint8Array(max);
      const geo = new THREE.BufferGeometry();
      this.attrs = [
        new THREE.BufferAttribute(this.pos, 3), new THREE.BufferAttribute(this.col, 3),
        new THREE.BufferAttribute(this.size, 1), new THREE.BufferAttribute(this.alpha, 1),
      ];
      this.attrs.forEach(a => a.setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('position', this.attrs[0]);
      geo.setAttribute('aColor', this.attrs[1]);
      geo.setAttribute('aSize', this.attrs[2]);
      geo.setAttribute('aAlpha', this.attrs[3]);
      const mat = new THREE.ShaderMaterial({
        uniforms: { uScale }, vertexShader: VS, fragmentShader: additive ? FS_ADD : FS_SMOKE,
        transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      });
      this.points = new THREE.Points(geo, mat);
      this.points.frustumCulled = false;
      this.points.renderOrder = additive ? 3 : 2;
      scene.add(this.points);
    }

    spawn(x, y, z, vx, vy, vz, life, s0, s1, kind, drag, grav, r, g, b, a0) {
      const i = this.i; this.i = (i + 1) % this.max;
      const j = i * 3;
      this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
      this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
      this.base[j] = r === undefined ? 1 : r; this.base[j + 1] = g === undefined ? 1 : g; this.base[j + 2] = b === undefined ? 1 : b;
      this.life[i] = life; this.maxLife[i] = life;
      this.s0[i] = s0; this.s1[i] = s1; this.size[i] = s0;
      this.kind[i] = kind; this.drag[i] = drag || 0; this.grav[i] = grav || 0;
      this.a0[i] = a0 === undefined ? 1 : a0;
      this.alpha[i] = 0.0001;
    }

    update(dt) {
      const P = this.pos, V = this.vel, C = this.col, B = this.base;
      for (let i = 0; i < this.max; i++) {
        if (this.life[i] <= 0) { if (this.alpha[i] !== 0) this.alpha[i] = 0; continue; }
        this.life[i] -= dt;
        if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
        const t = 1 - this.life[i] / this.maxLife[i];
        const j = i * 3;
        const dr = Math.max(0, 1 - this.drag[i] * dt);
        V[j] *= dr; V[j + 1] = V[j + 1] * dr - this.grav[i] * dt; V[j + 2] *= dr;
        P[j] += V[j] * dt; P[j + 1] += V[j + 1] * dt; P[j + 2] += V[j + 2] * dt;
        const e = 1 - (1 - t) * (1 - t);
        this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * e;
        const a0 = this.a0[i];
        switch (this.kind[i]) {
          case K_FIRE: {
            let r, g, b;
            if (t < 0.12) { const k = t / 0.12; r = 1; g = 1 - 0.12 * k; b = 0.85 - 0.5 * k; }
            else if (t < 0.38) { const k = (t - 0.12) / 0.26; r = 1; g = 0.88 - 0.45 * k; b = 0.35 - 0.27 * k; }
            else if (t < 0.7) { const k = (t - 0.38) / 0.32; r = 1 - 0.35 * k; g = 0.43 - 0.3 * k; b = 0.08 - 0.05 * k; }
            else { const k = (t - 0.7) / 0.3; r = 0.65 - 0.5 * k; g = 0.13 - 0.09 * k; b = 0.03; }
            C[j] = r; C[j + 1] = g; C[j + 2] = b;
            this.alpha[i] = a0 * (1 - t * t);
            break;
          }
          case K_SPARK:
            C[j] = 1; C[j + 1] = 0.9 - 0.5 * t; C[j + 2] = 0.5 - 0.45 * t;
            this.alpha[i] = a0 * (1 - t);
            break;
          case K_FLASH:
            C[j] = 1; C[j + 1] = 0.97; C[j + 2] = 0.88;
            this.alpha[i] = a0 * (1 - t) * (1 - t);
            break;
          case K_SMOKE:
            C[j] = B[j]; C[j + 1] = B[j + 1]; C[j + 2] = B[j + 2];
            this.alpha[i] = a0 * Math.min(1, t * 7) * (1 - t);
            break;
          case K_WATER:
            C[j] = B[j]; C[j + 1] = B[j + 1]; C[j + 2] = B[j + 2];
            this.alpha[i] = a0 * (1 - t);
            if (P[j + 1] < 0) { P[j + 1] = 0; V[j + 1] = 0; }
            break;
          default:
            C[j] = B[j]; C[j + 1] = B[j + 1]; C[j + 2] = B[j + 2];
            this.alpha[i] = a0 * (1 - t);
        }
      }
      for (const a of this.attrs) a.needsUpdate = true;
    }
  }

  // 曳光弾（線＋光点）
  class Tracers {
    constructor(scene, max) {
      this.max = max; this.n = 0;
      this.lp = new Float32Array(max * 6); this.lc = new Float32Array(max * 6);
      const lg = new THREE.BufferGeometry();
      this.lpa = new THREE.BufferAttribute(this.lp, 3).setUsage(THREE.DynamicDrawUsage);
      this.lca = new THREE.BufferAttribute(this.lc, 3).setUsage(THREE.DynamicDrawUsage);
      lg.setAttribute('position', this.lpa); lg.setAttribute('color', this.lca);
      this.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      this.lines.frustumCulled = false; this.lines.renderOrder = 4;
      scene.add(this.lines);
      this.hp = new Float32Array(max * 3); this.hc = new Float32Array(max * 3);
      this.hs = new Float32Array(max); this.ha = new Float32Array(max);
      const hg = new THREE.BufferGeometry();
      this.hattrs = [
        new THREE.BufferAttribute(this.hp, 3), new THREE.BufferAttribute(this.hc, 3),
        new THREE.BufferAttribute(this.hs, 1), new THREE.BufferAttribute(this.ha, 1),
      ];
      this.hattrs.forEach(a => a.setUsage(THREE.DynamicDrawUsage));
      hg.setAttribute('position', this.hattrs[0]); hg.setAttribute('aColor', this.hattrs[1]);
      hg.setAttribute('aSize', this.hattrs[2]); hg.setAttribute('aAlpha', this.hattrs[3]);
      this.heads = new THREE.Points(hg, new THREE.ShaderMaterial({ uniforms: { uScale }, vertexShader: VS, fragmentShader: FS_ADD, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      this.heads.frustumCulled = false; this.heads.renderOrder = 4;
      scene.add(this.heads);
    }
    begin() { this.n = 0; }
    add(ax, ay, az, bx, by, bz, r, g, b, size) {
      if (this.n >= this.max) return;
      const n = this.n++, j = n * 6, k = n * 3;
      this.lp[j] = ax; this.lp[j + 1] = ay; this.lp[j + 2] = az; this.lp[j + 3] = bx; this.lp[j + 4] = by; this.lp[j + 5] = bz;
      this.lc[j] = r; this.lc[j + 1] = g; this.lc[j + 2] = b; this.lc[j + 3] = r * 0.2; this.lc[j + 4] = g * 0.2; this.lc[j + 5] = b * 0.2;
      this.hp[k] = ax; this.hp[k + 1] = ay; this.hp[k + 2] = az;
      this.hc[k] = r; this.hc[k + 1] = g; this.hc[k + 2] = b;
      this.hs[n] = size; this.ha[n] = 0.9;
    }
    end() {
      this.lines.geometry.setDrawRange(0, this.n * 2);
      this.heads.geometry.setDrawRange(0, this.n);
      this.lpa.needsUpdate = this.lca.needsUpdate = true;
      for (const a of this.hattrs) a.needsUpdate = true;
    }
  }

  // カメラ周りを流れていくスピードライン
  class SpeedLines {
    constructor(scene, n) {
      this.n = n; this.pts = new Float32Array(n * 3); this.seeded = false;
      this.buf = new Float32Array(n * 6);
      const g = new THREE.BufferGeometry();
      this.attr = new THREE.BufferAttribute(this.buf, 3).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', this.attr);
      this.mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      this.lines = new THREE.LineSegments(g, this.mat);
      this.lines.frustumCulled = false;
      scene.add(this.lines);
      this.u = new THREE.Vector3(); this.w = new THREE.Vector3(); this.tmp = new THREE.Vector3();
    }
    respawn(i, cam, f, near, far) {
      const r = rand(10, 120), th = Math.random() * Math.PI * 2, d = rand(near, far);
      const j = i * 3, u = this.u, w = this.w;
      this.pts[j] = cam.x + f.x * d + (u.x * Math.cos(th) + w.x * Math.sin(th)) * r;
      this.pts[j + 1] = cam.y + f.y * d + (u.y * Math.cos(th) + w.y * Math.sin(th)) * r;
      this.pts[j + 2] = cam.z + f.z * d + (u.z * Math.cos(th) + w.z * Math.sin(th)) * r;
    }
    update(cam, f, speed, boost) {
      const k = Math.min(1, Math.max(0, (speed - 140) / 280));
      this.mat.opacity = k * (0.35 + boost * 0.3);
      this.lines.visible = k > 0.01;
      if (!this.lines.visible) { this.seeded = false; return; }
      this.tmp.set(0, 1, 0);
      if (Math.abs(f.y) > 0.9) this.tmp.set(1, 0, 0);
      this.u.crossVectors(f, this.tmp).normalize();
      this.w.crossVectors(f, this.u).normalize();
      const len = 6 + speed * 0.06;
      for (let i = 0; i < this.n; i++) {
        const j = i * 3;
        if (!this.seeded) this.respawn(i, cam, f, -10, 650);
        const rx = this.pts[j] - cam.x, ry = this.pts[j + 1] - cam.y, rz = this.pts[j + 2] - cam.z;
        const along = rx * f.x + ry * f.y + rz * f.z;
        if (along < -15 || rx * rx + ry * ry + rz * rz > 720 * 720) this.respawn(i, cam, f, 300, 680);
        const b = i * 6;
        this.buf[b] = this.pts[j]; this.buf[b + 1] = this.pts[j + 1]; this.buf[b + 2] = this.pts[j + 2];
        this.buf[b + 3] = this.pts[j] + f.x * len; this.buf[b + 4] = this.pts[j + 1] + f.y * len; this.buf[b + 5] = this.pts[j + 2] + f.z * len;
      }
      this.seeded = true;
      this.attr.needsUpdate = true;
    }
  }

  let scene, camera, fire, smoke, light;
  const rings = [], debris = [];
  const _d = new THREE.Vector3();

  function rdir() {
    // 単位球上のランダム方向
    const z = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    return _d.set(r * Math.cos(a), z, r * Math.sin(a));
  }

  function init(sc, cam) {
    scene = sc; camera = cam;
    fire = new Particles(scene, 9000, true);
    smoke = new Particles(scene, 5000, false);
    light = new THREE.PointLight(0xffa040, 0, 1200, 0);
    scene.add(light);
    const ringGeo = new THREE.RingGeometry(0.82, 1, 64);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd8a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      m.visible = false; m.renderOrder = 5; scene.add(m);
      rings.push({ m, t: 0, dur: 1, r: 1, flat: false });
    }
    const dGeo = new THREE.BoxGeometry(1, 1, 1);
    const dMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.8, flatShading: true });
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(dGeo, dMat); m.visible = false; scene.add(m);
      debris.push({ m, v: new THREE.Vector3(), s: new THREE.Vector3(), life: 0, scale: 1 });
    }
  }

  function setScale(px) { uScale.value = px; }

  function shockwave(p, radius, dur, flat, color) {
    const r = rings.find(x => !x.m.visible) || rings[0];
    r.m.visible = true; r.t = 0; r.dur = dur || 0.7; r.r = radius; r.flat = !!flat;
    r.m.position.copy(p); r.m.material.color.setHex(color || 0xffd8a0);
    if (flat) r.m.rotation.set(-Math.PI / 2, 0, 0);
  }

  function spawnDebris(p, n, s, v) {
    for (let i = 0; i < n; i++) {
      const d = debris.find(x => !x.m.visible);
      if (!d) return;
      d.m.visible = true; d.m.position.copy(p);
      rdir();
      d.v.copy(_d).multiplyScalar(rand(40, 120) * Math.min(2.5, s));
      d.v.y = Math.abs(d.v.y) * 1.2 + 20;
      if (v) d.v.addScaledVector(v, 0.4);
      d.s.set(rand(-8, 8), rand(-8, 8), rand(-8, 8));
      const sc = rand(0.6, 2.2) * Math.min(3, s);
      d.m.scale.set(sc, sc * rand(0.3, 1), sc * rand(0.5, 1.5));
      d.life = rand(1.8, 3.6); d.scale = s;
    }
  }

  function splash(p, s) {
    for (let i = 0; i < 40 * s; i++) {
      rdir();
      smoke.spawn(p.x + _d.x * 6 * s, 0.5, p.z + _d.z * 6 * s, _d.x * rand(5, 30) * s, rand(25, 80) * Math.sqrt(s), _d.z * rand(5, 30) * s,
        rand(1.4, 2.6), rand(4, 8) * s, rand(18, 34) * s, K_WATER, 0.6, 38, 0.92, 0.96, 1, 0.85);
    }
    shockwave({ x: p.x, y: 0.6, z: p.z, isVector3: true }, 40 * s, 1.4, true, 0xffffff);
  }

  // 大爆発！
  function explosion(p, s, v, opt) {
    s = s || 1; opt = opt || {};
    const vx = v ? v.x * 0.3 : 0, vy = v ? v.y * 0.3 : 0, vz = v ? v.z * 0.3 : 0;
    fire.spawn(p.x, p.y, p.z, vx, vy, vz, 0.22, 40 * s, 130 * s, K_FLASH, 0, 0, 1, 1, 1, 1);
    fire.spawn(p.x, p.y, p.z, vx, vy, vz, 0.5, 20 * s, 70 * s, K_FLASH, 0, 0, 1, 1, 1, 0.8);
    const n = Math.min(160, Math.floor(30 * s + 14));
    for (let i = 0; i < n; i++) {
      rdir();
      const sp = rand(6, 48) * s, o = rand(0, 5) * s;
      fire.spawn(p.x + _d.x * o, p.y + _d.y * o, p.z + _d.z * o, _d.x * sp + vx, _d.y * sp + vy, _d.z * sp + vz,
        rand(0.7, 1.6) * (0.85 + s * 0.15), rand(8, 16) * s, rand(26, 52) * s, K_FIRE, 2.2, -8, 1, 1, 1, 1);
    }
    // 外側にゆっくり広がる大きな火球
    for (let i = 0; i < Math.min(40, 8 * s); i++) {
      rdir();
      const sp = rand(15, 30) * s;
      fire.spawn(p.x, p.y, p.z, _d.x * sp + vx, _d.y * sp * 0.6 + vy + 8, _d.z * sp + vz,
        rand(1.4, 2.4), 20 * s, rand(50, 80) * s, K_FIRE, 1.6, -10, 1, 1, 1, 0.7);
    }
    for (let i = 0; i < Math.min(180, 45 * s); i++) {
      rdir();
      const sp = rand(90, 280) * Math.min(2.5, s);
      fire.spawn(p.x, p.y, p.z, _d.x * sp + vx, _d.y * sp + vy, _d.z * sp + vz, rand(0.4, 1.2), rand(1.5, 3) * Math.min(2, s), 0.4, K_SPARK, 1.1, 45, 1, 1, 1, 1);
    }
    for (let i = 0; i < Math.min(60, 16 * s); i++) {
      rdir();
      const sp = rand(5, 22) * s, c = rand(0.1, 0.22);
      smoke.spawn(p.x + _d.x * 4 * s, p.y + _d.y * 4 * s, p.z + _d.z * 4 * s, _d.x * sp + vx * 0.4, _d.y * sp + 6 + vy * 0.4, _d.z * sp + vz * 0.4,
        rand(2.8, 5.5), 16 * s, rand(60, 120) * s, K_SMOKE, 0.9, -5, c, c * 0.95, c * 0.9, 0.78);
    }
    if (!opt.noDebris) spawnDebris(p, Math.floor(4 + s * 3), s, v);
    shockwave(p, 75 * s, 0.6 + s * 0.1);
    light.position.copy(p);
    light.intensity = Math.max(light.intensity, 7 * s);
    light.distance = 500 * s;
    if (p.y < 30) splash(p, s * 0.8);
  }

  function hitSpark(p, big) {
    const s = big ? 2 : 1;
    for (let i = 0; i < 6 * s; i++) {
      rdir();
      fire.spawn(p.x, p.y, p.z, _d.x * 20, _d.y * 20, _d.z * 20, rand(0.25, 0.5), 3 * s, 9 * s, K_FIRE, 3, 0, 1, 1, 1, 1);
    }
    for (let i = 0; i < 10 * s; i++) {
      rdir();
      const sp = rand(60, 160);
      fire.spawn(p.x, p.y, p.z, _d.x * sp, _d.y * sp, _d.z * sp, rand(0.2, 0.5), 1.2, 0.3, K_SPARK, 1, 40, 1, 1, 1, 1);
    }
    fire.spawn(p.x, p.y, p.z, 0, 0, 0, 0.08, 8 * s, 16 * s, K_FLASH, 0, 0, 1, 1, 1, 1);
  }

  // 燃え続ける炎（被弾機・残骸・炎上する空母）
  function burn(p, s, v) {
    const vx = v ? v.x * 0.15 : 0, vy = v ? v.y * 0.15 : 0, vz = v ? v.z * 0.15 : 0;
    fire.spawn(p.x + rand(-1, 1) * s, p.y + rand(-1, 1) * s, p.z + rand(-1, 1) * s, vx + rand(-4, 4), vy + rand(4, 14), vz + rand(-4, 4),
      rand(0.5, 1.0), 5 * s, rand(10, 18) * s, K_FIRE, 1.5, -6, 1, 1, 1, 0.9);
    if (Math.random() < 0.5) {
      const c = rand(0.08, 0.18);
      smoke.spawn(p.x, p.y + 2 * s, p.z, vx + rand(-3, 3), vy + rand(6, 14), vz + rand(-3, 3), rand(2.5, 5), 8 * s, rand(30, 60) * s, K_SMOKE, 0.5, -3, c, c, c, 0.65);
    }
  }

  function smokePuff(p, size, shade, life, alpha) {
    const c = shade;
    smoke.spawn(p.x, p.y, p.z, rand(-1, 1), rand(-1, 1), rand(-1, 1), life || 1.6, size, size * 3, K_SMOKE, 1, -1, c, c, c, alpha === undefined ? 0.5 : alpha);
  }

  function engineGlow(p, v, size) {
    fire.spawn(p.x, p.y, p.z, v.x, v.y, v.z, 0.12, size, size * 0.4, K_FIRE, 0, 0, 1, 1, 1, 0.6);
  }

  function flak(p) {
    fire.spawn(p.x, p.y, p.z, 0, 0, 0, 0.12, 14, 26, K_FLASH, 0, 0, 1, 1, 1, 0.9);
    for (let i = 0; i < 6; i++) { rdir(); fire.spawn(p.x, p.y, p.z, _d.x * 25, _d.y * 25, _d.z * 25, 0.4, 5, 12, K_FIRE, 3, 0, 1, 1, 1, 1); }
    for (let i = 0; i < 4; i++) { rdir(); smoke.spawn(p.x + _d.x * 3, p.y + _d.y * 3, p.z + _d.z * 3, _d.x * 6, _d.y * 6, _d.z * 6, rand(2, 3.5), 8, 28, K_SMOKE, 1, -1, 0.08, 0.08, 0.08, 0.8); }
  }

  function steam(p, s) {
    smoke.spawn(p.x + rand(-2, 2), p.y, p.z + rand(-2, 2), rand(-6, 6), rand(4, 12), rand(-6, 6), rand(0.8, 1.6), 3 * s, 14 * s, K_SMOKE, 1.5, -2, 0.95, 0.95, 0.97, 0.55);
  }

  function spray(p, v) {
    smoke.spawn(p.x + rand(-4, 4), 0.5, p.z + rand(-4, 4), v.x * 0.2 + rand(-8, 8), rand(10, 35), v.z * 0.2 + rand(-8, 8), rand(0.6, 1.2), 3, 16, K_WATER, 1, 30, 0.95, 0.97, 1, 0.6);
  }

  function vapor(p, v, size, life, alpha) {
    smoke.spawn(p.x, p.y, p.z, v.x, v.y, v.z, life || 0.5, size, size * 2.5, K_WATER, 2, 0, 1, 1, 1, alpha || 0.35);
  }

  // マッハ突破の衝撃雲（ベイパーコーン）
  function vaporCone(p, f, u, r, v) {
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, rad = rand(3, 9);
      const ca = Math.cos(a), sa = Math.sin(a);
      const ox = (u.x * ca + r.x * sa) * rad, oy = (u.y * ca + r.y * sa) * rad, oz = (u.z * ca + r.z * sa) * rad;
      smoke.spawn(p.x + ox + f.x * rand(-2, 6), p.y + oy + f.y * rand(-2, 6), p.z + oz + f.z * rand(-2, 6),
        v.x * 0.92 + ox * 3, v.y * 0.92 + oy * 3, v.z * 0.92 + oz * 3, rand(0.5, 0.9), 4, 14, K_WATER, 3, 0, 1, 1, 1, 0.75);
    }
    shockwave(p, 120, 0.5, false, 0xffffff);
  }

  function update(dt) {
    fire.update(dt); smoke.update(dt);
    light.intensity *= Math.exp(-dt * 7);
    if (light.intensity < 0.02) light.intensity = 0;
    for (const r of rings) {
      if (!r.m.visible) continue;
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) { r.m.visible = false; continue; }
      const sc = r.r * (1 - Math.pow(1 - k, 3));
      r.m.scale.set(sc, sc, sc);
      r.m.material.opacity = (1 - k) * 0.8;
      if (!r.flat) r.m.lookAt(camera.position);
    }
    for (const d of debris) {
      if (!d.m.visible) continue;
      d.life -= dt;
      d.v.y -= 30 * dt;
      d.v.multiplyScalar(Math.max(0, 1 - 0.4 * dt));
      d.m.position.addScaledVector(d.v, dt);
      d.m.rotation.x += d.s.x * dt; d.m.rotation.y += d.s.y * dt; d.m.rotation.z += d.s.z * dt;
      const p = d.m.position;
      fire.spawn(p.x, p.y, p.z, 0, 2, 0, rand(0.35, 0.6), 3.5 * Math.min(2.5, d.scale), 7 * Math.min(2.5, d.scale), K_FIRE, 1, -4, 1, 1, 1, 0.9);
      if (Math.random() < 0.35) smoke.spawn(p.x, p.y, p.z, 0, 3, 0, rand(1.5, 2.5), 3 * d.scale, 14 * d.scale, K_SMOKE, 0.5, -2, 0.15, 0.15, 0.15, 0.5);
      if (p.y < 0) { d.m.visible = false; for (let i = 0; i < 8; i++) spray(p, d.v); }
      else if (d.life <= 0) d.m.visible = false;
    }
  }

  return {
    init, update, setScale, explosion, hitSpark, burn, smokePuff, engineGlow, flak, steam, spray, vapor, vaporCone, splash, shockwave,
    Tracers, SpeedLines,
    spawnFire: (...a) => fire.spawn(...a), K_FIRE, K_SPARK, K_FLASH,
  };
})();
