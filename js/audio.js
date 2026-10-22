// 効果音はすべて WebAudio で合成する（外部ファイル不要）
const Sfx = (() => {
  let ctx = null, master = null, noiseBuf = null;
  const eng = {};

  function noiseSource(loop) {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = !!loop;
    return s;
  }

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    comp.connect(ctx.destination);
    master = ctx.createGain(); master.gain.value = 0.75; master.connect(comp);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // エンジンの轟音
    const n = noiseSource(true);
    eng.lp = ctx.createBiquadFilter(); eng.lp.type = 'lowpass'; eng.lp.frequency.value = 300;
    eng.g = ctx.createGain(); eng.g.gain.value = 0;
    n.connect(eng.lp).connect(eng.g).connect(master); n.start();
    // タービンの唸り
    eng.osc = ctx.createOscillator(); eng.osc.type = 'sawtooth'; eng.osc.frequency.value = 110;
    const of = ctx.createBiquadFilter(); of.type = 'lowpass'; of.frequency.value = 700;
    eng.og = ctx.createGain(); eng.og.gain.value = 0;
    eng.osc.connect(of).connect(eng.og).connect(master); eng.osc.start();
    // 風切り音
    const w = noiseSource(true);
    eng.wf = ctx.createBiquadFilter(); eng.wf.type = 'bandpass'; eng.wf.frequency.value = 800; eng.wf.Q.value = 0.6;
    eng.wg = ctx.createGain(); eng.wg.gain.value = 0;
    w.connect(eng.wf).connect(eng.wg).connect(master); w.start();
  }

  function engine(on, thr, spd, ab) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const k = on ? 1 : 0;
    eng.g.gain.setTargetAtTime(k * (0.18 + thr * 0.25 + ab * 0.45), t, 0.08);
    eng.lp.frequency.setTargetAtTime(180 + thr * 400 + ab * 1100, t, 0.08);
    eng.osc.frequency.setTargetAtTime(80 + thr * 140 + ab * 70, t, 0.1);
    eng.og.gain.setTargetAtTime(k * (0.015 + thr * 0.03), t, 0.1);
    eng.wg.gain.setTargetAtTime(spd * 0.32, t, 0.1);
    eng.wf.frequency.setTargetAtTime(500 + spd * 2200, t, 0.1);
  }

  function burst(dur, freq, q, vol, type, delay) {
    const t = ctx.currentTime + (delay || 0);
    const s = noiseSource(false);
    const f = ctx.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    return f;
  }

  function tone(freq, dur, vol, type, endFreq, delay) {
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(); o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  return {
    init,
    engine,
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); },
    shot() { if (!ctx) return; burst(0.07, 1400, 0.7, 0.22); tone(140, 0.05, 0.12, 'square', 60); },
    boom(size, vol) {
      if (!ctx) return;
      vol = Math.min(1, vol === undefined ? 1 : vol);
      if (vol < 0.02) return;
      const dur = 0.8 + size * 0.5;
      const t = ctx.currentTime;
      const f = burst(dur, 900 + size * 200, 0.4, 0.9 * vol, 'lowpass');
      f.frequency.setValueAtTime(1600, t);
      f.frequency.exponentialRampToValueAtTime(60, t + dur);
      tone(70, dur * 0.8, 0.8 * vol, 'sine', 25);
      if (size > 2) burst(dur * 1.5, 200, 0.3, 0.6 * vol, 'lowpass', 0.08);
    },
    hit() { if (!ctx) return; tone(380, 0.08, 0.2, 'square', 120); burst(0.1, 3000, 1, 0.25); },
    beep(f, d, v) { if (!ctx) return; tone(f, d || 0.08, v || 0.12, 'square'); },
    missile() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const f = burst(1.4, 500, 0.8, 0.5, 'bandpass');
      f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2600, t + 1.2);
    },
    catapult() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const f = burst(2.6, 300, 0.5, 0.9, 'lowpass');
      f.frequency.setValueAtTime(200, t); f.frequency.exponentialRampToValueAtTime(4000, t + 1.6);
      tone(55, 0.6, 0.9, 'sine', 30);
    },
    spool() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const f = burst(1.3, 300, 1, 0.5, 'bandpass');
      f.frequency.setValueAtTime(150, t); f.frequency.exponentialRampToValueAtTime(1800, t + 1.2);
    },
    thud() { if (!ctx) return; tone(90, 0.4, 0.9, 'sine', 35); burst(0.3, 600, 0.6, 0.6, 'lowpass'); },
    sonic() { if (!ctx) return; tone(60, 0.5, 1, 'sine', 28); burst(0.5, 700, 0.4, 0.9, 'lowpass'); },
    get ready() { return !!ctx; },
  };
})();
