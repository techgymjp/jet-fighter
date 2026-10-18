// 機体・空母・海・空・雲のモデル生成
const Models = (() => {
  const jetCache = {};

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }

  function std(color, o) {
    return new THREE.MeshStandardMaterial(Object.assign({ color, metalness: 0.1, roughness: 0.6, flatShading: true }, o || {}));
  }

  // [x, z] の多角形を XZ 平面に置き、y 方向に厚みを持たせた板を作る
  function flatGeo(points, depth) {
    const s = new THREE.Shape();
    points.forEach((p, i) => (i ? s.lineTo(p[0], -p[1]) : s.moveTo(p[0], -p[1])));
    const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  }

  // 機首は -Z 方向。全長およそ 16m
  function makeJetTemplate(enemy) {
    const g = new THREE.Group();
    const body = std(enemy ? 0x5a5f66 : 0x9eacba, { side: THREE.DoubleSide });
    const dark = std(0x2a2e34, { metalness: 0.6, roughness: 0.4 });
    const accent = std(enemy ? 0xb0231b : 0x2f61aa, { side: THREE.DoubleSide });
    const glass = std(0x0e2036, { metalness: 0.9, roughness: 0.08, emissive: 0x061428 });
    const white = std(0xe8ecef);
    const add = (geo, mat, x, y, z, rx, ry, rz, name, parent) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x || 0, y || 0, z || 0);
      m.rotation.set(rx || 0, ry || 0, rz || 0);
      if (name) m.name = name;
      (parent || g).add(m);
      return m;
    };

    add(new THREE.CylinderGeometry(1.15, 0.85, 11, 12), body, 0, 0, 0.5, Math.PI / 2);
    add(new THREE.ConeGeometry(0.85, 4.5, 12), body, 0, 0, -7.25, -Math.PI / 2);
    add(new THREE.ConeGeometry(0.3, 1.2, 8), accent, 0, 0, -9.6, -Math.PI / 2);
    const can = add(new THREE.SphereGeometry(0.75, 14, 10), glass, 0, 0.85, -3.3);
    can.scale.set(1, 0.8, 2.6);
    add(new THREE.BoxGeometry(1.3, 0.7, 7), body, 0, 0.75, 1.8);
    add(new THREE.BoxGeometry(0.9, 1.2, 4.2), body, 1.4, -0.25, -0.3);
    add(new THREE.BoxGeometry(0.9, 1.2, 4.2), body, -1.4, -0.25, -0.3);

    // 主翼
    const wR = add(flatGeo([[0.8, -2.5], [7.8, 2.8], [7.8, 4.0], [0.8, 4.2]], 0.22), body, 0, -0.15, 0);
    const wL = add(flatGeo([[-0.8, -2.5], [-0.8, 4.2], [-7.8, 4.0], [-7.8, 2.8]], 0.22), body, 0, -0.15, 0);
    wR.name = wL.name = 'wing';
    add(new THREE.BoxGeometry(0.25, 0.3, 1.6), accent, 7.8, -0.05, 3.3);
    add(new THREE.BoxGeometry(0.25, 0.3, 1.6), accent, -7.8, -0.05, 3.3);
    // 水平尾翼
    add(flatGeo([[0.9, 4.3], [4.2, 6.4], [4.2, 7.3], [0.9, 7.0]], 0.18), body, 0, -0.05, 0);
    add(flatGeo([[-0.9, 4.3], [-0.9, 7.0], [-4.2, 7.3], [-4.2, 6.4]], 0.18), body, 0, -0.05, 0);
    // 垂直尾翼（双発・外向き）
    const tailShape = [[0, 2.8], [3.4, 5.6], [3.4, 6.8], [0, 7.0]];
    add(flatGeo(tailShape, 0.18), accent, 1.0, 0.6, 0, 0, 0, Math.PI / 2 - 0.25);
    add(flatGeo(tailShape, 0.18), accent, -1.0, 0.6, 0, 0, 0, Math.PI / 2 + 0.25);

    // ノズル
    add(new THREE.CylinderGeometry(0.55, 0.65, 1.4, 12), dark, 0.62, 0, 6.6, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.55, 0.65, 1.4, 12), dark, -0.62, 0, 6.6, Math.PI / 2);

    // アフターバーナーの炎
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a22, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const coreMat = new THREE.MeshBasicMaterial({ color: 0xbfe2ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    const fGeo = new THREE.ConeGeometry(0.55, 6, 12, 1, true); fGeo.translate(0, 3, 0);
    const cGeo = new THREE.ConeGeometry(0.32, 3, 10, 1, true); cGeo.translate(0, 1.5, 0);
    for (const x of [0.62, -0.62]) {
      add(fGeo, flameMat, x, 0, 7.25, Math.PI / 2, 0, 0, 'flame');
      add(cGeo, coreMat, x, 0, 7.25, Math.PI / 2, 0, 0, 'core');
    }

    // 翼下ミサイル
    const mGeo = new THREE.CylinderGeometry(0.16, 0.16, 3, 8);
    for (const x of [3.0, -3.0, 5.0, -5.0]) add(mGeo, white, x, -0.5, 1.6, Math.PI / 2, 0, 0, 'msl');

    // 降着装置
    const gear = new THREE.Group(); gear.name = 'gear'; g.add(gear);
    const strut = new THREE.BoxGeometry(0.22, 1.3, 0.22);
    const wheel = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
    for (const [x, z] of [[0, -5], [1.7, 1.6], [-1.7, 1.6]]) {
      add(strut, dark, x, -0.95, z, 0, 0, 0, null, gear);
      add(wheel, dark, x, -1.48, z, 0, 0, Math.PI / 2, null, gear);
    }
    return g;
  }

  function buildJet(enemy) {
    const key = enemy ? 'e' : 'p';
    if (!jetCache[key]) jetCache[key] = makeJetTemplate(enemy);
    const g = jetCache[key].clone();
    const parts = { flames: [], cores: [], msl: [], gear: null };
    g.traverse(o => {
      if (o.name === 'flame') parts.flames.push(o);
      else if (o.name === 'core') parts.cores.push(o);
      else if (o.name === 'msl') parts.msl.push(o);
      else if (o.name === 'gear') parts.gear = o;
    });
    g.parts = parts;
    return g;
  }

  function deckTexture(enemy) {
    return canvasTex(256, 1152, (c, w, h) => {
      c.fillStyle = enemy ? '#3a3632' : '#3c4045';
      c.fillRect(0, 0, w, h);
      for (let i = 0; i < 5000; i++) {
        const v = Math.random() * 30 - 15;
        c.fillStyle = `rgba(${128 + v},${128 + v},${128 + v},0.08)`;
        c.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      const zy = z => (z + 167) / 334 * h; // 艦首(-Z)が上
      c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 3;
      c.setLineDash([26, 22]);
      c.beginPath(); c.moveTo(w / 2, zy(-160)); c.lineTo(w / 2, zy(166)); c.stroke();
      c.setLineDash([]);
      c.strokeRect(6, 6, w - 12, h - 12);
      // カタパルト
      c.fillStyle = '#6f6f68'; c.fillRect(w / 2 - 4, zy(-165), 8, zy(42) - zy(-165));
      c.fillStyle = '#e0b52c';
      c.fillRect(w / 2 - 14, zy(-165), 3, zy(42) - zy(-165));
      c.fillRect(w / 2 + 11, zy(-165), 3, zy(42) - zy(-165));
      // 着艦エリア
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 4;
      c.strokeRect(w / 2 - 50, zy(70), 100, zy(165) - zy(70));
      c.strokeStyle = '#cfcfcf'; c.lineWidth = 3;
      for (const z of [95, 112, 129, 146]) { c.beginPath(); c.moveTo(w / 2 - 60, zy(z)); c.lineTo(w / 2 + 60, zy(z)); c.stroke(); }
      // 艦番号
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.font = 'bold 90px sans-serif'; c.textAlign = 'center';
      c.save(); c.translate(w / 2, zy(-120)); c.rotate(Math.PI); c.fillText(enemy ? '08' : '73', 0, 30); c.restore();
      c.fillStyle = enemy ? '#b0231b' : '#e0b52c';
      c.fillRect(0, zy(-167), w, 6);
    });
  }

  function buildCarrier(enemy) {
    const g = new THREE.Group();
    const hullMat = std(enemy ? 0x4a4d50 : 0x6b737b);
    const redMat = std(enemy ? 0x5a1a14 : 0x5b2a24);
    const darkMat = std(0x2b2f33);
    const glass = std(0x0b1a2a, { metalness: 0.9, roughness: 0.1 });
    const hullPts = [[-19, 166], [19, 166], [23, 60], [22, -100], [12, -150], [0, -172], [-12, -150], [-22, -100], [-23, 60]];
    const hull = new THREE.Mesh(flatGeo(hullPts, 23), hullMat); hull.position.y = -4; g.add(hull);
    const lower = new THREE.Mesh(flatGeo(hullPts.map(p => [p[0] * 0.97, p[1] * 0.99]), 6), redMat); lower.position.y = -9; g.add(lower);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(74, 1.6, 334), darkMat); deck.position.set(0, 19.2, -0.5); g.add(deck);
    const top = new THREE.Mesh(new THREE.PlaneGeometry(74, 334), new THREE.MeshStandardMaterial({ map: deckTexture(enemy), roughness: 0.9, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -2 }));
    top.rotation.x = -Math.PI / 2; top.position.set(0, 20.02, -0.5); g.add(top);

    // 艦橋
    const isl = new THREE.Mesh(new THREE.BoxGeometry(11, 16, 34), hullMat); isl.position.set(31, 28, 25); g.add(isl);
    const br = new THREE.Mesh(new THREE.BoxGeometry(12, 5, 22), hullMat); br.position.set(31, 38.5, 20); g.add(br);
    const win = new THREE.Mesh(new THREE.BoxGeometry(12.3, 1.6, 22.3), glass); win.position.set(31, 38.8, 20); g.add(win);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1, 18, 8), darkMat); mast.position.set(31, 50, 22); g.add(mast);
    const radar = new THREE.Mesh(new THREE.BoxGeometry(9, 1.2, 1.4), darkMat); radar.position.set(31, 57, 22); g.add(radar);
    g.userData.radarIndex = g.children.indexOf(radar);

    const turrets = [];
    if (enemy) {
      const baseGeo = new THREE.CylinderGeometry(2.4, 2.8, 2.2, 10);
      const barGeo = new THREE.BoxGeometry(0.6, 0.6, 6); barGeo.translate(0, 0, -3);
      for (const [x, z] of [[-33, -125], [33, -125], [-33, 135], [33, 140], [-35, 10]]) {
        const t = new THREE.Group(); t.position.set(x, 21.1, z);
        t.add(new THREE.Mesh(baseGeo, darkMat));
        const b = new THREE.Mesh(barGeo, darkMat); b.position.y = 1; b.rotation.x = 0.5; t.add(b);
        g.add(t); turrets.push([x, 23, z]);
      }
    }
    g.userData.turrets = turrets;
    return g;
  }

  function buildWorld(scene) {
    const HORIZON = [0.74, 0.83, 0.92];
    const fog = new THREE.Fog(new THREE.Color().setRGB(HORIZON[0], HORIZON[1], HORIZON[2], THREE.SRGBColorSpace), 900, 17000);
    const sunDir = new THREE.Vector3(0.45, 0.55, -0.7).normalize();

    scene.add(new THREE.HemisphereLight(0xd6ebff, 0x2a4a66, 2.3));
    const sun = new THREE.DirectionalLight(0xfff1d8, 2.6);
    sun.position.copy(sunDir).multiplyScalar(1000);
    scene.add(sun);

    // 空（グラデーション＋太陽）
    const sky = new THREE.Mesh(new THREE.SphereGeometry(30000, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: {
        top: { value: new THREE.Vector3(0.16, 0.42, 0.82) },
        hor: { value: new THREE.Vector3(HORIZON[0], HORIZON[1], HORIZON[2]) },
        sunDir: { value: sunDir },
      },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); float h = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(hor, top, pow(h, 0.45));
          float s = max(dot(d, sunDir), 0.0);
          col += vec3(1.0, 0.92, 0.75) * (pow(s, 900.0) * 4.0 + pow(s, 14.0) * 0.35);
          gl_FragColor = vec4(col, 1.0); }`,
    }));
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    scene.add(sky);

    // 海
    const TILE = 160;
    const seaTex = canvasTex(512, 512, (c, w, h) => {
      c.fillStyle = '#21557d'; c.fillRect(0, 0, w, h);
      const blob = (x, y, rx, ry, col) => {
        for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
          c.fillStyle = col; c.beginPath(); c.ellipse(x + ox, y + oy, rx, ry, 0, 0, Math.PI * 2); c.fill();
        }
      };
      for (let i = 0; i < 900; i++) {
        const light = Math.random() < 0.5;
        blob(Math.random() * w, Math.random() * h, 6 + Math.random() * 40, 2 + Math.random() * 6,
          light ? `rgba(120,180,215,${0.05 + Math.random() * 0.08})` : `rgba(8,30,55,${0.06 + Math.random() * 0.1})`);
      }
      for (let i = 0; i < 260; i++) blob(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 0.8 + Math.random() * 1.2, 'rgba(235,245,255,0.35)');
    });
    seaTex.wrapS = seaTex.wrapT = THREE.RepeatWrapping;
    const SEA = 48000;
    seaTex.repeat.set(SEA / TILE, SEA / TILE);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(SEA, SEA), new THREE.MeshStandardMaterial({ map: seaTex, roughness: 0.5, metalness: 0.0 }));
    sea.rotation.x = -Math.PI / 2;
    scene.add(sea);

    // 雲
    const cloudTex = [];
    for (let k = 0; k < 4; k++) {
      cloudTex.push(canvasTex(256, 256, (c, w, h) => {
        for (let i = 0; i < 26; i++) {
          const x = w / 2 + (Math.random() - 0.5) * w * 0.55, y = h / 2 + (Math.random() - 0.5) * h * 0.3;
          const r = 30 + Math.random() * 60;
          const gr = c.createRadialGradient(x, y, 0, x, y, r);
          const sh = 235 + Math.random() * 20 | 0;
          gr.addColorStop(0, `rgba(${sh},${sh},${sh + 5 > 255 ? 255 : sh + 5},0.55)`);
          gr.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = gr; c.fillRect(0, 0, w, h);
        }
      }));
    }
    const clouds = [];
    const CB = 36000;
    for (let i = 0; i < 230; i++) {
      const m = new THREE.SpriteMaterial({ map: cloudTex[i % 4], transparent: true, depthWrite: false, opacity: 0.9 });
      const s = new THREE.Sprite(m);
      const sc = 350 + Math.random() * 1100;
      s.scale.set(sc * 1.6, sc * 0.8, 1);
      s.position.set((Math.random() - 0.5) * CB, 350 + Math.random() * 2600, (Math.random() - 0.5) * CB);
      scene.add(s); clouds.push(s);
    }

    function update(cam) {
      sky.position.copy(cam);
      sea.position.x = Math.round(cam.x / TILE) * TILE;
      sea.position.z = Math.round(cam.z / TILE) * TILE;
      const half = CB / 2;
      for (const c of clouds) {
        if (c.position.x - cam.x > half) c.position.x -= CB; else if (cam.x - c.position.x > half) c.position.x += CB;
        if (c.position.z - cam.z > half) c.position.z -= CB; else if (cam.z - c.position.z > half) c.position.z += CB;
      }
    }

    return { fog, update };
  }

  return { buildJet, buildCarrier, buildWorld };
})();
