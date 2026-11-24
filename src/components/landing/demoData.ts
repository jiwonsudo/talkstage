// 랜딩 예시 영상(AI로 만든 영상)을 Talkstage 분석기로 실제로 분석한 결과예요. 손으로 고치지 마세요.
// 같은 코드(lib/coach: MediaPipe 자세·얼굴 인식 + 음성 분석)로 뽑았고, 프레임별 인식 결과는 public/media/nv-*.track.json 에 있어요.
// 기준 자세(카운트다운 3초)는 렌즈를 보고 있는 nv-b 첫 3초로 잡았어요. 발표 상황: 업무 보고 · 서서.
export type DemoCat = { id: string; label: string; score: number | null; status: string; value: string | number | null; target: string; headline: string | null; advice: string | null };
export type DemoIssue = { cat: string; t0: number; t1: number; title: string; detail: string };
export type DemoClip = { dur: number; cats: DemoCat[]; issues: DemoIssue[] };
export const DEMO: Record<'a' | 'b', DemoClip> = {
  "a": {
    "dur": 10.091,
    "cats": [
      {
        "id": "gaze",
        "label": "시선",
        "score": 8,
        "status": "bad",
        "value": "14%",
        "target": "60% 이상",
        "headline": "카메라를 보는 시간이 14%예요 (목표 60%)",
        "advice": "시선이 주로 아래를 향했어요. 원고를 볼 때는 키워드만 확인하고 문장은 카메라를 보며 말하세요."
      },
      {
        "id": "posture",
        "label": "자세",
        "score": 0,
        "status": "bad",
        "value": "17%",
        "target": "바른 자세 85% 이상",
        "headline": "등이 굽고 고개가 앞으로 나온 자세가 보인 순간이 있어요",
        "advice": "원고를 내려다보느라 등이 굽고 고개가 앞으로 나와요. 원고는 가슴 높이로 들고 키워드만 확인한 뒤, 어깨를 편 채 정면을 보며 말하세요."
      },
      {
        "id": "gesture",
        "label": "제스처",
        "score": 100,
        "status": "good",
        "value": "12%",
        "target": "5–30%",
        "headline": "손짓을 적절하게 쓰고 있어요",
        "advice": "말의 내용과 손짓이 맞아떨어지는지 하이라이트 영상으로 확인해 보세요."
      },
      {
        "id": "tone",
        "label": "톤·억양",
        "score": 100,
        "status": "good",
        "value": 2.7,
        "target": "1.8–4반음",
        "headline": "억양에 적당한 변화가 있어요",
        "advice": "핵심 문장에서 음을 바꿔 강조하는 습관을 유지하세요."
      },
      {
        "id": "pause",
        "label": "호흡·쉼",
        "score": 100,
        "status": "good",
        "value": "19%",
        "target": "14–26%",
        "headline": "쉼을 적절하게 쓰고 있어요",
        "advice": "핵심 메시지 직후의 쉼을 조금 더 길게 가져가 보세요."
      }
    ],
    "issues": [
      {
        "cat": "gaze",
        "t0": 0.4,
        "t1": 8.999,
        "title": "아래(원고)를 내려다봄",
        "detail": "8.6초 동안 시선이 아래를 향했어요."
      },
      {
        "cat": "posture",
        "t0": 0.598,
        "t1": 8.999,
        "title": "등이 굽고 고개가 앞으로 나온 자세",
        "detail": "8.4초 동안 이어졌어요."
      }
    ]
  },
  "b": {
    "dur": 10.217,
    "cats": [
      {
        "id": "gaze",
        "label": "시선",
        "score": 100,
        "status": "good",
        "value": "89%",
        "target": "60% 이상",
        "headline": "시선 처리가 안정적이에요 (89%)",
        "advice": "문장이 끝날 때까지 시선을 유지하는 지금 습관을 이어가세요."
      },
      {
        "id": "posture",
        "label": "자세",
        "score": 100,
        "status": "good",
        "value": "100%",
        "target": "바른 자세 85% 이상",
        "headline": "자세가 안정적이에요",
        "advice": "지금의 열린 자세를 유지하세요."
      },
      {
        "id": "gesture",
        "label": "제스처",
        "score": 100,
        "status": "good",
        "value": "18%",
        "target": "5–30%",
        "headline": "손짓을 적절하게 쓰고 있어요",
        "advice": "말의 내용과 손짓이 맞아떨어지는지 하이라이트 영상으로 확인해 보세요."
      },
      {
        "id": "tone",
        "label": "톤·억양",
        "score": 100,
        "status": "good",
        "value": 2.8,
        "target": "1.8–4반음",
        "headline": "억양에 적당한 변화가 있어요",
        "advice": "핵심 문장에서 음을 바꿔 강조하는 습관을 유지하세요."
      },
      {
        "id": "pause",
        "label": "호흡·쉼",
        "score": 100,
        "status": "good",
        "value": "16%",
        "target": "14–26%",
        "headline": "쉼을 적절하게 쓰고 있어요",
        "advice": "핵심 메시지 직후의 쉼을 조금 더 길게 가져가 보세요."
      }
    ],
    "issues": []
  }
};
