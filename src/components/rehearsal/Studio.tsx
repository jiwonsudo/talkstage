'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { analyze, buildCalibration, classifyFrame, type Analysis, type Calibration } from '@/lib/coach/analysis';
import { AudioMeter, Transcriber } from '@/lib/coach/audio';
import { detect, drawOverlay, extractFeatures, loadVision, type VisionFrame, type VisionModels } from '@/lib/coach/vision';
import type { Setup } from '@/lib/coach/types';
import { outcomeLabel, purposeOf, type Draft } from '@/lib/rehearsal/draft';
import { CAT_LABEL, POSTURES, fmtTime, type CatId } from '@/lib/scenarios';

export type StudioResult = { result: Analysis; videoURL: string; durationSec: number; setup: Setup };
type Phase = 'idle' | 'calib' | 'rec' | 'analyzing';
type Chip = boolean | null;

const PREFS = 'ts-studio-prefs';
const pickMime = () => ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) ?? '';
const POSTURE_FIX: Record<string, string> = { slouch: '허리를 펴고 턱을 살짝 당겨 주세요', shoulderTilt: '어깨 높이를 맞춰 주세요', headTilt: '고개를 바로 세워 주세요', crossed: '팔짱을 풀고 손을 펴 주세요', offCenter: '화면 가운데로 돌아와 주세요' };

type Props = {
  draft: Draft;
  setup: Setup;
  /** 리포트의 '이 항목만 다시'에서 왔으면 바로 카운트다운을 시작해요. */
  autoStart: boolean;
  onFocusClear: () => void;
  onEdit: () => void;
  onDone: (r: StudioResult) => void;
};

/** 녹화 화면: 카메라·마이크를 켜고 3초 기준 측정 뒤 녹화, 실시간 알림을 띄우고 끝나면 분석해요. */
export function Studio({ draft, setup, autoStart, onFocusClear, onEdit, onDone }: Props) {
  const p = purposeOf(draft);
  const camRef = useRef<HTMLVideoElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);

  // 화면에 그리는 값
  const [camOn, setCamOn] = useState(false);
  const [noMedia] = useState(() => !navigator.mediaDevices?.getUserMedia);
  const [camErr, setCamErr] = useState(noMedia ? '이 브라우저에서는 카메라를 쓸 수 없어요. 최신 Chrome에서 열어 주세요.' : '');
  const [showCamBtn, setShowCamBtn] = useState(noMedia);
  const [model, setModel] = useState<'loading' | 'ok' | 'failed'>('loading');
  const [phase, setPhase] = useState<Phase>('idle');
  const [count, setCount] = useState(3);
  const [framing, setFraming] = useState<{ msg: string; ok: boolean } | null>(null);
  const [hud, setHud] = useState({ t: 0, rate: '–', tx: '', gaze: null as Chip, posture: null as Chip, pace: null as Chip });
  const [level, setLevel] = useState(0);
  const [cue, setCue] = useState<{ text: string; n: number } | null>(null);
  const [error, setError] = useState('');
  const [prefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PREFS) ?? '{}') as { stt?: unknown; cues?: unknown }; } catch { return {}; }
  });
  const [stt, setStt] = useState(typeof prefs.stt === 'boolean' ? prefs.stt : true);
  const [cues, setCues] = useState(typeof prefs.cues === 'boolean' ? prefs.cues : true);

  // 녹화 중에 바뀌는 값은 다시 그리지 않도록 ref 에 둬요.
  const r = useRef({
    stream: null as MediaStream | null, audio: null as AudioMeter | null, models: null as VisionModels | null,
    phase: 'idle' as Phase, lastDet: 0, frames: [] as VisionFrame[], calibFrames: [] as VisionFrame[], calib: null as Calibration | null,
    recStart: 0, recorder: null as MediaRecorder | null, chunks: [] as Blob[], mime: '', transcriber: null as Transcriber | null,
    cooldown: {} as Record<string, number>, quietSince: null as number | null, lastQuiet: 0, cueTimer: 0 as unknown as ReturnType<typeof setTimeout>,
    hudTimer: 0 as unknown as ReturnType<typeof setInterval>,
    gen: 0, // 화면이 바뀔 때마다 올라가요. 늦게 도착한 카메라 응답을 버리는 데 써요.
  });
  const setP = (ph: Phase) => { r.current.phase = ph; setPhase(ph); };

  useEffect(() => { try { localStorage.setItem(PREFS, JSON.stringify({ stt, cues })); } catch { /* 무시 */ } }, [stt, cues]);
  const cuesRef = useRef(cues);
  useEffect(() => { cuesRef.current = cues; }, [cues]);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    const gen = r.current.gen;
    const stale = () => r.current.gen !== gen;
    const slow = setTimeout(() => { if (!stale() && !r.current.stream) { setCamErr('권한 요청 창이 보이지 않으면 아래 버튼을 눌러 주세요.'); setShowCamBtn(true); } }, 4000);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false },
      });
    } catch (e) {
      clearTimeout(slow);
      if (stale()) return;
      const name = (e as DOMException).name;
      setCamErr(name === 'NotAllowedError' ? '카메라·마이크 권한이 거부됐어요. 주소창 왼쪽 아이콘에서 권한을 허용한 뒤 다시 눌러 주세요.' : `카메라를 켜지 못했어요 (${name}). 다른 앱이 카메라를 쓰고 있는지 확인하세요.`);
      setShowCamBtn(true);
      return;
    }
    clearTimeout(slow);
    // 기다리는 사이 화면을 떠났으면(또는 개발 모드의 첫 effect 가 정리됐으면) 카메라를 바로 꺼요.
    if (stale()) { stream.getTracks().forEach((t) => t.stop()); return; }
    r.current.stream?.getTracks().forEach((t) => t.stop());
    r.current.stream = stream;
    const cam = camRef.current!;
    cam.srcObject = stream;
    await cam.play().catch(() => {});
    r.current.audio?.close();
    r.current.audio = new AudioMeter(stream);
    await r.current.audio.resume();
    if (stale()) return;
    setCamOn(true); setShowCamBtn(false);
  }, []);

  // 카메라와 분석 모델을 켜고, 화면을 떠나면 모두 꺼요.
  useEffect(() => {
    const st = r.current;
    startCamera();
    let live = true;
    loadVision().then((m) => {
      if (!live) { m.pose.close(); m.face.close(); return; }
      st.models = m; setModel('ok');
    }).catch((e) => { console.error(e); if (live) setModel('failed'); });
    return () => {
      live = false;
      st.gen++;
      clearInterval(st.hudTimer); clearTimeout(st.cueTimer);
      if (st.recorder && st.recorder.state !== 'inactive') st.recorder.stop();
      st.transcriber?.stop();
      st.audio?.close(); st.audio = null;
      st.stream?.getTracks().forEach((t) => t.stop()); st.stream = null;
      st.models?.pose.close(); st.models?.face.close(); st.models = null;
    };
  }, [startCamera]);

  const showCue = useCallback((cat: CatId | 'time', text: string) => {
    const st = r.current;
    if (!cuesRef.current) return;
    if (setup.focus && cat !== setup.focus) return;
    const now = performance.now();
    if (now - (st.cooldown[cat] ?? 0) < 8000) return;
    st.cooldown[cat] = now;
    setCue((c) => ({ text, n: (c?.n ?? 0) + 1 }));
    clearTimeout(st.cueTimer);
    st.cueTimer = setTimeout(() => setCue(null), 3200);
  }, [setup.focus]);

  // 프레임 루프: 10fps 안팎으로 자세·얼굴을 찾고, 단계에 따라 기준 측정 / 녹화 / 구도 안내에 써요.
  useEffect(() => {
    let raf = 0;
    const css = getComputedStyle(document.documentElement);
    const colors = { line: css.getPropertyValue('--ov-line').trim(), joint: css.getPropertyValue('--ov-joint').trim(), face: css.getPropertyValue('--ov-face').trim() };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const st = r.current, cam = camRef.current, ov = ovRef.current;
      if (st.audio) setLevel(Math.max(0, Math.min(100, ((st.audio.level + 70) / 55) * 100)));
      if (!st.models || !cam?.videoWidth || !ov || st.phase === 'analyzing') return;
      const now = performance.now();
      if (now - st.lastDet < 95) return;
      st.lastDet = now;
      let res;
      try { res = detect(st.models, cam); } catch { return; }
      if (ov.width !== cam.videoWidth) { ov.width = cam.videoWidth; ov.height = cam.videoHeight; }
      drawOverlay(ov.getContext('2d')!, res, ov.width, ov.height, colors);
      const t = st.phase === 'rec' ? (now - st.recStart) / 1000 : 0;
      const f = extractFeatures(t, res.pose, res.face, cam.videoWidth / cam.videoHeight);
      if (st.phase === 'calib') st.calibFrames.push(f);
      else if (st.phase === 'rec') st.frames.push(f);
      else setFraming(framingOf(f, draft.posture));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draft.posture]);

  const updateHud = useCallback(() => {
    const st = r.current;
    const t = (performance.now() - st.recStart) / 1000;
    const tgt = setup.targetSec;
    if (t > tgt * 1.1 && t < tgt * 1.1 + 0.3) showCue('time', '목표 시간을 넘겼어요. 마무리해 주세요.');
    let gaze: Chip = null, posture: Chip = null, pace: Chip = null, rate = '–', tx = '';
    const recent = st.frames.filter((f) => f.t > t - 3);
    if (recent.length >= 10 && st.calib) {
      const cls = recent.map((f) => classifyFrame(f, st.calib!, draft.posture));
      const gz = cls.filter((c) => c.gaze != null);
      const gOn = gz.length ? gz.filter((c) => c.gaze).length / gz.length : null;
      gaze = gOn == null ? null : gOn >= 0.5;
      if (gOn != null && gOn < 0.2 && t > 4) showCue('gaze', cls.filter((c) => c.lookDown).length > gz.length / 2 ? '원고에서 눈을 들어 카메라를 봐 주세요' : '카메라 렌즈를 봐 주세요');
      const ps = cls.filter((c) => c.bad != null);
      const bad = ps.length ? ps.filter((c) => c.bad).length / ps.length : null;
      posture = bad == null ? null : bad < 0.5;
      if (bad != null && bad > 0.7 && t > 4) {
        const reasons: Record<string, number> = {};
        ps.forEach((c) => c.reasons.forEach((x) => { reasons[x] = (reasons[x] ?? 0) + 1; }));
        const top = Object.entries(reasons).sort((a, b) => b[1] - a[1])[0]?.[0];
        if (top && POSTURE_FIX[top]) showCue('posture', POSTURE_FIX[top]);
      }
    }
    if (st.transcriber) {
      const n = st.transcriber.liveSyllables(10);
      const rv = t > 8 ? Math.round(n * 6) : null;
      rate = rv ? String(rv) : '–';
      const [lo, hi] = p.targets.spm;
      pace = rv == null || n < 10 ? null : rv >= lo - 30 && rv <= hi + 30;
      if (rv && rv > hi + 45 && n > 20) showCue('pace', '조금만 천천히 말해 보세요');
      tx = `${st.transcriber.finals.at(-1)?.text ?? ''} ${st.transcriber.interim}`.trim().slice(-60);
    }
    if (st.audio && st.calib) {
      if (st.audio.level < st.calib.noiseDb + 10) st.quietSince ??= t; else st.quietSince = null;
      if (st.quietSince != null && t - st.quietSince > 0.4) st.lastQuiet = t;
      if (t - st.lastQuiet > 18) showCue('pause', '숨 한 번 쉬고 이어가세요');
    }
    setHud({ t, rate, tx, gaze, posture, pace });
  }, [draft.posture, p.targets.spm, setup.targetSec, showCue]);

  const startRecording = useCallback(() => {
    const st = r.current;
    if (!st.stream || !st.audio) return;
    st.frames = []; st.chunks = []; st.recStart = performance.now();
    st.audio.begin(st.recStart);
    st.cooldown = {}; st.quietSince = null; st.lastQuiet = 0;
    st.transcriber = null;
    if (stt) { const tr = new Transcriber('ko-KR'); if (tr.supported && tr.start(st.recStart)) st.transcriber = tr; }
    st.mime = pickMime();
    st.recorder = new MediaRecorder(st.stream, st.mime ? { mimeType: st.mime, videoBitsPerSecond: 2_500_000 } : undefined);
    st.recorder.ondataavailable = (e) => { if (e.data.size) st.chunks.push(e.data); };
    st.recorder.start(1000);
    setP('rec');
    setHud({ t: 0, rate: '–', tx: '', gaze: null, posture: null, pace: null });
    st.hudTimer = setInterval(updateHud, 250);
  }, [stt, updateHud]);

  const begin = useCallback(async () => {
    const st = r.current;
    if (!st.stream || !st.audio) return;
    setError('');
    await st.audio.resume();
    st.calibFrames = [];
    st.audio.begin(performance.now());
    setP('calib');
    for (let n = 3; n >= 1; n--) {
      setCount(n);
      await new Promise((res) => setTimeout(res, 1000));
      if (st.phase !== 'calib') return;
    }
    st.calib = buildCalibration(st.audio.end(), st.calibFrames);
    st.audio.pitchGate = st.calib.noiseDb + 8;
    startRecording();
  }, [startRecording]);

  const ready = camOn && model !== 'loading';
  const autoStarted = useRef(false);
  useEffect(() => { if (autoStart && ready && !autoStarted.current) { autoStarted.current = true; begin(); } }, [autoStart, ready, begin]);

  async function cancel() {
    const st = r.current;
    if (st.phase === 'calib') st.audio?.end();
    if (st.phase === 'rec') {
      clearInterval(st.hudTimer);
      st.recorder?.stop();
      st.audio?.end();
      await st.transcriber?.stop();
    }
    setP('idle');
  }

  async function stop() {
    const st = r.current;
    if (st.phase !== 'rec' || !st.recorder || !st.audio || !st.calib) return;
    clearInterval(st.hudTimer);
    const durationSec = (performance.now() - st.recStart) / 1000;
    setP('analyzing');
    const rec = st.recorder;
    const stopped = new Promise((res) => { rec.onstop = res; });
    rec.stop();
    const audioFrames = st.audio.end();
    const transcript = st.transcriber ? await st.transcriber.stop() : null;
    await stopped;
    const videoURL = URL.createObjectURL(new Blob(st.chunks, { type: st.mime || 'video/webm' }));
    try {
      const result = analyze({ audio: audioFrames, vision: st.frames, transcript, calib: st.calib, purpose: p, setup, durationSec });
      onDone({ result, videoURL, durationSec, setup });
    } catch (e) {
      console.error(e);
      URL.revokeObjectURL(videoURL);
      setP('idle');
      setError('분석 중 오류가 났어요. 다시 녹화해 주세요.');
    }
  }

  const rows: [string, string][] = [
    ['주제', setup.topic || '—'],
    ['핵심 메시지', setup.keyMessage ? `“${setup.keyMessage}”` : '—'],
    ['원하는 결과', setup.outcomeText || outcomeLabel(draft)],
    ['목표 시간', fmtTime(setup.targetSec)],
  ];
  const recording = phase === 'rec' || phase === 'calib';
  const chip = (g: Chip) => (g === true ? ' is-good' : g === false ? ' is-bad' : '');
  const fc = (c: CatId) => (setup.focus === c ? ' is-focus' : '');

  return (
    <section className="screen">
      <div className={`studio${recording ? ' is-rec' : ''}`}>
        <div className="stage-col">
          <div className="stage">
            <div className="stage-media">
              <video ref={camRef} playsInline muted />
              <canvas ref={ovRef} />
            </div>
            <div className="cam-empty" hidden={camOn}>
              <p>카메라와 마이크를 켜는 중이에요.</p>
              {showCamBtn && <button type="button" className="btn-fill" onClick={() => { setCamErr(''); startCamera(); }}>카메라와 마이크 켜기</button>}
              <p className="cam-err" role="alert">{camErr}</p>
            </div>
            {camOn && phase === 'idle' && framing && <div className={`framing ${framing.ok ? 'is-ok' : 'is-warn'}`}>{framing.msg}</div>}
            {phase === 'calib' && (
              <div className="countdown"><span>{count}</span><p>렌즈를 보고 바른 자세로 잠시 조용히 있어 주세요.<br />기준 자세와 주변 소음을 측정하고 있어요.</p></div>
            )}
            {phase === 'rec' && (
              <div className="hud">
                <div className="hud-top">
                  <span className="rec-pill"><i /><b>{fmtTime(hud.t)}</b></span>
                  <span className="hud-target">목표 <span>{fmtTime(setup.targetSec)}</span></span>
                </div>
                <div className="hud-prog"><i className={hud.t > setup.targetSec * 1.1 ? 'over' : ''} style={{ width: `${Math.min(100, (hud.t / setup.targetSec) * 100)}%` }} /></div>
                <div className="hud-chips">
                  <span className={`hc${chip(hud.gaze)}${fc('gaze')}`}><i />시선</span>
                  <span className={`hc${chip(hud.posture)}${fc('posture')}`}><i />자세</span>
                  <span className={`hc${chip(hud.pace)}${fc('pace')}`}>속도 <b>{hud.rate}</b></span>
                  <span className={`hc${fc('tone')}`}>음량 <span className="vol"><i style={{ width: `${level}%` }} /></span></span>
                </div>
                {cue && <div key={cue.n} className="cue pop">{cue.text}</div>}
                <div className="hud-transcript">{hud.tx}</div>
              </div>
            )}
            {phase === 'analyzing' && <div className="analyzing"><div className="spin" aria-hidden="true" /><p>녹화를 분석하고 하이라이트를 고르는 중…</p></div>}
          </div>
          <div className="stage-bar">
            <span><i className={`dot dot-${camOn ? 'ok' : 'idle'}`} />{camOn ? '카메라 켜짐' : '카메라 꺼짐'}</span>
            <span><i className={`dot dot-${model === 'ok' ? 'ok' : model === 'failed' ? 'bad' : 'idle'}`} />{model === 'ok' ? '분석 준비됨' : model === 'failed' ? '음성만 분석' : '분석 모델 준비 중'}</span>
            <span>마이크 <span className="meter"><i style={{ width: `${level}%` }} /></span></span>
          </div>
          {recording && (
            <div className="rec-actions">
              {phase === 'rec' && <button type="button" className="btn-stop" onClick={stop}><i aria-hidden="true" />종료하고 분석</button>}
              <button type="button" className="btn-plain" onClick={cancel}>취소</button>
            </div>
          )}
        </div>

        <aside className="ready">
          <h2 className="ready-h">{draft.customPurpose?.name || p.label} · {POSTURES[draft.posture].label}</h2>
          <ul className="group">{rows.map(([k, v]) => <li key={k} className="cell cell-kv"><span>{k}</span><b>{v}</b></li>)}</ul>
          <ul className="group">
            <li className="cell cell-switch"><label><span className="cell-t"><b>음성 받아쓰기</b><small>말 빠르기·군더더기 말·내용 구조 분석. 음성이 Google 서버로 전송돼요.</small></span><input type="checkbox" className="switch" checked={stt} onChange={(e) => setStt(e.target.checked)} /></label></li>
            <li className="cell cell-switch"><label><span className="cell-t"><b>실시간 코칭 알림</b><small>녹화 중 “조금 천천히” 같은 알림을 띄워요.</small></span><input type="checkbox" className="switch" checked={cues} onChange={(e) => setCues(e.target.checked)} /></label></li>
          </ul>
          <div className="tips">
            <p className="group-h">준비 팁</p>
            <ul className="tip-list"><li>{POSTURES[draft.posture].framing}</li>{p.tips.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
          {setup.focus && (
            <p className="focus-note">집중 항목 <b>{CAT_LABEL[setup.focus]}</b> · 실시간 알림은 이 항목에만 떠요. <button type="button" className="btn-link" onClick={onFocusClear}>해제</button></p>
          )}
          {error && <p className="focus-note" role="alert">{error}</p>}
          <div className="rec-wrap">
            <button type="button" className="btn-fill btn-rec" disabled={!ready || phase !== 'idle'} onClick={begin}><i aria-hidden="true" />녹화 시작</button>
            <p className="rec-label">{!camOn ? '카메라를 켜는 중' : model === 'loading' ? '분석 모델 불러오는 중' : '준비됐어요. 시작하면 3초 동안 기준 자세를 재요.'}</p>
          </div>
          <button type="button" className="btn-plain" onClick={onEdit}>설정 수정</button>
        </aside>
      </div>
    </section>
  );
}

function framingOf(f: VisionFrame, posture: Draft['posture']): { msg: string; ok: boolean } {
  const bad = (msg: string) => ({ msg, ok: false });
  if (posture === 'seated') {
    if (!f.pose) return bad('어깨가 보이도록 조금 뒤로 앉아 주세요.');
    if (!f.face) return bad('얼굴이 잘 보이도록 조명을 얼굴 앞쪽에 두세요.');
    if (f.swFrame < 0.2) return bad('카메라에 조금 더 가까이 앉아 주세요.');
    if (f.swFrame > 0.68) return bad('조금 뒤로 앉아 어깨가 다 보이게 해 주세요.');
    if (f.noseY > 0.55) return bad('카메라를 눈높이까지 올려 주세요.');
    if (f.noseX < 0.3 || f.noseX > 0.7) return bad('화면 가운데로 이동해 주세요.');
  } else {
    if (!f.pose) return bad('상체가 보이도록 카메라 앞에 서 주세요.');
    if (!f.fullBody) return bad('머리부터 발끝까지 보이도록 뒤로 물러나 주세요.');
    if (!f.face) return bad('얼굴이 잘 보이도록 조명을 앞쪽에 두세요.');
  }
  return { msg: '좋아요. 이 위치에서 시작하세요.', ok: true };
}
