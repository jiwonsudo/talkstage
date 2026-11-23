// 마이크 음량·음높이 측정과 브라우저 음성 인식(받아쓰기)

export function syllables(text) {
  const h = (text.match(/[가-힣]/g) || []).length;
  const lat = (text.match(/[A-Za-z]+/g) || []).length;
  const dig = (text.match(/[0-9]/g) || []).length;
  return h + lat * 2 + dig;
}

// 정규화 자기상관으로 기본 주파수 추정 (70–450Hz)
function detectPitch(buf, sr, pre) {
  const n = 1024;
  const minLag = Math.floor(sr / 450);
  const maxLag = Math.min(Math.floor(sr / 70), buf.length - n - 1);
  let m = 0;
  for (let i = 0; i < n + maxLag; i++) m += buf[i];
  m /= n + maxLag;
  pre[0] = 0;
  for (let i = 0; i < n + maxLag; i++) {
    const x = buf[i] - m;
    pre[i + 1] = pre[i] + x * x;
  }
  const e0 = pre[n];
  if (e0 < 1e-6) return 0;
  let bestR = 0;
  const rs = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let c = 0;
    for (let i = 0; i < n; i++) c += (buf[i] - m) * (buf[i + lag] - m);
    const e1 = pre[lag + n] - pre[lag];
    const r = c / Math.sqrt(e0 * e1 + 1e-12);
    rs[lag] = r;
    if (r > bestR) bestR = r;
  }
  if (bestR < 0.55) return 0;
  // 옥타브 오류를 줄이기 위해 최댓값의 90% 이상인 가장 짧은 지연의 봉우리를 선택
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (rs[lag] >= bestR * 0.9 && rs[lag] >= rs[lag - 1] && rs[lag] >= rs[lag + 1]) {
      const a = rs[lag - 1], b = rs[lag], c = rs[lag + 1];
      const den = a - 2 * b + c;
      const shift = den !== 0 ? (0.5 * (a - c)) / den : 0;
      return sr / (lag + shift);
    }
  }
  return 0;
}

export class AudioMeter {
  constructor(stream) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.src = this.ctx.createMediaStreamSource(stream);
    this.an = this.ctx.createAnalyser();
    this.an.fftSize = 2048;
    this.src.connect(this.an);
    this.buf = new Float32Array(this.an.fftSize);
    this.pre = new Float64Array(this.an.fftSize + 2);
    this.level = -90;
    this.frames = null;
    this.pitchGate = -50;
    this.timer = setInterval(() => this.tick(), 25);
  }
  resume() { return this.ctx.state === 'suspended' ? this.ctx.resume() : Promise.resolve(); }
  tick() {
    this.an.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(s / this.buf.length);
    const db = 20 * Math.log10(rms + 1e-9);
    this.level = db;
    if (this.frames) {
      const t = (performance.now() - this.t0) / 1000;
      const pitch = db > this.pitchGate ? detectPitch(this.buf, this.ctx.sampleRate, this.pre) : 0;
      this.frames.push({ t, db, pitch });
    }
  }
  begin(t0) { this.t0 = t0; this.frames = []; }
  end() { const f = this.frames || []; this.frames = null; return f; }
  close() { clearInterval(this.timer); try { this.ctx.close(); } catch {} }
}

// Chrome의 Web Speech API. 음성이 Google 서버로 전송되므로 사용자가 끌 수 있게 합니다.
export class Transcriber {
  constructor(lang = 'ko-KR') {
    this.SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.supported = !!this.SR;
    this.lang = lang;
    this.error = null;
    this.reset();
  }
  reset() {
    this.finals = [];
    this.events = [];
    this.interim = '';
    this.firstSeen = {};
    this.finalSyll = 0;
    this.lastTotal = 0;
  }
  now() { return (performance.now() - this.t0) / 1000; }
  start(t0) {
    if (!this.supported) return false;
    this.t0 = t0;
    this.reset();
    this.active = true;
    this.session = 0;
    this.spawn();
    return true;
  }
  spawn() {
    const r = new this.SR();
    const session = ++this.session;
    r.lang = this.lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const key = `${session}:${i}`;
        if (this.firstSeen[key] == null) this.firstSeen[key] = Math.max(0, this.now() - 0.7);
        if (res.isFinal) {
          const text = res[0].transcript.trim();
          if (text) {
            this.finals.push({ t0: this.firstSeen[key], t: Math.max(this.firstSeen[key] + 0.3, this.now() - 0.3), text });
            this.finalSyll += syllables(text);
          }
        } else {
          interim += res[0].transcript;
        }
      }
      this.interim = interim;
      const total = this.finalSyll + syllables(interim);
      if (total > this.lastTotal) {
        this.events.push({ t: this.now(), n: total - this.lastTotal });
        this.lastTotal = total;
      } else if (total < this.lastTotal - 8) {
        this.lastTotal = total;
      }
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        this.error = '음성 인식 권한이 없어 받아쓰기를 하지 못했어요.';
        this.active = false;
      } else if (e.error === 'network') {
        this.error = '네트워크 문제로 받아쓰기가 중간에 끊겼어요.';
      }
    };
    r.onend = () => {
      if (this.active) setTimeout(() => { if (this.active) { try { this.spawn(); } catch {} } }, 120);
      else if (this.onStopped) this.onStopped();
    };
    try { r.start(); } catch (e) { this.error = '받아쓰기를 시작하지 못했어요.'; }
    this.rec = r;
  }
  liveSyllables(sinceSec) {
    const now = this.now();
    let n = 0;
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].t < now - sinceSec) break;
      n += this.events[i].n;
    }
    return n;
  }
  stop() {
    return new Promise((resolve) => {
      if (!this.rec || !this.active) { this.active = false; resolve(this.result()); return; }
      this.active = false;
      const done = () => resolve(this.result());
      const timer = setTimeout(done, 1500);
      this.onStopped = () => { clearTimeout(timer); done(); };
      try { this.rec.stop(); } catch { clearTimeout(timer); done(); }
    });
  }
  result() {
    // 마지막 미확정 문장도 포함
    const finals = [...this.finals];
    if (this.interim.trim()) finals.push({ t0: Math.max(0, this.now() - 2), t: this.now(), text: this.interim.trim() });
    return { finals, events: this.events, error: this.error };
  }
}
