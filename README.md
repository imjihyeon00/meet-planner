# 약속정하기

친구, 모임, 동아리 등 여러 사람이 가능한 날짜와 시간을 등록하고 가장 많이 겹치는 시간을 추천받는 일정 조율 MVP입니다.

## Stack

- Next.js 15 App Router
- TypeScript
- Tailwind CSS
- shadcn/ui 스타일의 로컬 UI 컴포넌트
- Supabase Client + PostgreSQL 스키마

## 실행

```bash
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## Supabase 연결

1. Supabase 프로젝트를 생성합니다.
2. `supabase/schema.sql`을 SQL Editor에서 실행합니다.
3. `.env.example`을 참고해 `.env.local`을 만듭니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

환경변수가 없으면 개발 편의를 위해 브라우저 로컬 저장소를 사용합니다.

이미 Supabase 테이블을 만든 뒤 스키마가 바뀐 경우에도 `supabase/schema.sql`을 다시 실행하면 누락된 컬럼이 추가됩니다.

## 문서

- `docs/INIT.md`: 초기 세팅과 실행 방법
- `docs/PRD.md`: 기능 요구사항과 MVP 범위
- `docs/TECH_STACK.md`: 기술 스택과 아키텍처

## 구현된 MVP

- 그룹 생성
- 초대 링크 생성 및 코드 참여
- 비회원 닉네임 참여
- 달력 범위 기반 시간표 선택
- 전체 / 평일 / 주말 / 직접 선택 기반 후보 요일 필터
- 클릭/드래그 선택 및 해제
- 참여자 등록 상태 확인
- 겹치는 시간 자동 집계
- 추천 일정 목록
- 최종 일정 확정
