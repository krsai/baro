# Railway + Supabase 배포 메모

## 권장 구조

- `backend` 서비스 1개를 Railway에 배포
- `frontend` 서비스 1개를 Railway에 배포
- DB/Auth 는 Supabase 사용

이 저장소는 `frontend` / `backend`가 분리된 모노레포라서, Railway에서도 서비스 두 개로 나누는 편이 가장 단순합니다.

## Railway 서비스 설정

Railway 공식 문서 기준으로 모노레포 서비스는 각 서비스마다 `Root Directory`를 지정해야 합니다.

### backend 서비스

- Root Directory: `/backend`
- Config File Path: `/backend/railway.json`
- Public Networking: 켜기
- Healthcheck Path: `/health`

환경변수:

- `DATABASE_URL`
- `DIRECT_URL`
- `PORT` 는 Railway가 자동 주입
- `BUSINESS_TIME_ZONE` 필요 시 설정

메모:

- `DATABASE_URL` 와 `DIRECT_URL` 는 Supabase Postgres 연결 문자열로 맞춰 주세요.
- Prisma 스키마는 현재 `DIRECT_URL` 기준으로 동작합니다.
- Railway 도메인의 Target Port 를 수동으로 고정하지 말고 기본 감지값을 쓰는 편이 안전합니다.

### frontend 서비스

- Root Directory: `/frontend`
- Config File Path: `/frontend/railway.json`
- Public Networking: 켜기
- Healthcheck Path: `/health`

환경변수:

- `VITE_API_BASE_URL=https://<backend-public-domain>`
- `VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co`
- `VITE_SUPABASE_ANON_KEY=<your-anon-key>`
- `VITE_ST_REVIEW_DIVERGENCE_THRESHOLD_PERCENT=10`

메모:

- `VITE_*` 값은 빌드 시점에 프런트에 포함되므로, 바꾸면 프런트 재배포가 필요합니다.

## 이번 502에서 특히 의심되는 지점

1. `backend`가 외부에서 실제로 응답하지 못하는 상태
2. Railway 서비스가 런타임 시작 전에 무거운 `prestart` 작업을 수행하던 구조
3. 모노레포 설정에서 Root Directory / Config File Path 가 어긋난 상태
4. 도메인 Target Port 또는 Public Networking 설정 불일치

## 확인 순서

1. `backend` 서비스에 `/backend/railway.json` 이 적용되었는지 확인
2. `backend` 배포 로그에서 `API running on http://0.0.0.0:<PORT>` 로그가 찍히는지 확인
3. `https://<backend-domain>/health` 가 `{"ok":true}` 를 반환하는지 확인
4. 그 다음 `frontend` 서비스의 `VITE_API_BASE_URL` 을 backend 도메인으로 맞추고 재배포
