/**
 * 영상 파일 하나를 녹화 화면(Studio)과 같은 방식으로 분석해요.
 * - 영상을 1배속으로 재생하면서 captureStream() 의 소리를 AudioMeter 에, 화면을 MediaPipe 에 넣어요(약 10fps).
 * - 처음 3초는 기준 측정(Studio 의 카운트다운과 같음): 영상 첫 3초는 조용히 렌즈를 보고 있어야 해요.
 * - 받아쓰기(Web Speech)는 파일을 못 읽어서, 라벨에 transcript 가 있으면 그걸 시간에 고르게 나눠 써요.
 * 탭이 뒤로 가면 브라우저가 화면 갱신을 늦춰서 결과가 틀려져요 → 검증하는 동안 탭을 앞에 두세요.
 */
import { analyze, buildCalibration, type Analysis } from '@/lib/coach/analysis';
import { AudioMeter, type TranscriptResult } from '@/lib/coach/audio';
import { detect, extractFeatures, type VisionFrame, type VisionModels, resetPerson } from '@/lib/coach/vision';
import type { Setup } from '@/lib/coach/types';
import { PURPOSE_BY_ID } from '@/lib/scenarios';
import type { EvalLabel } from './compare';

const CALIB_SEC = 3;

export type ClipRun = { analysis: Analysis; durationSec: number; frames: number; transcriptFrom: 'label' | 'none' };

/** 정답 대본을 녹화 시간에 고르게 나눠 받아쓰기 결과 모양으로 만들어요(문장 단위). */
function transcriptFromText(text: string, durationSec: number): TranscriptResult {
  const parts = text.split(/(?<=[.!?。…])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const total = parts.reduce((n, s) => n + s.length, 0) || 1;
  let t = 0;
  const finals = parts.map((s) => {
    const len = (s.length / total) * durationSec;
    const f = { t0: t, t: t + len, text: s };
    t += len;
    return f;
  });
  return { finals, events: [], error: null };
}

export async function runClip(file: File, label: EvalLabel, models: VisionModels, onTick?: (sec: number, total: number) => void): Promise<ClipRun> {
  const purpose = PURPOSE_BY_ID[label.purpose ?? 'interview'] ?? PURPOSE_BY_ID.interview;
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.playsInline = true;
  video.preload = 'auto';
  // 화면에는 안 붙이지만 크롬은 붙지 않은 video 도 재생·캡처돼요.
  try {
    await new Promise<void>((res, rej) => { video.onloadedmetadata = () => res(); video.onerror = () => rej(new Error('영상을 열지 못했어요(코덱 확인).')); });
    await new Promise<void>((res) => { if (video.readyState >= 2) res(); else video.onloadeddata = () => res(); });
    // 모델을 한 번 미리 돌려 둬요(첫 실행이 느려서 기준 측정 구간이 밀리는 것 방지)
    resetPerson(); // 앞 영상의 발표자 위치를 지워요
    try { detect(models, video); } catch { /* 첫 프레임이 비어 있어도 괜찮아요 */ }
    const stream = (video as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream();
    await video.play();
    // 재생이 시작돼야 소리 트랙이 생겨요
    for (let i = 0; i < 50 && !stream.getAudioTracks().length; i++) await new Promise((r) => setTimeout(r, 20));
    if (!stream.getAudioTracks().length) throw new Error('영상에 소리 트랙이 없어요.');
    const audio = new AudioMeter(stream);
    await audio.resume();

    audio.begin(performance.now());
    const calibFrames: VisionFrame[] = [];
    const frames: VisionFrame[] = [];
    let calib: ReturnType<typeof buildCalibration> | null = null;
    let recStart = 0, lastDet = 0;
    const ar = video.videoWidth / video.videoHeight;

    await new Promise<void>((res) => {
      const loop = () => {
        if (video.ended || video.paused) { res(); return; }
        requestAnimationFrame(loop);
        const now = performance.now();
        // 기준 측정 3초는 시계가 아니라 영상 재생 위치로 잘라요(화면 갱신이 멈칫해도 정답 시간과 맞게)
        if (!calib && video.currentTime >= CALIB_SEC) {
          calib = buildCalibration(audio.end(), calibFrames);
          audio.pitchGate = calib.noiseDb + 8;
          recStart = now;
          audio.begin(now);
        }
        if (now - lastDet < 95 || !video.videoWidth) return;
        lastDet = now;
        let r;
        try { r = detect(models, video); } catch { return; }
        const f = extractFeatures(calib ? (now - recStart) / 1000 : 0, r.pose, r.face, ar);
        (calib ? frames : calibFrames).push(f);
        onTick?.(video.currentTime, video.duration);
      };
      video.onended = () => res();
      requestAnimationFrame(loop);
    });

    const audioFrames = audio.end();
    audio.close();
    if (!calib) throw new Error(`영상이 ${CALIB_SEC}초보다 짧아요.`);
    const durationSec = (performance.now() - recStart) / 1000;
    const transcript = label.transcript ? transcriptFromText(label.transcript, durationSec) : null;
    const setup: Setup = {
      purposeId: purpose.id, posture: label.posture ?? 'seated', outcomeIdxs: [0],
      targetSec: label.targetSec ?? Math.round(durationSec),
    };
    const analysis = analyze({ audio: audioFrames, vision: frames, transcript, calib, purpose, setup, durationSec });
    return { analysis, durationSec, frames: frames.length, transcriptFrom: transcript ? 'label' : 'none' };
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
