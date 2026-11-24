import type { PlanId } from '@/lib/plans';

export type Profile = {
  id: string; email: string; name: string; plan: PlanId;
  /** 비밀번호로 로그인할 수 있는 계정인지(이메일 가입). 소셜로만 가입했으면 false */
  hasPassword?: boolean;
  /** 소셜로 가입·연결한 방법(카카오·Google) */
  social?: 'kakao' | 'google' | null;
};

export type Rehearsal = {
  id: string;
  created_at: string;
  purpose_id: string;
  posture: 'seated' | 'standing';
  topic: string | null;
  overall: number | null;
  scores: Record<string, number | null>;
  focus: string | null;
  duration_sec: number | null;
};

/** 이번 달 크레딧 현황. 서버 함수 credits_left() 가 돌려줘요. */
/** total/used 는 이번 달 요금제 크레딧, bonus 는 따로 산 크레딧(기한 없음), left 는 둘을 합친 남은 양. */
export type Credits = { plan: PlanId; total: number; used: number; bonus: number; left: number; cost: number };
