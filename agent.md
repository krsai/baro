# Baro ERP - 개발 환경 설정

## 실행
```bash
npm run dev
```
프론트: http://localhost:5173
백엔드: http://localhost:4000

## Supabase 프로젝트
- 프로젝트 ref: `hizhbjtjtdwuwtqpjqlb`
- 리전: ap-south-1 (Mumbai)
- 대시보드: https://supabase.com/dashboard/project/hizhbjtjtdwuwtqpjqlb

## backend/.env
```
DATABASE_URL="postgresql://postgres.hizhbjtjtdwuwtqpjqlb:[PASSWORD]@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"
PORT=4000
BUSINESS_TIME_ZONE=Asia/Seoul
WORK_LOG_ASSIGNMENT_PROCESS_QTY_MAX_MULTIPLIER=3
```

## frontend/.env
```
VITE_API_BASE_URL=http://localhost:4000
VITE_SUPABASE_URL=https://hizhbjtjtdwuwtqpjqlb.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_-CYP4H8_i0dldy3IcLI87g_1HcCp0zO
```

## DB 비밀번호 확인/재설정
Supabase 대시보드 → Project Settings → Infrastructure → Database password → Reset

비밀번호 재설정 후 `backend/.env`의 `[PASSWORD]` 부분 교체.

## 주의사항
- Transaction pooler 포트: **6543** (Session pooler: 5432)
- dotenv v17은 반드시 `override: true` 옵션 필요 → `src/index.ts:17`에 적용됨
- 인도 리전 DNS 문제 발생 시: Windows DNS를 Cloudflare(1.1.1.1)로 변경
