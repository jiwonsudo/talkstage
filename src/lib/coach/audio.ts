// 마이크 음량·음높이 측정과 브라우저 음성 인식(받아쓰기)

export type AudioFrame = { t: number; db: number; pitch: number };
export type FinalText = { t0: number; t: number; text: string };
export type SyllEvent = { t: number; n: number };
export type TranscriptResult = { finals: FinalText[]; events: SyllEvent[]; error: string | null };

// Web Speech API 는 아직 TS 기본 타입에 없어서 쓰는 만큼만 적어 둬요.
type SRResult = { isFinal: boolean; 0: { transcript: string } };
type SREvent = { resultIndex: number; results: ArrayLike<SRResult> };
type SpeechRec = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void;
};
type SpeechRecCtor = new () => SpeechRec;
type SpeechWindow = Window & { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor; webkitAudioContext?: typeof AudioContext };

export function syllables(text: string) {
  const h = (text.match(/[가-힣]/g) || []).length;
  const lat = (text.match(/[A-Za-z]+/g) || []).length;
  const dig = (text.match(/[0-9]/g) || []).length;
  return h + lat * 2 + dig;
}

// 정규화 자기상관으로 기본 주파수 추정 (70–450Hz). 창의 앞 절반(n)을 뒤로 밀어 가며 비교해요.
// AudioWorklet 안에서도 그대로 쓰려고 바깥 변수를 쓰지 않는 순수 함수로 둬요(toString 으로 옮겨 감).
function detectPitch(buf: Float32Array, sr: number, pre: Float64Array) {
  const n = buf.length >> 1;
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

/**
 * 오디오 스레드(AudioWorklet)에서 25ms 마다 음량·음높이를 재요. 메인 스레드는 MediaPipe 가 프레임마다 오래 붙잡아서
 * setInterval 로 AnalyserNode 를 들여다보면 구간이 빠지거나 몰려서, 같은 녹화도 억양·쉼 결과가 흔들렸어요.
 * 워클릿은 모든 샘플을 받아 오디오 시계로 시간을 찍으니 빠지는 구간이 없어요.
 * 창 2048 샘플·홉 25ms 는 예전 값 그대로(기준값을 맞춰 둔 값), 음높이는 48kHz 면 절반으로 줄여 계산량을 1/4 로.
 */
const HOP_SEC = 0.025;
const WORKLET_SRC = () => `
const DP = ${detectPitch.toString()};
class TalkstageMeter extends AudioWorkletProcessor {
  constructor() {
    super();
    this.N = 2048; this.ring = new Float32Array(this.N); this.lin = new Float32Array(this.N);
    this.w = 0; this.filled = 0; this.since = 0; this.hop = Math.max(1, Math.round(sampleRate * ${HOP_SEC}));
    this.dec = sampleRate >= 32000 ? 2 : 1; this.dbuf = new Float32Array(this.N / this.dec); this.pre = new Float64Array(this.N / this.dec + 2);
    this.gate = -50; this.out = [];
    this.port.onmessage = (e) => { if (typeof e.data.gate === 'number') this.gate = e.data.gate; };
  }
  frame(t) {
    const N = this.N; let s = 0;
    for (let k = 0; k < N; k++) { const v = this.ring[(this.w + k) % N]; this.lin[k] = v; s += v * v; }
    const db = 20 * Math.log10(Math.sqrt(s / N) + 1e-9);
    let pitch = 0;
    if (db > this.gate) {
      const d = this.dec, m = N / d;
      for (let k = 0; k < m; k++) { let a = 0; for (let j = 0; j < d; j++) a += this.lin[k * d + j]; this.dbuf[k] = a / d; }
      pitch = DP(this.dbuf, sampleRate / d, this.pre);
    }
    this.out.push(t, db, pitch);
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        this.ring[this.w] = ch[i]; this.w = (this.w + 1) % this.N;
        if (this.filled < this.N) this.filled++;
        if (++this.since >= this.hop) { this.since = 0; if (this.filled >= this.N) this.frame(currentTime + (i + 1) / sampleRate); }
      }
      if (this.out.length >= 6) { this.port.postMessage(this.out); this.out = []; }
    }
    return true;
  }
}
registerProcessor('talkstage-meter', TalkstageMeter);
`;

export class AudioMeter {
  ctx: AudioContext;
  src: AudioNode;
  level = -90;
  frames: AudioFrame[] | null = null;
  t0 = 0;
  /** 오디오 시계(초) 와 performance.now() 기준 t0 사이의 차이 */
  audioT0 = 0;
  /** 워클릿을 못 쓰는 브라우저용 예전 방식 */
  an: AnalyserNode | null = null;
  buf: Float32Array<ArrayBuffer> | null = null;
  pre: Float64Array | null = null;
  timer: ReturnType<typeof setInterval> | null = null;
  node: AudioWorkletNode | null = null;
  sink: GainNode | null = null;
  ready: Promise<void>;
  private gate = -50;
  /** 마이크(MediaStream) 또는 영상 파일(video 요소). 영상 파일은 소리를 스피커로도 내보내요(한 요소에 한 번만 이을 수 있어요). */
  constructor(input: MediaStream | HTMLMediaElement) {
    const Ctx = window.AudioContext || (window as SpeechWindow).webkitAudioContext!;
    this.ctx = new Ctx();
    if (input instanceof HTMLMediaElement) {
      this.src = this.ctx.createMediaElementSource(input);
      this.src.connect(this.ctx.destination);
    } else this.src = this.ctx.createMediaStreamSource(input);
    this.ready = this.setupWorklet().catch(() => this.setupFallback());
  }
  get pitchGate() { return this.gate; }
  set pitchGate(v: number) { this.gate = v; this.node?.port.postMessage({ gate: v }); }

  private async setupWorklet() {
    if (!this.ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') throw new Error('no worklet');
    const url = URL.createObjectURL(new Blob([WORKLET_SRC()], { type: 'text/javascript' }));
    try { await this.ctx.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }
    const node = new AudioWorkletNode(this.ctx, 'talkstage-meter', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: 'explicit' });
    node.port.postMessage({ gate: this.gate });
    node.port.onmessage = (e: MessageEvent<number[]>) => {
      const d = e.data;
      for (let i = 0; i < d.length; i += 3) {
        this.level = d[i + 1];
        if (this.frames) {
          const t = d[i] - this.audioT0;
          if (t >= 0) this.frames.push({ t, db: d[i + 1], pitch: d[i + 2] });
        }
      }
    };
    // 소리는 내지 않지만 그래프가 계속 돌도록 무음으로 출력에 이어 둬요
    const sink = this.ctx.createGain(); sink.gain.value = 0;
    this.src.connect(node); node.connect(sink); sink.connect(this.ctx.destination);
    this.node = node; this.sink = sink;
  }
  private setupFallback() {
    this.an = this.ctx.createAnalyser();
    this.an.fftSize = 2048;
    this.src.connect(this.an);
    this.buf = new Float32Array(this.an.fftSize);
    this.pre = new Float64Array(this.an.fftSize + 2);
    this.timer = setInterval(() => this.tick(), HOP_SEC * 1000);
  }
  async resume() {
    await this.ready;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }
  tick() {
    if (!this.an || !this.buf || !this.pre) return;
    this.an.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    const db = 20 * Math.log10(Math.sqrt(s / this.buf.length) + 1e-9);
    this.level = db;
    if (this.frames) {
      const t = (performance.now() - this.t0) / 1000;
      const pitch = db > this.gate ? detectPitch(this.buf, this.ctx.sampleRate, this.pre) : 0;
      this.frames.push({ t, db, pitch });
    }
  }
  /** t0 = performance.now() 기준 시작 시각. 오디오 시계를 같은 기준으로 맞춰요. */
  begin(t0: number) {
    this.t0 = t0;
    const ts = this.ctx.getOutputTimestamp?.();
    this.audioT0 = ts && ts.contextTime != null && ts.performanceTime
      ? ts.contextTime - (ts.performanceTime - t0) / 1000
      : this.ctx.currentTime - (performance.now() - t0) / 1000;
    this.frames = [];
  }
  end() { const f = this.frames || []; this.frames = null; return f; }
  close() {
    if (this.timer) clearInterval(this.timer);
    try { this.node?.disconnect(); this.sink?.disconnect(); this.src.disconnect(); } catch {}
    try { this.ctx.close(); } catch {}
  }
}

// Chrome의 Web Speech API. 음성이 Google 서버로 전송되므로 사용자가 끌 수 있게 합니다.
export class Transcriber {
  SR: SpeechRecCtor | undefined;
  supported: boolean;
  lang: string;
  error: string | null = null;
  finals: FinalText[] = [];
  events: SyllEvent[] = [];
  interim = '';
  firstSeen: Record<string, number> = {};
  finalSyll = 0;
  lastTotal = 0;
  t0 = 0;
  active = false;
  session = 0;
  rec: SpeechRec | null = null;
  onStopped: (() => void) | null = null;
  constructor(lang = 'ko-KR') {
    const w = window as SpeechWindow;
    this.SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    this.supported = !!this.SR;
    this.lang = lang;
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
  start(t0: number) {
    if (!this.supported) return false;
    this.t0 = t0;
    this.reset();
    this.active = true;
    this.session = 0;
    this.spawn();
    return true;
  }
  spawn() {
    const r = new this.SR!();
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
    try { r.start(); } catch { this.error = '받아쓰기를 시작하지 못했어요.'; }
    this.rec = r;
  }
  liveSyllables(sinceSec: number) {
    const now = this.now();
    let n = 0;
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].t < now - sinceSec) break;
      n += this.events[i].n;
    }
    return n;
  }
  stop() {
    return new Promise<TranscriptResult>((resolve) => {
      if (!this.rec || !this.active) { this.active = false; resolve(this.result()); return; }
      this.active = false;
      const done = () => resolve(this.result());
      const timer = setTimeout(done, 1500);
      this.onStopped = () => { clearTimeout(timer); done(); };
      try { this.rec.stop(); } catch { clearTimeout(timer); done(); }
    });
  }
  result(): TranscriptResult {
    // 마지막 미확정 문장도 포함
    const finals = [...this.finals];
    if (this.interim.trim()) finals.push({ t0: Math.max(0, this.now() - 2), t: this.now(), text: this.interim.trim() });
    return { finals, events: this.events, error: this.error };
  }
}
