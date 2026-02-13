# BARO 로컬 설정

## 1. 최초 1회 실행
프로젝트 루트에서 아래 명령을 실행하세요.

```powershell
npm run setup:env
```

아래 파일이 자동 생성됩니다.
- `frontend/.env` (`frontend/.env.example` 기반)
- `backend/.env` (`backend/.env.example` 기반)

## 2. 실제 값 입력
`frontend/.env`

```dotenv
VITE_API_BASE_URL=http://localhost:4000
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

`backend/.env`

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DB_NAME?schema=public
PORT=4000
```

## 3. 실행

```powershell
npm run dev
```

## 사무실/노트북 공유 권장 방식
- 키 구조는 `frontend/.env.example`, `backend/.env.example`를 git에 공유합니다.
- `backend/.env`는 DB 비밀번호가 포함되므로 git에 커밋하지 않습니다.
- `VITE_SUPABASE_ANON_KEY`는 클라이언트 키이지만 프로젝트 설정값이므로 신뢰 가능한 채널에서만 공유하세요.
- 실제 값은 비밀번호 관리자 Secure Note(또는 사내 시크릿 저장소)에 보관하고, 각 PC의 `.env`에 반영하는 방식을 권장합니다.
