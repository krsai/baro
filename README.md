# BARO / LINEOS

의류 제조사·포워더 SaaS입니다. 문서 정리 기준일은 2026-11-08입니다.

## 무엇을 읽으면 되나요?

| 목적 | 문서 | 관리 방식 |
|---|---|---|
| **어디까지 됐고 무엇이 남았는지** | [작업 상태](todo.md) | 완료·부분 구현·보류·미확인을 구별하는 유일한 진행표 |
| 개발할 때 지킬 현재 기준 | [AGENTS.md](AGENTS.md) | 핵심 규칙만 유지 |
| 생산·AT·급여 등 세부 규칙 찾기 | [개발 참고 자료](docs/development-reference.md) | 기존 상세 기준·변경 원문. 관련 절만 검색 |
| 물류·스타일 등 조사/구현 근거 찾기 | [업무별 참고 자료](docs/domain-reference.md) | 기존 17개 문서를 목차·상태 안내와 함께 통합 |
| 공통 UI를 수정할 때 | [테마 기준](frontend/src/theme/README.md) | 컴포넌트·표·입력 규격 |
| 개발 로그를 정리할 때 | [로그 정책](logs/README.md) | 선택 저장·보관 상한·정리 명령 |

`CLAUDE.md`는 도구가 AGENTS.md를 읽도록 연결하는 작은 파일입니다. 날짜별 완료 문서와 로그를 계속 만들지 않습니다. 오래된 원문은 Git 이력에도 남아 있습니다. 과거 미체크 항목을 지금도 미구현이라고 단정하지 않습니다.

## 실행

```powershell
npm.cmd run setup:env
npm.cmd run dev
```

프런트는 `frontend`(Vite/React), 백엔드는 `backend`(Express/TypeScript/Prisma)입니다. 업무 DB는 Railway Postgres, 인증은 Supabase를 사용합니다. 비밀 환경 파일은 Git에 포함하지 않습니다.

## 검사

```powershell
npm.cmd run test:app-review
npm.cmd run check:encoding
npm.cmd run check:i18n
```

개별 기능은 package.json의 `test:*`를 사용합니다. `test:regression`은 전체 검사 묶음이므로 작은 수정마다 반복하지 않습니다. 검사는 기본적으로 터미널에만 출력합니다.

## 로그 정리

```powershell
npm.cmd run logs:collect
npm.cmd run logs:clean
```

기존 파일을 모을 때도 번호 사본을 무한 보관하지 않습니다. 보관 상한은 최근 20개·10MiB·14일입니다. 업무 감사 이력·원본·JSON 조사 결과는 정리 대상이 아닙니다.
