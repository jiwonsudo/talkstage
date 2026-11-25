// MediaPipe 자세·얼굴 인식. 모든 처리는 브라우저 안에서 이뤄지고 영상은 서버로 전송되지 않습니다.

import { FilesetResolver, PoseLandmarker, FaceLandmarker, type PoseLandmarkerResult, type FaceLandmarkerResult, type NormalizedLandmark } from '@mediapipe/tasks-vision';

// wasm 파일은 패키지와 같은 버전을 CDN에서 받아요.
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

export type VisionModels = { pose: PoseLandmarker; face: FaceLandmarker; delegate: 'GPU' | 'CPU' };
/** pose·face 의 0번이 분석 대상(발표자). others 는 함께 찍힌 다른 사람(흐리게 그리고, 눌러서 고를 수 있어요). */
export type VisionResult = { pose: PoseLandmarkerResult; face: FaceLandmarkerResult; others: NormalizedLandmark[][] };
type Pt = { x: number; y: number };
type PoseFeat = {
  pose: true;
  sw: number; swFrame: number; smx: number; smy: number; shoulderTilt: number;
  noseX: number; noseY: number; nosePx: number; slouchR: number; headTilt?: number;
  hipVis: boolean; hipX?: number; hipY?: number;
  lw: Pt | null; rw: Pt | null; fullBody: boolean; armsCrossed: boolean;
  /** 어깨(사람 기준 왼쪽=11, 오른쪽=12). 가리키기·들어 보이기 판단에 써요. */
  ls: Pt; rs: Pt;
};
type FaceFeat = { face: true; yawP: number; pitchP: number; faceTilt: number; eyeH: number; eyeDown: number; smile: number };
/** 한 프레임의 분석용 특징. pose / face 가 true 일 때만 그 부위 값이 있어요. */
export type VisionFrame = { t: number } & (PoseFeat | { pose: false }) & (FaceFeat | { face: false });
export type PoseFrame = Extract<VisionFrame, { pose: true }>;
export type FaceFrame = Extract<VisionFrame, { face: true }>;
type FrameDraft = { t: number; pose: boolean; face: boolean } & Partial<Omit<PoseFeat, 'pose'>> & Partial<Omit<FaceFeat, 'face'>>;

const POSE_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const FACE_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export async function loadVision(): Promise<VisionModels> {
  const fileset = await FilesetResolver.forVisionTasks(`${MP}/wasm`);
  const make = async (delegate: 'GPU' | 'CPU') => {
    const pose = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: POSE_URL, delegate },
      runningMode: 'VIDEO',
      numPoses: MAX_PEOPLE,
    });
    const face = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_URL, delegate },
      runningMode: 'VIDEO',
      numFaces: MAX_PEOPLE,
      outputFaceBlendshapes: true,
    });
    return { pose, face, delegate };
  };
  try {
    return await make('GPU');
  } catch (e) {
    console.warn('GPU 초기화 실패, CPU로 전환', e);
    return await make('CPU');
  }
}

let lastTs = 0;

// ── 발표자 고르기 ──
// 화면에 여러 사람이 찍히면 MediaPipe 가 돌려주는 순서는 매번 달라요. 그래서 발표자 위치(target, 0~1 영상 좌표)를
// 기억해 두고 매 프레임 그 자리에서 가장 가까운 사람을 따라가요. 처음엔 가장 크게(가까이) 찍힌 사람,
// 사용자가 화면에서 누르면 그 사람으로 바꿔요(pickPerson). 따라가던 사람이 2초 넘게 안 보이면 다시 가장 큰 사람.
const MAX_PEOPLE = 3;
type Target = { x: number; y: number; seen: number; manual: boolean };
let target: Target | null = null;
const LOST_MS = 2000;
/** 따라가는 사람이 한 프레임(약 0.1초)에 움직일 수 있는 거리(영상 폭·높이 비율) */
const TRACK_R = 0.22;

const vis = (p: NormalizedLandmark | undefined) => !!p && (p.visibility ?? 1) > 0.5;
/** 사람 중심(코·어깨·엉덩이 중 보이는 점 평균)과 크기(어깨 폭) */
function personCenter(lm: NormalizedLandmark[]) {
  const pts = [0, 11, 12, 23, 24].map((i) => lm[i]).filter(vis);
  if (!pts.length) return null;
  const x = pts.reduce((a, p) => a + p.x, 0) / pts.length, y = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const size = vis(lm[11]) && vis(lm[12]) ? Math.hypot(lm[11].x - lm[12].x, lm[11].y - lm[12].y) : 0;
  return { x, y, size };
}
function personBox(lm: NormalizedLandmark[]) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const p of lm) { if ((p.visibility ?? 1) < 0.3) continue; x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { x0, y0, x1, y1 };
}

/**
 * 화면에서 누른 자리(0~1 영상 좌표)의 사람을 발표자로 정해요. 그 자리 사람이 없으면 가장 가까운 사람.
 * last 는 직전 프레임 결과(누른 순간 화면에 보이던 사람들). 고른 사람이 없으면 false.
 */
export function pickPerson(x: number, y: number, last: VisionResult | null): boolean {
  const all = last ? [...(last.pose.landmarks ?? []), ...last.others] : [];
  let best: { x: number; y: number } | null = null, bd = Infinity;
  for (const lm of all) {
    const c = personCenter(lm);
    if (!c) continue;
    const b = personBox(lm);
    const pad = 0.04;
    const inside = x > b.x0 - pad && x < b.x1 + pad && y > b.y0 - pad && y < b.y1 + pad;
    const d = Math.hypot(c.x - x, c.y - y) - (inside ? 1 : 0); // 상자 안을 누른 사람이 먼저
    if (d < bd) { bd = d; best = c; }
  }
  if (!best || bd > 0.35) return false;
  target = { x: best.x, y: best.y, seen: performance.now(), manual: true };
  return true;
}
/** 카메라를 새로 켜거나 바꿀 때 발표자 기억을 지워요. */
export function resetPerson() { target = null; }

/** 이번 프레임의 사람들 중 발표자를 0번으로 앞세워요. */
function orderPeople(pose: PoseLandmarkerResult, now: number): { pose: PoseLandmarkerResult; others: NormalizedLandmark[][] } {
  const people = pose.landmarks ?? [];
  if (people.length === 0) return { pose, others: [] };
  const cs = people.map(personCenter);
  let pick = -1;
  if (target) {
    let bd = Infinity;
    cs.forEach((c, i) => { if (c) { const d = Math.hypot(c.x - target!.x, c.y - target!.y); if (d < bd) { bd = d; pick = i; } } });
    if (bd > TRACK_R) pick = -1;
    if (pick < 0 && now - target.seen > LOST_MS) target = null; // 오래 안 보이면 다시 고르기
  }
  if (!target) {
    let bs = -1;
    cs.forEach((c, i) => { if (c && c.size > bs) { bs = c.size; pick = i; } });
    if (pick >= 0) target = { x: cs[pick]!.x, y: cs[pick]!.y, seen: now, manual: false };
  }
  if (pick < 0) {
    // 발표자를 잠깐 놓쳤어요(다른 사람만 보임): 다른 사람을 분석하지 않도록 이번 프레임은 '사람 없음'으로 둬요.
    return { pose: { ...pose, landmarks: [], worldLandmarks: [] } as unknown as PoseLandmarkerResult, others: people };
  }
  const c = cs[pick]!;
  target!.x = c.x; target!.y = c.y; target!.seen = now;
  const order = [pick, ...people.map((_, i) => i).filter((i) => i !== pick)];
  return {
    pose: { ...pose, landmarks: [people[pick]], worldLandmarks: pose.worldLandmarks?.[pick] ? [pose.worldLandmarks[pick]] : [] } as unknown as PoseLandmarkerResult,
    others: order.slice(1).map((i) => people[i]),
  };
}

/** 얼굴이 여럿이면 발표자 코(자세)에 가장 가까운 얼굴을 0번으로. 발표자 자세가 없으면 따라가던 자리 기준. */
function orderFaces(face: FaceLandmarkerResult, pose: PoseLandmarkerResult, hadPeople: boolean): FaceLandmarkerResult {
  const fs = face.faceLandmarks ?? [];
  if (fs.length === 0) return face;
  const nose = pose.landmarks?.[0]?.[0];
  const ref = nose && vis(nose) ? nose : target;
  if (!ref) return fs.length === 1 && !hadPeople ? face : { ...face, faceLandmarks: [], faceBlendshapes: [] } as FaceLandmarkerResult;
  let pick = -1, bd = Infinity;
  fs.forEach((f, i) => { const d = Math.hypot(f[1].x - ref.x, f[1].y - ref.y); if (d < bd) { bd = d; pick = i; } });
  if (bd > 0.2 && hadPeople) return { ...face, faceLandmarks: [], faceBlendshapes: [] } as FaceLandmarkerResult;
  return { ...face, faceLandmarks: [fs[pick]], faceBlendshapes: face.faceBlendshapes?.[pick] ? [face.faceBlendshapes[pick]] : [] } as FaceLandmarkerResult;
}
/** 얼굴 확대용 캔버스(브라우저에서 처음 쓸 때 만들어요) */
let zoomCanvas: HTMLCanvasElement | null = null;
const ZOOM_PX = 320;
/** 머리 상자가 화면 짧은 변의 이 비율보다 작으면(멀리 서 있음) 확대해서 얼굴을 찾아요 */
const SMALL_HEAD = 0.42;

/**
 * 자세 인식으로 찾은 머리 둘레 정사각형(픽셀). 얼굴 인식 모델은 가까운 얼굴(셀카 거리)용이라,
 * 서서 발표할 때처럼 얼굴이 작게 찍히면 못 찾아요. 그래서 머리 주변만 잘라 키워서 넣어요.
 */
function headBox(pose: PoseLandmarkerResult, W: number, H: number) {
  const lm = pose.landmarks?.[0];
  if (!lm) return null;
  const vis = (i: number) => (lm[i].visibility ?? 1) > 0.5;
  if (!vis(0) || !vis(11) || !vis(12)) return null;
  const px = (i: number) => ({ x: lm[i].x * W, y: lm[i].y * H });
  const nose = px(0), ls = px(11), rs = px(12);
  const shoulder = Math.hypot(ls.x - rs.x, ls.y - rs.y);
  const ear = vis(7) && vis(8) ? Math.hypot(px(7).x - px(8).x, px(7).y - px(8).y) : 0;
  const side = Math.max(shoulder * 1.25, ear * 3, 48);
  const cx = nose.x, cy = nose.y - side * 0.08;
  return { x: cx - side / 2, y: cy - side / 2, side };
}

export function detect(models: VisionModels, video: HTMLVideoElement): VisionResult {
  let ts = performance.now();
  if (ts <= lastTs) ts = lastTs + 1;
  lastTs = ts;
  const raw = models.pose.detectForVideo(video, ts);
  const hadPeople = (raw.landmarks?.length ?? 0) > 0;
  const { pose, others } = orderPeople(raw, ts);
  const W = video.videoWidth, H = video.videoHeight;
  const box = W && H ? headBox(pose, W, H) : null;
  if (!box || box.side > Math.min(W, H) * SMALL_HEAD) {
    return { pose, face: orderFaces(models.face.detectForVideo(video, ts), pose, hadPeople), others };
  }
  // 멀리 있는 얼굴: 발표자 머리 둘레를 잘라 키운 그림에서 찾고, 좌표를 원래 화면 기준으로 되돌려요.
  zoomCanvas ??= document.createElement('canvas');
  zoomCanvas.width = zoomCanvas.height = ZOOM_PX;
  const ctx = zoomCanvas.getContext('2d');
  if (!ctx) return { pose, face: orderFaces(models.face.detectForVideo(video, ts), pose, hadPeople), others };
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, ZOOM_PX, ZOOM_PX);
  ctx.drawImage(video, box.x, box.y, box.side, box.side, 0, 0, ZOOM_PX, ZOOM_PX);
  const f = models.face.detectForVideo(zoomCanvas, ts);
  const face: FaceLandmarkerResult = {
    ...f,
    faceLandmarks: f.faceLandmarks.map((pts) => pts.map((p) => ({ ...p, x: (box.x + p.x * box.side) / W, y: (box.y + p.y * box.side) / H }))),
  };
  return { pose, face: orderFaces(face, pose, hadPeople), others };
}

const deg = (dy: number, dx: number) => Math.abs(Math.atan2(dy, Math.abs(dx) || 1e-6)) * 180 / Math.PI;

// 한 프레임에서 분석용 특징을 뽑습니다. ar = 영상 가로/세로 비율
export function extractFeatures(t: number, poseRes: PoseLandmarkerResult | undefined, faceRes: FaceLandmarkerResult | undefined, ar: number): VisionFrame {
  const F: FrameDraft = { t, pose: false, face: false };
  const lm = poseRes?.landmarks?.[0];
  if (lm) {
    const P = (i: number) => ({ x: lm[i].x * ar, y: lm[i].y, v: lm[i].visibility ?? 1, nx: lm[i].x, ny: lm[i].y });
    const ls = P(11), rs = P(12);
    if (ls.v > 0.5 && rs.v > 0.5) {
      F.pose = true;
      const sw = Math.hypot(ls.x - rs.x, ls.y - rs.y) || 1e-6;
      F.sw = sw;
      F.ls = { x: ls.x, y: ls.y };
      F.rs = { x: rs.x, y: rs.y };
      F.swFrame = Math.abs(ls.nx - rs.nx);
      F.smx = (ls.x + rs.x) / 2;
      F.smy = (ls.y + rs.y) / 2;
      F.shoulderTilt = deg(ls.y - rs.y, ls.x - rs.x);
      const nose = P(0);
      F.noseX = nose.nx;
      F.noseY = nose.ny;
      F.nosePx = nose.x;
      F.slouchR = (F.smy! - nose.y) / sw;
      const le = P(2), re = P(5);
      if (le.v > 0.5 && re.v > 0.5) F.headTilt = deg(le.y - re.y, le.x - re.x);
      const lh = P(23), rh = P(24);
      F.hipVis = lh.v > 0.5 && rh.v > 0.5;
      if (F.hipVis) { F.hipX = (lh.x + rh.x) / 2; F.hipY = (lh.y + rh.y) / 2; }
      const lw = P(15), rw = P(16);
      F.lw = lw.v > 0.55 && lw.ny < 0.99 ? { x: lw.x, y: lw.y } : null;
      F.rw = rw.v > 0.55 && rw.ny < 0.99 ? { x: rw.x, y: rw.y } : null;
      const la = P(27), ra = P(28);
      F.fullBody = la.v > 0.5 && ra.v > 0.5 && nose.v > 0.5;
      const mid = F.smx;
      const smy = F.smy!, lwp = F.lw, rwp = F.rw;
      const hipY = F.hipVis ? F.hipY! : smy + sw * 1.2;
      F.armsCrossed = !!(lwp && rwp
        && (lwp.x - mid) * (ls.x - mid) < 0 && (rwp.x - mid) * (rs.x - mid) < 0
        && Math.abs(lwp.x - mid) > sw * 0.25 && Math.abs(rwp.x - mid) > sw * 0.25
        && lwp.y > smy && rwp.y > smy && lwp.y < hipY && rwp.y < hipY);
    }
  }
  const fl = faceRes?.faceLandmarks?.[0];
  if (fl) {
    F.face = true;
    const Q = (i: number) => ({ x: fl[i].x * ar, y: fl[i].y });
    const a = Q(33), b = Q(263), n = Q(1);
    const ex = (a.x + b.x) / 2, ey = (a.y + b.y) / 2;
    const ed = Math.hypot(a.x - b.x, a.y - b.y) || 1e-6;
    F.yawP = (n.x - ex) / ed;
    F.pitchP = (n.y - ey) / ed;
    F.faceTilt = deg(b.y - a.y, b.x - a.x);
    const cats = faceRes?.faceBlendshapes?.[0]?.categories || [];
    const bs: Record<string, number> = {};
    for (const c of cats) bs[c.categoryName] = c.score;
    const g = (k: string) => bs[k] || 0;
    F.eyeH = Math.max((g('eyeLookOutLeft') + g('eyeLookInRight')) / 2, (g('eyeLookInLeft') + g('eyeLookOutRight')) / 2);
    F.eyeDown = (g('eyeLookDownLeft') + g('eyeLookDownRight')) / 2;
    F.smile = (g('mouthSmileLeft') + g('mouthSmileRight')) / 2;
  }
  // pose / face 가 true 면 위에서 그 부위 값을 모두 채웠어요.
  return F as VisionFrame;
}

// 미리보기 위에 뼈대와 상태를 그립니다.
export function drawOverlay(ctx: CanvasRenderingContext2D, res: VisionResult | null, w: number, h: number, colors: { line: string; joint: string; face: string }) {
  ctx.clearRect(0, 0, w, h);
  const pairs = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28]];
  // 함께 찍힌 다른 사람은 흐린 흰 선으로만(분석 안 함). 눌러서 발표자로 바꿀 수 있어요.
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(1.5, w / 480);
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.setLineDash([6, 6]);
  for (const o of res?.others ?? []) {
    for (const [a, b] of pairs) {
      if ((o[a].visibility ?? 1) < 0.5 || (o[b].visibility ?? 1) < 0.5) continue;
      ctx.beginPath(); ctx.moveTo(o[a].x * w, o[a].y * h); ctx.lineTo(o[b].x * w, o[b].y * h); ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  const lm = res?.pose?.landmarks?.[0];
  if (lm) {
    ctx.lineWidth = Math.max(2, w / 320);
    ctx.strokeStyle = colors.line;
    ctx.lineCap = 'round';
    for (const [a, b] of pairs) {
      if ((lm[a].visibility ?? 1) < 0.5 || (lm[b].visibility ?? 1) < 0.5) continue;
      ctx.beginPath();
      ctx.moveTo(lm[a].x * w, lm[a].y * h);
      ctx.lineTo(lm[b].x * w, lm[b].y * h);
      ctx.stroke();
    }
    ctx.fillStyle = colors.joint;
    for (const i of [11, 12, 13, 14, 15, 16, 23, 24]) {
      if ((lm[i].visibility ?? 1) < 0.5) continue;
      ctx.beginPath();
      ctx.arc(lm[i].x * w, lm[i].y * h, Math.max(3, w / 220), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const fl = res?.face?.faceLandmarks?.[0];
  if (fl) {
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (const p of fl) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
    ctx.strokeStyle = colors.face;
    ctx.lineWidth = Math.max(1.5, w / 480);
    const r = 10;
    const X = x0 * w, Y = y0 * h, W = (x1 - x0) * w, H = (y1 - y0) * h;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(X, Y, W, H, r); else ctx.rect(X, Y, W, H);
    ctx.stroke();
  }
}
