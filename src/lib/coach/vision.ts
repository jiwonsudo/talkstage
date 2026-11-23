// MediaPipe 자세·얼굴 인식. 모든 처리는 브라우저 안에서 이뤄지고 영상은 서버로 전송되지 않습니다.

import { FilesetResolver, PoseLandmarker, FaceLandmarker, type PoseLandmarkerResult, type FaceLandmarkerResult } from '@mediapipe/tasks-vision';

// wasm 파일은 패키지와 같은 버전을 CDN에서 받아요.
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';

export type VisionModels = { pose: PoseLandmarker; face: FaceLandmarker; delegate: 'GPU' | 'CPU' };
export type VisionResult = { pose: PoseLandmarkerResult; face: FaceLandmarkerResult };
type Pt = { x: number; y: number };
type PoseFeat = {
  pose: true;
  sw: number; swFrame: number; smx: number; smy: number; shoulderTilt: number;
  noseX: number; noseY: number; nosePx: number; slouchR: number; headTilt?: number;
  hipVis: boolean; hipX?: number; hipY?: number;
  lw: Pt | null; rw: Pt | null; fullBody: boolean; armsCrossed: boolean;
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
      numPoses: 1,
    });
    const face = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: FACE_URL, delegate },
      runningMode: 'VIDEO',
      numFaces: 1,
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
export function detect(models: VisionModels, video: HTMLVideoElement): VisionResult {
  let ts = performance.now();
  if (ts <= lastTs) ts = lastTs + 1;
  lastTs = ts;
  const pose = models.pose.detectForVideo(video, ts);
  const face = models.face.detectForVideo(video, ts);
  return { pose, face };
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
  const lm = res?.pose?.landmarks?.[0];
  if (lm) {
    const pairs = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28]];
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
