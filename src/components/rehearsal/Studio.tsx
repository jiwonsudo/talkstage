'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MIN_REHEARSAL_SEC, analyze, buildCalibration, classifyFrame, type Analysis, type Calibration } from '@/lib/coach/analysis';
import { AudioMeter, Transcriber, framesFromRecording, isIOS } from '@/lib/coach/audio';
import { detect, drawOverlay, extractFeatures, loadVision, type VisionFrame, type VisionModels, pickPerson, resetPerson, type VisionResult } from '@/lib/coach/vision';
import type { RecordMode, Setup } from '@/lib/coach/types';
import { pickAudioMime, pickMime } from '@/lib/coach/media';
import { outcomeLabel, purposeOf, type Draft } from '@/lib/rehearsal/draft';
import { aidOf, audienceOf, isShowing } from '@/lib/delivery';
import { showPose } from '@/lib/coach/showing';
import { CAT_LABEL, POSTURES, fmtTime, type CatId } from '@/lib/scenarios';
import { SegPill } from '@/components/ui/SegPill';

export type StudioResult = { result: Analysis; videoURL: string; durationSec: number; setup: Setup };
type Phase = 'idle' | 'calib' | 'rec' | 'interrupted' | 'analyzing';
/** 녹화를 멈춘 뒤 분석에 넘길 재료 */
type Captured = { audio: ReturnType<AudioMeter['end']>; transcript: Promise<Awaited<ReturnType<Transcriber['stop']>> | null>; stopped: Promise<unknown>; durationSec: number };
/** 이보다 짧게 녹화하다 끊기면 '여기까지 분석'을 권하지 않아요(분석 최소 길이와 같게) */
const MIN_PARTIAL_SEC = MIN_REHEARSAL_SEC;
/** 폰(터치 화면)은 녹화 파일을 가볍게: 10분 기준 약 75MB(데스크톱 2.5Mbps 면 약 190MB). 분석은 카메라 화면으로 해서 점수와 무관해요. */
const videoBitrate = () => (matchMedia('(pointer: coarse)').matches ? 1_000_000 : 2_500_000);
type Chip = boolean | null;
/** 무엇을 분석하나: 카메라로 녹화 · 올린 영상 파일 */
type Source = 'camera' | 'file';
/** 영상 파일은 처음 이만큼을 기준 자세·주변 소음으로 써요(녹화의 3초 카운트다운과 같은 역할) */
const FILE_CALIB_SEC = 3;
type AudioFrames = ReturnType<AudioMeter['end']>;
const fileCalib = (audio: AudioFrames, frames: VisionFrame[]) =>
  buildCalibration(audio.filter((f) => f.t < FILE_CALIB_SEC), frames.filter((f) => f.t < FILE_CALIB_SEC));

const PREFS = 'ts-studio-prefs';
const POSTURE_FIX: Record<string, string> = { slouch: '허리를 펴고 턱을 살짝 당겨 주세요', shoulderTilt: '어깨 높이를 맞춰 주세요', headTilt: '고개를 바로 세워 주세요', crossed: '팔짱을 풀고 손을 펴 주세요', offCenter: '화면 가운데로 돌아와 주세요' };

type Props = {
  draft: Draft;
  setup: Setup;
  /** 리포트의 '이 항목만 다시'에서 왔으면 바로 카운트다운을 시작해요. */
  autoStart: boolean;
  onFocusClear: () => void;
  onEdit: () => void;
  onDone: (r: StudioResult) => void;
  /** 카메라 없이 음성만 ↔ 영상+음성 전환(녹화 화면을 새로 열어요) */
  onMode: (m: RecordMode) => void;
};

/**
 * 녹화 화면: 카메라·마이크를 켜고 3초 기준 측정 뒤 녹화, 실시간 알림을 띄우고 끝나면 분석해요.
 * 음성만(setup.mode = 'voice')이면 마이크만 켜고, 카메라 화면 대신 목소리 크기를 보여 줘요(시선·자세·제스처 분석 없음).
 */
// 음성만 녹음에서는 카메라·시선·몸짓 팁을 빼요(분석하지 않으니까요).
const VISUAL_TIP = /카메라|렌즈|시선|눈을|눈은|바라|손|제스처|자세|몸|가리키|들어 보이|화면/;

export function Studio({ draft, setup, autoStart, onFocusClear, onEdit, onDone, onMode }: Props) {
  const p = purposeOf(draft);
  const voice = setup.mode === 'voice';
  const aid = aidOf(draft.purposeId, setup.aid);
  const audience = audienceOf(aid, draft.posture); // 청중이 여럿이면 옆 사람을 보는 것도 시선 OK
  const camRef = useRef<HTMLVideoElement>(null);
  const ovRef = useRef<HTMLCanvasElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const lastResRef = useRef<VisionResult | null>(null);
  // 다른 사람도 찍혔는지(그러면 "본인을 눌러 주세요" 안내), 방금 눌러서 고른 결과
  const [crowd, setCrowd] = useState(false);
  const crowdRef = useRef(false);
  const [picked, setPicked] = useState<{ ok: boolean; n: number } | null>(null);

  // 화면에 그리는 값
  const [camOn, setCamOn] = useState(false);
  const [noMedia] = useState(() => !navigator.mediaDevices?.getUserMedia);
  const [camErr, setCamErr] = useState(noMedia ? `이 브라우저에서는 ${voice ? '마이크' : '카메라'}를 쓸 수 없어요. 최신 Chrome에서 열어 주세요.` : '');
  const [showCamBtn, setShowCamBtn] = useState(noMedia);
  const [model, setModel] = useState<'loading' | 'ok' | 'failed'>(voice ? 'ok' : 'loading'); // 음성만은 영상 모델이 필요 없어요
  const [phase, setPhase] = useState<Phase>('idle');
  const [count, setCount] = useState(3);
  const [framing, setFraming] = useState<{ msg: string; ok: boolean } | null>(null);
  const [hud, setHud] = useState({ t: 0, rate: '–', tx: '', gaze: null as Chip, posture: null as Chip, pace: null as Chip });
  const [level, setLevel] = useState(0);
  const [cue, setCue] = useState<{ text: string; n: number } | null>(null);
  const [error, setError] = useState('');
  const [cutSec, setCutSec] = useState(0); // 끊긴 녹화 길이(초)
  const [prefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(PREFS) ?? '{}') as { stt?: unknown; cues?: unknown }; } catch { return {}; }
  });
  // 폰은 앞(셀카)·뒤 카메라를 바꿀 수 있어요. 녹화 전(idle)에만 바꿔요(녹화 중에 바꾸면 녹화 파일이 끊겨서).
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const facingRef = useRef<'user' | 'environment'>('user');
  const [canFlip, setCanFlip] = useState(false);
  const [stt, setStt] = useState(typeof prefs.stt === 'boolean' ? prefs.stt : true);
  const [cues, setCues] = useState(typeof prefs.cues === 'boolean' ? prefs.cues : true);
  // 아이폰 사파리는 받아쓰기(음성 인식)가 마이크를 가져가 녹화·음량 측정 소리가 끊겨요. 그래서 꺼 두고 말 빠르기는 소리로 재요.
  const [ios] = useState(isIOS);
  const sttOn = stt && !ios;
  // 카메라 대신 영상 파일을 올려 분석할 수도 있어요(영상+음성일 때만). 파일 video 는 고를 때마다 새로 만들어요(소리를 한 번만 이을 수 있어서).
  const [source, setSource] = useState<Source>('camera');
  const srcRef = useRef<Source>('camera');
  const fileVidRef = useRef<HTMLVideoElement>(null);
  const [file, setFile] = useState<{ url: string; name: string; key: number } | null>(null);
  const fileUrlRef = useRef<string | null>(null);
  const handedRef = useRef<string | null>(null); // 리포트로 넘긴 파일 주소(그건 지우지 않아요)
  const [fileOk, setFileOk] = useState(false);
  const [fileErr, setFileErr] = useState('');
  const [fileDrag, setFileDrag] = useState(false);
  const isFile = !voice && source === 'file';
  /** 지금 분석하는 영상(카메라 또는 파일) */
  const vid = () => (srcRef.current === 'file' ? fileVidRef.current : camRef.current);

  // 녹화 중에 바뀌는 값은 다시 그리지 않도록 ref 에 둬요.
  const r = useRef({
    stream: null as MediaStream | null, audio: null as AudioMeter | null, models: null as VisionModels | null,
    phase: 'idle' as Phase, lastDet: 0, frames: [] as VisionFrame[], calibFrames: [] as VisionFrame[], calib: null as Calibration | null,
    recStart: 0, recorder: null as MediaRecorder | null, chunks: [] as Blob[], mime: '', transcriber: null as Transcriber | null,
    cooldown: {} as Record<string, number>, quietSince: null as number | null, lastQuiet: 0, cueTimer: 0 as unknown as ReturnType<typeof setTimeout>,
    hudTimer: 0 as unknown as ReturnType<typeof setInterval>,
    captured: null as Captured | null, // 다른 앱으로 나가서 끊긴 녹화
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
      const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: false };
      stream = await navigator.mediaDevices.getUserMedia(voice ? { audio } : {
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: { ideal: facingRef.current } },
        audio,
      });
    } catch (e) {
      clearTimeout(slow);
      if (stale()) return;
      const name = (e as DOMException).name;
      setCamErr(voice
        ? (name === 'NotAllowedError' ? '마이크 권한이 거부됐어요. 주소창 왼쪽 아이콘에서 마이크를 허용한 뒤 다시 눌러 주세요.' : `마이크를 켜지 못했어요 (${name}). 다른 앱이 마이크를 쓰고 있는지 확인하세요.`)
        : name === 'NotAllowedError' ? '카메라·마이크 권한이 거부됐어요. 주소창 왼쪽 아이콘에서 권한을 허용한 뒤 다시 눌러 주세요.' : `카메라를 켜지 못했어요 (${name}). 다른 앱이 카메라를 쓰고 있는지 확인하세요.`);
      setShowCamBtn(true);
      return;
    }
    clearTimeout(slow);
    // 기다리는 사이 화면을 떠났으면(또는 개발 모드의 첫 effect 가 정리됐으면) 카메라를 바로 꺼요.
    if (stale()) { stream.getTracks().forEach((t) => t.stop()); return; }
    r.current.stream?.getTracks().forEach((t) => t.stop());
    r.current.stream = stream;
    if (!voice) {
      const cam = camRef.current!;
      cam.srcObject = stream;
      await cam.play().catch(() => {});
    }
    r.current.audio?.close();
    r.current.audio = new AudioMeter(stream);
    await r.current.audio.resume();
    if (stale()) return;
    setCamOn(true); setShowCamBtn(false);
    if (voice) return;
    resetPerson(); // 카메라가 바뀌면 발표자 위치도 새로 찾아요
    // 카메라가 둘 이상이면 전환 버튼을 보여 줘요(권한을 받은 뒤라야 목록이 다 나와요)
    navigator.mediaDevices.enumerateDevices?.().then((ds) => { if (!stale()) setCanFlip(ds.filter((d) => d.kind === 'videoinput').length > 1); }).catch(() => {});
  }, [voice]);

  /** 앞·뒤 카메라 전환. iOS 는 카메라를 하나만 열 수 있어서 지금 카메라를 먼저 꺼요. */
  const flip = useCallback(() => {
    const st = r.current;
    if (st.phase !== 'idle') return;
    const next = facingRef.current === 'user' ? 'environment' : 'user';
    facingRef.current = next; setFacing(next);
    st.stream?.getTracks().forEach((t) => t.stop()); st.stream = null;
    setCamOn(false);
    startCamera();
  }, [startCamera]);

  /** 카메라 ↔ 영상 파일. 녹화 전(idle)에만 바꿔요. 파일로 가면 카메라·마이크를 꺼요. */
  const switchSource = (next: Source) => {
    const st = r.current;
    if (st.phase !== 'idle' || srcRef.current === next) return;
    srcRef.current = next; setSource(next);
    setError(''); setFraming(null); setCrowd(false); crowdRef.current = false;
    lastResRef.current = null; resetPerson();
    const ov = ovRef.current; ov?.getContext('2d')?.clearRect(0, 0, ov.width, ov.height);
    st.audio?.close(); st.audio = null;
    if (next === 'file') {
      st.gen++; // 켜지는 중인 카메라 응답은 버려요
      st.stream?.getTracks().forEach((t) => t.stop()); st.stream = null;
      setCamOn(false); setShowCamBtn(false); setCamErr('');
      // 전에 고른 파일이 있으면 video 를 새로 만들어요(앞 video 의 소리 연결은 닫혀서 다시 못 써요)
      setFileOk(false); setFile((f) => (f ? { ...f, key: f.key + 1 } : f));
    } else {
      fileVidRef.current?.pause();
      startCamera();
    }
  };

  /** 영상 파일 고르기(버튼·끌어다 놓기) */
  const pickFile = (f: File | undefined) => {
    if (!f || r.current.phase !== 'idle') return;
    if (!f.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm)$/i.test(f.name)) { setFileErr('영상 파일(mp4 · mov · webm)을 골라 주세요.'); return; }
    const old = fileUrlRef.current;
    if (old && old !== handedRef.current) URL.revokeObjectURL(old);
    r.current.audio?.close(); r.current.audio = null;
    const url = URL.createObjectURL(f);
    fileUrlRef.current = url;
    setFileOk(false); setFileErr(''); setError('');
    lastResRef.current = null; resetPerson();
    setFile((o) => ({ url, name: f.name, key: (o?.key ?? 0) + 1 }));
  };
  const onFileMeta = (v: HTMLVideoElement) => {
    if (!Number.isFinite(v.duration)) return; // 길이를 모르는 webm 도 있어요(재생하면서 재요)
    if (v.duration < MIN_REHEARSAL_SEC) setFileErr(`영상이 ${Math.round(v.duration)}초예요. ${MIN_REHEARSAL_SEC}초 이상인 영상만 분석할 수 있어요.`);
  };
  // 화면을 떠날 때 리포트로 넘기지 않은 파일 주소는 지워요
  useEffect(() => () => { const u = fileUrlRef.current; if (u && u !== handedRef.current) URL.revokeObjectURL(u); }, []);

  // 카메라와 분석 모델을 켜고, 화면을 떠나면 모두 꺼요.
  useEffect(() => {
    const st = r.current;
    startCamera();
    let live = true;
    if (!voice) loadVision().then((m) => {
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
  }, [startCamera, voice]);

  // 영상·인식 선 상자를 실제 영상 비율로 잡아요. 폰(760px 이하)은 그 상자를 무대를 덮을 만큼 키워 가운데 둬요(cover).
  // CSS 컨테이너 단위만으로 계산하면 iOS 뒤 카메라에서 상자 비율이 어긋나 영상이 옆으로 늘어나 보였어서, 크기를 직접 재서 px 로 넣어요.
  // 카메라를 바꾸거나 폰을 돌리면 영상 크기가 바뀌는데 iOS 는 resize 이벤트를 빼먹기도 해서 0.5초마다도 확인해요.
  useEffect(() => {
    const m = mediaRef.current!, stage = m.parentElement!;
    const mq = matchMedia('(max-width: 760px)');
    let last = '';
    const fit = () => {
      const v = vid();
      if (!v?.videoWidth || !v.videoHeight) return;
      const va = v.videoWidth / v.videoHeight, W = stage.clientWidth, H = stage.clientHeight;
      const maxH = Math.round(innerHeight * 0.74);
      const key = `${va}|${W}|${H}|${maxH}|${mq.matches}`;
      if (key === last) return;
      last = key;
      m.style.setProperty('--va', String(va));
      if (!W) return;
      if (!mq.matches) {
        // 데스크톱: 무대 폭에 맞추되 화면 높이의 74%를 넘지 않게(세로 영상도 인식 선이 영상과 같은 상자에 그려지게)
        const w = Math.min(W, maxH * va);
        m.style.width = `${Math.floor(w)}px`; m.style.height = `${Math.floor(w / va)}px`;
        return;
      }
      if (!H) return;
      const [w, h] = W / H > va ? [W, W / va] : [H * va, H];
      m.style.width = `${Math.ceil(w)}px`; m.style.height = `${Math.ceil(h)}px`;
    };
    const els = [camRef.current, fileVidRef.current].filter((x): x is HTMLVideoElement => !!x);
    els.forEach((v) => { v.addEventListener('loadedmetadata', fit); v.addEventListener('resize', fit); v.addEventListener('playing', fit); });
    const ro = new ResizeObserver(fit); ro.observe(stage);
    mq.addEventListener('change', fit); addEventListener('resize', fit);
    const iv = setInterval(fit, 500);
    fit();
    return () => {
      els.forEach((v) => { v.removeEventListener('loadedmetadata', fit); v.removeEventListener('resize', fit); v.removeEventListener('playing', fit); });
      ro.disconnect(); mq.removeEventListener('change', fit); removeEventListener('resize', fit); clearInterval(iv);
    };
  }, [source, file?.key]);

  const showCue = useCallback((cat: CatId | 'time', text: string) => {
    const st = r.current;
    if (!cuesRef.current || srcRef.current === 'file') return; // 영상 파일은 이미 찍은 거라 알림을 띄우지 않아요
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
      const st = r.current, cam = vid(), ov = ovRef.current;
      const fromFile = srcRef.current === 'file';
      if (st.audio) setLevel(Math.max(0, Math.min(100, ((st.audio.level + 70) / 55) * 100)));
      // 영상 파일: 처음 3초가 지나면 그 3초로 기준을 잡아요(실시간 표시용, 분석할 땐 다시 계산)
      if (fromFile && st.phase === 'rec' && !st.calib && cam && cam.currentTime >= FILE_CALIB_SEC && st.audio?.frames) {
        st.calib = fileCalib(st.audio.frames, st.frames);
        st.audio.pitchGate = st.calib.noiseDb + 8;
      }
      if (!st.models || !cam?.videoWidth || !ov || st.phase === 'analyzing') return;
      const now = performance.now();
      if (now - st.lastDet < 95) return;
      st.lastDet = now;
      let res;
      try { res = detect(st.models, cam); } catch { return; }
      lastResRef.current = res;
      const many = res.others.length > 0;
      if (many !== crowdRef.current) { crowdRef.current = many; setCrowd(many); }
      // 카메라를 바꾸면 폭은 같고 높이만 다를 수 있어서 둘 다 봐요(높이가 남으면 인식 선이 영상과 어긋남)
      if (ov.width !== cam.videoWidth || ov.height !== cam.videoHeight) { ov.width = cam.videoWidth; ov.height = cam.videoHeight; }
      drawOverlay(ov.getContext('2d')!, res, ov.width, ov.height, colors);
      const t = st.phase !== 'rec' ? 0 : fromFile ? cam.currentTime : (now - st.recStart) / 1000;
      const f = extractFeatures(t, res.pose, res.face, cam.videoWidth / cam.videoHeight);
      if (st.phase === 'calib') st.calibFrames.push(f);
      else if (st.phase === 'rec') st.frames.push(f);
      else if (!fromFile) setFraming(framingOf(f, draft.posture));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draft.posture]);

  const updateHud = useCallback(() => {
    const st = r.current;
    const t = srcRef.current === 'file' ? (fileVidRef.current?.currentTime ?? 0) : (performance.now() - st.recStart) / 1000;
    const tgt = setup.targetSec;
    if (t > tgt * 1.1 && t < tgt * 1.1 + 0.3) showCue('time', '목표 시간을 넘겼어요. 마무리해 주세요.');
    let gaze: Chip = null, posture: Chip = null, pace: Chip = null, rate = '–', tx = '';
    const recent = st.frames.filter((f) => f.t > t - 3);
    if (recent.length >= 10 && st.calib) {
      const cls = recent.map((f) => classifyFrame(f, st.calib!, draft.posture, audience));
      const gz = cls.filter((c) => c.gaze != null);
      const gOn = gz.length ? gz.filter((c) => c.gaze).length / gz.length : null;
      gaze = gOn == null ? null : gOn >= 0.5;
      // 화면·제품을 가리키는 중이거나 막 가리킨 뒤(2초)는 화면을 보는 게 정상이라 시선 알림을 띄우지 않아요(리포트와 같은 기준)
      const holds = aid === 'product' || aid === 'device';
      const showingNow = isShowing(aid) && st.frames.some((f) => f.t > t - 2 && (() => { const q = showPose(f, holds); return q.point != null || q.show || q.cross; })());
      if (showingNow) gaze = null;
      if (!showingNow && gOn != null && gOn < 0.2 && t > 4) showCue('gaze', cls.filter((c) => c.lookDown).length > gz.length / 2 ? '원고에서 눈을 들어 카메라를 봐 주세요' : audience === 'room' ? '청중 쪽을 봐 주세요' : '카메라 렌즈를 봐 주세요');
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
  }, [draft.posture, p.targets.spm, setup.targetSec, showCue, audience, aid]);

  const startRecording = useCallback(() => {
    const st = r.current;
    if (!st.stream || !st.audio) return;
    st.frames = []; st.chunks = []; st.recStart = performance.now();
    st.audio.begin(st.recStart);
    st.cooldown = {}; st.quietSince = null; st.lastQuiet = 0;
    st.transcriber = null;
    if (sttOn) { const tr = new Transcriber('ko-KR'); if (tr.supported && tr.start(st.recStart)) st.transcriber = tr; }
    st.mime = voice ? pickAudioMime() : pickMime();
    st.recorder = new MediaRecorder(st.stream, st.mime ? (voice ? { mimeType: st.mime } : { mimeType: st.mime, videoBitsPerSecond: videoBitrate() }) : undefined);
    st.recorder.ondataavailable = (e) => { if (e.data.size) st.chunks.push(e.data); };
    st.recorder.start(1000);
    setP('rec');
    setHud({ t: 0, rate: '–', tx: '', gaze: null, posture: null, pace: null });
    st.hudTimer = setInterval(updateHud, 250);
  }, [sttOn, updateHud, voice]);

  /** 영상 파일: 기준 측정 카운트다운 없이 처음부터 1배속으로 재생하며 분석해요(처음 3초가 기준). */
  const beginFile = useCallback(async () => {
    const st = r.current, v = fileVidRef.current;
    if (!v) return;
    setError('');
    try { st.audio ??= new AudioMeter(v); await st.audio.resume(); }
    catch (e) { console.error(e); setError('이 영상의 소리를 읽지 못했어요. 다른 영상으로 해 주세요.'); return; }
    resetPerson(); lastResRef.current = null;
    st.frames = []; st.calibFrames = []; st.calib = null; st.chunks = []; st.recorder = null; st.transcriber = null;
    st.cooldown = {}; st.quietSince = null; st.lastQuiet = 0;
    v.currentTime = 0;
    try { await v.play(); }
    catch { setError('영상을 재생하지 못했어요. 다시 눌러 주세요.'); return; }
    st.recStart = performance.now();
    st.audio.begin(st.recStart);
    setP('rec');
    setHud({ t: 0, rate: '–', tx: '', gaze: null, posture: null, pace: null });
    st.hudTimer = setInterval(updateHud, 250);
  }, [updateHud]);

  const begin = useCallback(async () => {
    const st = r.current;
    if (matchMedia('(max-width: 760px)').matches) window.scrollTo({ top: 0, behavior: 'smooth' }); // 폰: 카메라 화면이 꽉 보이게
    if (srcRef.current === 'file') { beginFile(); return; }
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
  }, [startRecording, beginFile]);

  const ready = (isFile ? fileOk : camOn) && model !== 'loading';
  const autoStarted = useRef(false);
  useEffect(() => { if (autoStart && ready && !autoStarted.current) { autoStarted.current = true; begin(); } }, [autoStart, ready, begin]);

  /** 녹화·소리·받아쓰기를 멈추고 분석 재료를 모아요(분석은 아직). */
  const capture = useCallback((): Captured | null => {
    const st = r.current;
    if (st.phase !== 'rec' || !st.audio) return null;
    if (srcRef.current === 'file') {
      clearInterval(st.hudTimer);
      const v = fileVidRef.current;
      v?.pause();
      return { audio: st.audio.end(), transcript: Promise.resolve(null), stopped: Promise.resolve(), durationSec: v?.currentTime ?? 0 };
    }
    if (!st.recorder) return null;
    clearInterval(st.hudTimer);
    const rec = st.recorder;
    // 폰이 뒤에서 녹화기를 이미 멈췄으면 onstop 을 기다리지 않아요
    const stopped = rec.state === 'inactive' ? Promise.resolve() : new Promise((res) => { rec.onstop = res; });
    if (rec.state !== 'inactive') rec.stop();
    return {
      audio: st.audio.end(),
      transcript: st.transcriber ? st.transcriber.stop() : Promise.resolve(null),
      stopped,
      durationSec: (performance.now() - st.recStart) / 1000,
    };
  }, []);

  async function analyzeCaptured(c: Captured) {
    const st = r.current;
    const fromFile = srcRef.current === 'file';
    // 영상 파일은 처음 3초(분석 구간에도 들어가요)로 기준을 다시 잡아요
    if (fromFile) st.calib = c.durationSec >= FILE_CALIB_SEC ? fileCalib(c.audio, st.frames) : null;
    if (!st.calib) { setP('idle'); setError(fromFile ? '영상이 너무 짧아요. 20초 이상인 영상을 올려 주세요.' : '기준 측정이 끝나지 않았어요. 다시 녹화해 주세요.'); return; }
    setP('analyzing');
    const transcript = await c.transcript;
    await c.stopped;
    const blob = fromFile ? null : new Blob(st.chunks, { type: st.recorder?.mimeType || st.chunks[0]?.type || st.mime || (voice ? 'audio/webm' : 'video/webm') });
    const videoURL = fromFile ? fileUrlRef.current! : URL.createObjectURL(blob!);
    const used: Setup = fromFile ? { ...setup, source: 'file' } : setup;
    const drop = () => { if (!fromFile) URL.revokeObjectURL(videoURL); };
    try {
      const calib = st.calib;
      const run = (audio: AudioFrames, cal = calib) => analyze({ audio, vision: st.frames, transcript, calib: cal, purpose: p, setup: used, durationSec: c.durationSec });
      // 폰이 녹화 중에 실시간 오디오를 멈추면(iOS) 음량 기록이 비어서 '말소리가 없다'로 나왔어요.
      // 기록이 빠졌거나 말소리가 없다고 나오면, 녹화 파일의 소리로 다시 재서 분석해요.
      let result = run(c.audio);
      if (blob && (AudioMeter.coverage(c.audio, c.durationSec) < 0.8 || result.invalid)) {
        const re = await framesFromRecording(blob, calib.noiseDb + 8);
        if (re && AudioMeter.coverage(re, c.durationSec) >= 0.8) {
          const dbs = re.map((f) => f.db).sort((a, b) => a - b);
          const noiseDb = Math.min(-30, dbs[Math.floor(dbs.length * 0.1)] ?? -60); // 기준 소음도 파일 소리로
          const r2 = run(re, { ...calib, noiseDb });
          if (!r2.invalid || result.invalid) result = r2;
        }
      }
      if (result.invalid) {
        // 리허설로 치지 않아요: 리포트·저장·크레딧 차감 없이 다시 녹화
        drop();
        setP('idle');
        setError(`${result.invalid} 크레딧은 쓰지 않았어요.`);
        return;
      }
      if (fromFile) handedRef.current = videoURL;
      onDone({ result, videoURL, durationSec: c.durationSec, setup: used });
    } catch (e) {
      console.error(e);
      drop();
      setP('idle');
      setError(fromFile ? '분석 중 오류가 났어요. 다시 시도해 주세요.' : '분석 중 오류가 났어요. 다시 녹화해 주세요.');
    }
  }

  async function cancel() {
    const st = r.current;
    if (st.phase === 'calib') st.audio?.end();
    if (st.phase === 'rec') await capture()?.transcript;
    st.captured = null;
    if (srcRef.current === 'file' && fileVidRef.current) fileVidRef.current.currentTime = 0;
    setP('idle');
  }

  async function stop() {
    const c = capture();
    if (c) await analyzeCaptured(c);
  }

  // 녹화하는 동안 화면이 꺼지지 않게 해요(폰 자동 잠금 때문에 카메라가 멈추는 것 방지).
  // 다른 앱으로 나가면 브라우저가 잠금을 풀어서, 돌아오면 다시 걸어요.
  const recording = phase === 'rec' || phase === 'calib';
  useEffect(() => {
    if (!recording || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null, live = true;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then((l) => { if (live) lock = l; else l.release(); }).catch(() => { /* 배터리 절약 모드 등: 그냥 녹화 */ });
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => { live = false; document.removeEventListener('visibilitychange', acquire); lock?.release().catch(() => {}); };
  }, [recording]);

  // 녹화 중 다른 앱으로 나가면 그 자리에서 녹화를 끊어요(폰은 뒤에서 카메라를 멈추거나 탭을 없애기도 해서).
  // 돌아오면 '여기까지 분석할지, 다시 녹화할지' 물어봐요. 카메라가 꺼졌으면 다시 켜요.
  useEffect(() => {
    const onVis = () => {
      const st = r.current;
      if (document.visibilityState === 'hidden') {
        if (st.phase === 'calib') { st.audio?.end(); setP('idle'); return; }
        if (st.phase === 'rec') { st.captured = capture(); setCutSec(st.captured?.durationSec ?? 0); setP('interrupted'); }
        return;
      }
      if (srcRef.current === 'camera' && st.stream && st.stream.getTracks().some((t) => t.readyState === 'ended')) { setCamOn(false); startCamera(); }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [capture, startCamera]);

  function resumeInterrupted(analyzeIt: boolean) {
    const c = r.current.captured;
    r.current.captured = null;
    if (analyzeIt && c) analyzeCaptured(c); else setP('idle');
  }

  const recLabel = isFile ? (!file ? '분석할 영상을 골라 주세요' : fileErr ? '다른 영상을 골라 주세요' : !fileOk ? '영상 불러오는 중' : model === 'loading' ? '분석 모델 불러오는 중' : '준비됐어요. 영상을 처음부터 재생하며 분석해요.') : voice ? (!camOn ? '마이크를 켜는 중' : '준비됐어요. 시작하면 3초 동안 주변 소음을 재요.') : !camOn ? '카메라를 켜는 중' : model === 'loading' ? '분석 모델 불러오는 중' : '준비됐어요. 시작하면 3초 동안 기준 자세를 재요.';
  const recText = voice ? '녹음 시작' : isFile ? '영상 분석 시작' : '녹화 시작';

  const rows: [string, string][] = [
    ['제목', setup.topic || '—'],
    ['핵심 메시지', setup.keyMessage ? `“${setup.keyMessage}”` : '—'],
    ['원하는 결과', setup.outcomeText || outcomeLabel(draft)],
    ['목표 시간', fmtTime(setup.targetSec)],
  ];
  const chip = (g: Chip) => (g === true ? ' is-good' : g === false ? ' is-bad' : '');
  const fc = (c: CatId) => (setup.focus === c ? ' is-focus' : '');
  // 녹화 중 표시(데스크톱은 카메라 화면 위, 폰은 화면 밖)
  const hudBar = (
    <>
      <div className="hud-top">
        <span className="rec-pill"><i /><b>{fmtTime(hud.t)}</b></span>
        <div className="hud-prog"><i className={hud.t > setup.targetSec * 1.1 ? 'over' : ''} style={{ width: `${Math.min(100, (hud.t / setup.targetSec) * 100)}%` }} /></div>
        <span className="hud-target">목표 <span>{fmtTime(setup.targetSec)}</span></span>
      </div>
      <div className="hud-chips">
        {!voice && <span className={`hc${chip(hud.gaze)}${fc('gaze')}`}><i />시선</span>}
        {!voice && <span className={`hc${chip(hud.posture)}${fc('posture')}`}><i />자세</span>}
        <span className={`hc${chip(hud.pace)}${fc('pace')}`}>속도 <b>{hud.rate}</b></span>
        <span className={`hc${fc('tone')}`}>음량 <span className="vol"><i style={{ width: `${level}%` }} /></span></span>
      </div>
    </>
  );

  /** 화면을 누르면 그 자리의 사람을 발표자로 정해요(다른 사람이 함께 찍혔을 때). 누른 자리를 영상 좌표(0~1)로 바꿔요. */
  const onStageTap = (e: React.PointerEvent<HTMLDivElement>) => {
    const cam = vid();
    if (!cam?.videoWidth || !lastResRef.current) return;
    const rc = cam.getBoundingClientRect();
    const vw = cam.videoWidth, vh = cam.videoHeight;
    // 화면에 실제로 그려진 영상 영역(contain 이면 여백을 빼고, cover 면 잘린 만큼 더해요)
    let dw = rc.width, dh = rc.height;
    const fit = getComputedStyle(cam).objectFit;
    if (fit === 'contain' || fit === 'cover') { const k = (fit === 'contain' ? Math.min : Math.max)(rc.width / vw, rc.height / vh); dw = vw * k; dh = vh * k; }
    let x = (e.clientX - rc.left - (rc.width - dw) / 2) / dw;
    const y = (e.clientY - rc.top - (rc.height - dh) / 2) / dh;
    if (!isFile && facing === 'user') x = 1 - x; // 앞 카메라는 거울처럼 뒤집어 보여 줘요
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    const ok = pickPerson(x, y, lastResRef.current);
    setPicked((q) => ({ ok, n: (q?.n ?? 0) + 1 }));
  };
  useEffect(() => {
    if (!picked) return;
    const t = setTimeout(() => setPicked(null), 2200);
    return () => clearTimeout(t);
  }, [picked]);

  return (
    <section className="screen">
      <div className={`studio${recording ? ' is-rec' : ''}`}>
        <div className="stage-col">
          {!voice && phase === 'idle' && (
            <div className="seg src-seg" role="radiogroup" aria-label="분석할 영상">
              <button type="button" role="radio" aria-checked={source === 'camera'} onClick={() => switchSource('camera')}>카메라로 녹화</button>
              <button type="button" role="radio" aria-checked={source === 'file'} onClick={() => switchSource('file')}>영상 파일 올리기</button>
              <SegPill />
            </div>
          )}
          <div className={`stage${isFile ? ' is-file' : ''}${fileDrag ? ' is-drag' : ''}`}
            onDragOver={isFile ? (e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setFileDrag(true); } } : undefined}
            onDragLeave={isFile ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFileDrag(false); } : undefined}
            onDrop={isFile ? (e) => { e.preventDefault(); setFileDrag(false); pickFile(e.dataTransfer.files[0]); } : undefined}>
            <div ref={mediaRef} className="stage-media" data-facing={isFile ? 'environment' : facing} hidden={voice || (isFile && !file)}
              onPointerDown={(isFile ? fileOk : camOn) && !voice ? onStageTap : undefined}>
              <video ref={camRef} playsInline muted hidden={isFile} />
              {isFile && file && (
                <video key={file.key} ref={fileVidRef} src={file.url} playsInline preload="auto"
                  onLoadedMetadata={(e) => onFileMeta(e.currentTarget)}
                  onLoadedData={(e) => { if ((!Number.isFinite(e.currentTarget.duration) || e.currentTarget.duration >= MIN_REHEARSAL_SEC)) setFileOk(true); }}
                  onError={() => { setFileOk(false); setFileErr('이 영상을 열지 못했어요. 이 브라우저에서 재생되는 형식(mp4 · H.264 권장)인지 확인해 주세요.'); }}
                  onEnded={() => { if (r.current.phase === 'rec') stop(); }} />
              )}
              <canvas ref={ovRef} />
            </div>
            {isFile && !file && (
              <div className="file-pick">
                <p className="fp-t">분석할 영상을 골라 주세요</p>
                <p className="fp-s">이미 찍어 둔 리허설 영상을 녹화한 것처럼 분석해요. {matchMediaCoarse() ? '' : '여기에 끌어다 놓아도 돼요.'}</p>
                <label className="btn-fill">영상 파일 고르기<input type="file" accept="video/*,.mp4,.mov,.m4v,.webm" hidden onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
                <p className="fp-h">mp4 · mov · webm · {MIN_REHEARSAL_SEC}초 이상 · 처음 {FILE_CALIB_SEC}초는 기준 자세로 써요</p>
                {fileErr && <p className="cam-err" role="alert">{fileErr}</p>}
              </div>
            )}
            {voice && camOn && (
              <div className="voice-stage" style={{ '--lv': level / 100 } as React.CSSProperties}>
                <span className="vs-mic" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></svg></span>
                <p className="vs-t">음성만 녹음해요</p>
                <p className="vs-s">카메라는 켜지 않아요. 말 빠르기·쉼·톤·군더더기 말·내용·시간을 분석해요.</p>
              </div>
            )}
            <div className="cam-empty" hidden={camOn || isFile}>
              <p>{voice ? '마이크를 켜는 중이에요.' : '카메라와 마이크를 켜는 중이에요.'}</p>
              {showCamBtn && <button type="button" className="btn-fill" onClick={() => { setCamErr(''); startCamera(); }}>{voice ? '마이크 켜기' : '카메라와 마이크 켜기'}</button>}
              <p className="cam-err" role="alert">{camErr}</p>
              {!voice && showCamBtn && <button type="button" className="btn-plain btn-sm cam-voice" onClick={() => onMode('voice')}>카메라 없이 음성만으로 하기</button>}
            </div>
            {!voice && (isFile ? fileOk : camOn) && (picked || crowd) && phase !== 'calib' && (
              <div key={picked?.n ?? 0} className={`who-hint${picked ? (picked.ok ? ' is-ok' : ' is-warn') : ''}`} role="status">
                {picked ? (picked.ok ? '이 사람을 분석해요' : '그 자리에서 사람을 찾지 못했어요') : '화면에서 본인을 눌러 주세요'}
              </div>
            )}
            {isFile && file && fileErr && phase === 'idle' && <div className="framing is-warn" role="alert">{fileErr}</div>}
            {!voice && !isFile && camOn && phase === 'idle' && framing && <div className={`framing ${framing.ok ? 'is-ok' : 'is-warn'}`}>{framing.msg}</div>}
            {phase === 'calib' && (
              <div className="countdown"><span>{count}</span><p>{voice ? <>잠시 조용히 있어 주세요.<br />주변 소음을 측정하고 있어요.</> : <>렌즈를 보고 바른 자세로 잠시 조용히 있어 주세요.<br />기준 자세와 주변 소음을 측정하고 있어요.</>}</p></div>
            )}
            {!voice && !isFile && canFlip && phase === 'idle' && (
              <button type="button" className="cam-flip" onClick={flip} aria-label={facing === 'user' ? '뒤 카메라로 바꾸기' : '앞 카메라로 바꾸기'}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5h3l1.6-2.2h6.8L17 8.5h3v10H4z" /><path d="M9.2 12.2a3 3 0 0 1 5.3-.9M14.8 14.6a3 3 0 0 1-5.3.9" /><path d="M14.6 9.6v1.8h-1.8M9.4 17.2v-1.8h1.8" /></svg>
              </button>
            )}
            {phase === 'rec' && (
              <div className="hud">
                <div className="hud-in">{hudBar}</div>
                {cue && <div key={cue.n} className="cue pop">{cue.text}</div>}
                <div className="hud-transcript">{hud.tx}</div>
              </div>
            )}
            {phase === 'interrupted' && (
              <div className="analyzing interrupted" role="alertdialog" aria-label="녹화가 중단됐어요">
                <b>{isFile ? '다른 화면으로 나가서 영상 분석이 멈췄어요.' : '다른 화면으로 나가서 녹화가 멈췄어요.'}</b>
                <p>{cutSec >= MIN_PARTIAL_SEC ? `${fmtTime(cutSec)}까지 ${isFile ? '봤어요' : '녹화됐어요'}. 여기까지 분석할까요?` : isFile ? '본 부분이 너무 짧아서 분석하기 어려워요. 처음부터 다시 해 주세요.' : '녹화가 너무 짧아서 분석하기 어려워요. 다시 녹화해 주세요.'}</p>
                <div>
                  {cutSec >= MIN_PARTIAL_SEC && <button type="button" className="btn-fill btn-sm" onClick={() => resumeInterrupted(true)}>여기까지 분석</button>}
                  <button type="button" className="btn-plain btn-sm" onClick={() => resumeInterrupted(false)}>{isFile ? '처음부터 다시' : '다시 녹화'}</button>
                </div>
              </div>
            )}
            {/* 폰: 카메라 화면을 꽉 채우고 녹화 버튼·전환 버튼을 화면 위 아래쪽에 둬요(데스크톱은 오른쪽 패널) */}
            {(phase === 'idle' || phase === 'rec' || phase === 'calib') && (
              <div className={`stage-ctrl is-${phase}`}>
                {phase === 'idle' ? (
                  <>
                    {error && <p className="st-err" role="alert">{error}</p>}
                    <button type="button" className="rec-big" disabled={!ready} onClick={begin} aria-label={recText}><i aria-hidden="true" /></button>
                    <p className="st-label">{ready ? recText : recLabel}</p>
                  </>
                ) : (
                  <div className="st-row">
                    {phase === 'rec' && <button type="button" className="btn-stop" onClick={stop}><i aria-hidden="true" />{isFile ? '여기까지 분석' : '종료하고 분석'}</button>}
                    <button type="button" className="btn-plain st-cancel" onClick={cancel}>취소</button>
                  </div>
                )}
              </div>
            )}
            {phase === 'analyzing' && <div className="analyzing"><div className="spin" aria-hidden="true" /><p>{voice ? '녹음을 분석하고 하이라이트를 고르는 중…' : isFile ? '영상을 분석하고 하이라이트를 고르는 중…' : '녹화를 분석하고 하이라이트를 고르는 중…'}</p></div>}
          </div>
          {/* 폰: 시간·목표·실시간 항목은 카메라 화면 밖(아래)에 둬서 화면을 가리지 않아요 */}
          {phase === 'rec' && <div className="hud-out">{hudBar}</div>}
          <div className="stage-bar">
            {voice ? <span><i className={`dot dot-${camOn ? 'ok' : 'idle'}`} />{camOn ? '마이크 켜짐 · 음성만' : '마이크 꺼짐'}</span> : <>
              {isFile
                ? <span className="sb-file"><i className={`dot dot-${fileOk ? 'ok' : fileErr ? 'bad' : 'idle'}`} />{file ? file.name : '영상 파일 없음'}</span>
                : <span><i className={`dot dot-${camOn ? 'ok' : 'idle'}`} />{camOn ? '카메라 켜짐' : '카메라 꺼짐'}</span>}
              <span><i className={`dot dot-${model === 'ok' ? 'ok' : model === 'failed' ? 'bad' : 'idle'}`} />{model === 'ok' ? '분석 준비됨' : model === 'failed' ? '음성만 분석' : '분석 모델 준비 중'}</span>
            </>}
            {isFile && file && phase === 'idle' && (
              <label className="link-btn sb-change">다른 영상<input type="file" accept="video/*,.mp4,.mov,.m4v,.webm" hidden onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} /></label>
            )}
            <span>{isFile ? '소리' : '마이크'} <span className="meter"><i style={{ width: `${level}%` }} /></span></span>
          </div>
          {recording && (
            <div className="rec-actions">
              {phase === 'rec' && <button type="button" className="btn-stop" onClick={stop}><i aria-hidden="true" />{isFile ? '여기까지 분석' : '종료하고 분석'}</button>}
              <button type="button" className="btn-plain" onClick={cancel}>취소</button>
            </div>
          )}
        </div>

        <aside className="ready">
          <h2 className="ready-h">{draft.customPurpose?.name || p.label} · {voice ? '음성만' : isFile ? '영상 파일' : POSTURES[draft.posture].label}</h2>
          <ul className="group">{rows.map(([k, v]) => <li key={k} className="cell cell-kv"><span>{k}</span><b>{v}</b></li>)}</ul>
          {isFile ? (
            <p className="file-note">영상 파일은 받아쓰기를 할 수 없어서 군더더기 말·내용 구조는 빠지고, 말 빠르기는 소리로 추정해요. 영상 길이만큼 1배속으로 재생하며 분석해요.</p>
          ) : <ul className="group">
            <li className="cell cell-switch"><label><span className="cell-t"><b>음성 받아쓰기</b><small>말 빠르기·군더더기 말·내용 구조 분석. 음성이 Google 서버로 전송돼요.</small></span><input type="checkbox" className="switch" checked={sttOn} disabled={ios} onChange={(e) => setStt(e.target.checked)} /></label>{ios && <small className="stt-ios">아이폰에서는 받아쓰기가 녹화 소리를 끊어서 꺼 둬요. 말 빠르기는 소리로 재고, 군더더기 말·내용 구조는 빠져요.</small>}</li>
            <li className="cell cell-switch"><label><span className="cell-t"><b>실시간 코칭 알림</b><small>녹화 중 “조금 천천히” 같은 알림을 띄워요.</small></span><input type="checkbox" className="switch" checked={cues} onChange={(e) => setCues(e.target.checked)} /></label></li>
          </ul>}
          <div className="tips">
            <p className="group-h">준비 팁</p>
            <ul className="tip-list">{voice ? <li>마이크와 입 사이를 한 뼘 정도로 두고, 조용한 곳에서 실제 발표하듯 소리 내어 말해 주세요.</li> : <li>{POSTURES[draft.posture].framing}</li>}{(voice ? p.tips.filter((t) => !VISUAL_TIP.test(t)) : p.tips).map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
          {setup.focus && (
            <p className="focus-note">집중 항목 <b>{CAT_LABEL[setup.focus]}</b> · 실시간 알림은 이 항목에만 떠요. <button type="button" className="btn-link" onClick={onFocusClear}>해제</button></p>
          )}
          {error && <p className="focus-note" role="alert">{error}</p>}
          <div className="rec-wrap">
            <button type="button" className="btn-fill btn-rec" disabled={!ready || phase !== 'idle'} onClick={begin}><i aria-hidden="true" />{recText}</button>
            <p className="rec-label">{recLabel}</p>
          </div>
          <button type="button" className="btn-plain" onClick={onEdit}>설정 수정</button>
          {phase === 'idle' && !isFile && (
            <button type="button" className="link-btn mode-switch" onClick={() => onMode(voice ? 'full' : 'voice')}>
              {voice ? '카메라도 켜고 영상까지 분석하기' : '카메라 없이 음성만으로 하기'}
            </button>
          )}
        </aside>
      </div>
    </section>
  );
}

const matchMediaCoarse = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

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
