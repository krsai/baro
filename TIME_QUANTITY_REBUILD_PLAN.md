# Time / Quantity Rebuild Plan

## Goal

현재 코드베이스의 시간/수량 개념을 전면 재정리한다.

범위:
- 스타일 공정 정의
- ST 표준값 저장/조회
- AssignmentCard / AssignmentPlan
- `ctSnapshot`
- WorkLog / WorkRecord
- 프론트/백엔드 공통 유틸
- Prisma schema / DB migration / JSON payload

이번 작업은 단순 변수 rename이 아니다.
도메인 개념, 계산 규칙, 저장 구조를 같이 바로잡는 리빌드다.

중요:
- 기존 운영 데이터는 최대한 그대로 보존해야 한다.
- rename은 데이터 재입력을 전제로 하면 안 된다.
- 특히 스타일/공정/ST 데이터는 migration 없이 이름만 바꾸면 안 된다.

---

## Data Preservation Rules

### 1. JSON key rename은 migration + dual-read를 같이 간다

예:
- `stValues -> stBuckets`
- `quantity -> bucketQuantity`
- `seconds -> bucketStSeconds`
- `ctSnapshot -> assignmentCtSnapshot`

규칙:
- 먼저 `migration_fix.sql`에 bulk migration SQL을 추가한다
- 그 다음 읽기 경로에는 과도기 dual-read fallback을 둔다
- 쓰기 경로는 즉시 새 이름만 사용한다
- 운영 데이터 migration 완료 확인 후 별도 커밋에서 fallback을 제거한다

즉:
- migration 없이 rename만 금지
- dual-read 없이 새 이름만 읽는 것도 금지

### 2. DB 컬럼 rename은 `@map` 과도기를 거친다

순서:
1. `migration_fix.sql`에 `ALTER TABLE ... RENAME COLUMN ...` 또는 필요한 SQL 작성
2. Prisma schema는 `@map("old_name")` 과도기를 사용한다
3. 코드에서 새 이름으로 전환한다
4. 데이터 반영 확인 후 `@map` 제거 여부를 결정한다
5. 운영은 `prisma migrate deploy`가 아니라 `prisma db push` 기준으로 맞춘다

### 3. 우선 보존 대상

아래는 rename 시 특별히 보존을 우선해야 하는 필드다.

- `style.processes[].stValues` -> `stBuckets`
- `style.processes[].stValues[].quantity` -> `bucketQuantity`
- `style.processes[].stValues[].seconds` -> `bucketStSeconds`
- `style.processes[].quantity` -> `timesPerPiece`
- `StyleProcessStandard.quantity` -> `bucketQuantity`
- `StyleProcessStandard.stSeconds` -> `bucketStSeconds`
- `AssignmentPlan.ctSnapshot` -> `assignmentCtSnapshot`
- `AssignmentBoardState.assignments[].ctSnapshot` -> `assignmentCtSnapshot`

### 4. 조회 우선순위

- `StyleProcessStandard`는 정규화 테이블이므로 우선 조회 대상이다
- `Style.processes[].stBuckets` JSON은 fallback/보조 저장소다
- JSON migration 이후에도 조회 우선순위는
  - `StyleProcessStandard`
  - `Style JSON fallback`
  순서를 유지한다

### 5. 금지 사항

- 기존 데이터를 삭제한 뒤 재입력을 기대하는 방식 금지
- migration 없이 rename만 하는 방식 금지
- dual-read fallback 없이 새 이름만 읽는 방식 금지
- migration 후 null/빈 배열이 생겼는데 그냥 넘어가는 것 금지

## Confirmed Policies

### 1. 옷 1벌에는 여러 공정 row가 있다

- 옷 1벌은 여러 공정 row의 합으로 만들어진다.
- 예:
  - 주머니 상침
  - 주머니 바텍 2회
  - 어깨 봉제

중요:
- `주머니 바텍 2회`는 "바텍 공정을 두 번 복제한 두 row"가 아니다.
- "2회가 포함된 하나의 공정 row"다.

### 2. `quantity`는 하나가 아니다

최소한 아래 4개 축이 있다.

1. 공정 row가 한 벌 안에 몇 회 들어가는가
2. ST를 조회할 때 어떤 주문/배정 수량 버킷인가
3. card / assignment 자체가 몇 장인가
4. 작업기록에서 실제로 몇 장 생산했는가

`quantity`라는 이름 하나로 두면 계속 혼선이 난다.

### 3. ST는 수량 버킷별 표준값이다

- ST는 "공정 단독값"이 아니다.
- ST는 "공정 + 수량 버킷" 조합으로 정해진다.

정확한 표현 예시:
- `주머니 바텍 2회 공정의 60장 버킷 ST = 5.0초`
- `주머니 바텍 2회 공정의 100장 버킷 ST = 4.6초`

즉:
- 같은 공정이라도 `60장`, `100장`에서 ST가 달라질 수 있다.

### 4. Assignment 상세에서 수정한 ST는 전역 표준으로 역반영한다

- assignment 상세에서 ST를 수정하면
- 그 값은 해당 assignment에만 머무는 값이 아니라
- 스타일 표준 ST(`StyleProcessStandard`)에 역반영하는 것이 맞다.

### 5. CT는 assignment snapshot 전용값이다

- 기본값은 `ST = CT`
- 필요하면 특정 assignment에 한해 CT를 올릴 수 있다
- CT는 급여 계산용 기준값이다
- CT는 스케줄 길이 계산 기준이 아니다
- CT는 전역 표준으로 역반영하지 않는다

### 6. Split 시 ST는 비율 배분이 아니라 재조회다

- 100장 기준 ST 총초를 60장 / 40장으로 split할 때
- 기존 100장 총초를 단순 비율로 나누지 않는다
- split된 각 수량 기준으로 ST를 다시 조회한다

즉:
- `ST(100)`을 `60:40` 비율로 쪼개는 것이 아니라
- `ST(60)`, `ST(40)`을 각각 다시 계산해야 한다

---

## Core Concept Model

### A. 공정 row 내부 횟수

현재 의미:
- 스타일 공정 row의 `process.quantity`

정확한 의미:
- 한 벌 안에서 해당 공정이 몇 회 들어가는가

새 개념명:
- `timesPerPiece`

예시:
- 공정명: `주머니 바텍 2회`
- `timesPerPiece = 2`

### B. ST 표준 조회 버킷

현재 의미:
- `stValues[].quantity`
- `StyleProcessStandard.quantity`

정확한 의미:
- 주문/배정 수량 버킷 key

새 개념명:
- `bucketQuantity`

예시:
- `bucketQuantity = 40`
- `bucketQuantity = 60`
- `bucketQuantity = 100`

### C. card / assignment 자체 수량

현재 의미:
- `AssignmentCard.quantity`
- `AssignmentPlan.quantity`
- `ctSnapshot.quantity`

정확한 의미:
- 그 card / assignment가 몇 장인가

새 개념명:
- `cardQuantity`
- `assignmentQuantity`

### D. 작업기록 생산 수량

현재 의미:
- `WorkRecord.quantity`

정확한 의미:
- 실제 몇 장 생산했는가

새 개념명:
- `producedQuantity`

같은 생산 수량 축:
- `AtTrainingBucketProcess.quantity`도 생산 수량 축이다
- 차이:
  - `WorkRecord.producedQuantity`는 개별 작업기록 행
  - `AtTrainingBucketProcess.producedQuantity`는 AT 학습용 집계 행

---

## Correct Examples

### Example 1. 스타일 공정 ST 정의

스타일: `AJ1972`

공정 row:
- 공정명: `주머니 바텍 2회`
- `timesPerPiece = 2`

ST 표준값:
- 40장 버킷: `4.8초`
- 60장 버킷: `4.6초`
- 100장 버킷: `4.3초`

뜻:
- 이 공정의 ST는 수량 조건 없이 하나가 아니다
- `bucketQuantity`에 따라 달라진다

### Example 2. 한 벌 기준 공정 기여시간

조건:
- 공정명: `주머니 바텍 2회`
- `bucketQuantity = 60`
- 해당 버킷의 공정 1장 기준 ST = `4.6초`
- `timesPerPiece = 2`

그러면:
- 이 공정 row의 한 벌 기준 ST 기여시간 = `4.6 * 2 = 9.2초`

중요:
- "공정 B를 두 번 한다"가 아니다
- "2회가 포함된 하나의 공정 row"의 기여시간을 계산하는 것이다

### Example 3. 한 벌 기준 ST 합

60장 버킷 기준으로 아래 3개 공정이 있다고 가정한다.

- 주머니 상침: `12.0초`, `timesPerPiece = 1`
- 주머니 바텍 2회: `4.6초`, `timesPerPiece = 2`
- 어깨 봉제: `8.0초`, `timesPerPiece = 1`

그러면:
- 한 벌 기준 ST 합
- `pieceStTotalSeconds = (12.0*1) + (4.6*2) + (8.0*1)`
- `pieceStTotalSeconds = 29.2초`

### Example 4. assignment 전체 ST 합

조건:
- `pieceStTotalSeconds = 29.2초`
- `assignmentQuantity = 60`

그러면:
- `assignmentStTotalSeconds = 29.2 * 60 = 1752초`

### Example 5. 100장 card를 60장 / 40장으로 split

잘못된 계산:
- `cardStTotalSeconds(100)`을 그냥 `60:40` 비율로 나누는 방식

올바른 계산:
1. 60장 버킷 기준으로 각 공정 ST 재조회
2. 60장 기준 `pieceStTotalSeconds` 재계산
3. `assignmentStTotalSeconds(60)` 계산
4. 40장도 같은 방식으로 별도 재계산

즉:
- split은 "총초 비율 분배"가 아니라
- "split 수량 버킷 기준 재평가"다

---

## Working Canonical Names

### Quantity Axis

| Current Meaning | Canonical Name |
|---|---|
| 공정 row가 한 벌에 몇 회 들어가는가 | `timesPerPiece` |
| ST 표준 조회용 수량 버킷 | `bucketQuantity` |
| 카드 자체 수량 | `cardQuantity` |
| assignment 자체 수량 | `assignmentQuantity` |
| 실제 생산 수량 | `producedQuantity` |

보강 메모:
- `StyleProcess.processQuantity`도 `timesPerPiece` 축이다
- `AtTrainingBucketProcess.quantity`도 `producedQuantity` 축이다
  - 단, 개별 작업기록이 아니라 AT 학습용 집계 생산 수량이다

### Time Axis

| Current Meaning | Canonical Name |
|---|---|
| 버킷별 ST 저장값 | `bucketStSeconds` |
| 버킷 조회 후 얻은 공정 1장 기준 ST | `exactStSeconds` |
| assignment snapshot에 저장된 공정 1장 기준 CT | `snapshotCtSeconds` |
| 한 벌 기준 ST 합 | `pieceStTotalSeconds` |
| 한 벌 기준 CT 합 | `pieceCtTotalSeconds` |
| card 전체 ST 합 | `cardStTotalSeconds` |
| assignment 전체 ST 합 | `assignmentStTotalSeconds` |
| assignment 전체 CT 합 | `assignmentCtTotalSeconds` |
| WorkLog 헤더 CT 합 | `workLogCtTotalSeconds` |

### Names To Eliminate

- `quantity` 단독 사용
- `totalSt`
- `totalSeconds`
- scope 없는 `stSeconds`
- scope 없는 `ctSeconds`

---

## Current Code Conflicts

### 1. Split 계산 로직 충돌

현재 구현:
- split 시 `stTotalSeconds`를 비율로 나눈다

확정 정책:
- split 시 ST는 split 수량 버킷 기준으로 재조회해야 한다

의미:
- split / merge / reflow는 실제 계산 규칙까지 다시 짜야 한다

### 2. `quantity`가 여러 축에서 같은 이름으로 쓰인다

현재 충돌 지점:
- 스타일 공정 row의 횟수
- ST 버킷 key
- assignment 수량
- card payload 수량
- work record 생산 수량
- AT training 집계 생산 수량
- 정규화 StyleProcess의 `processQuantity`

의미:
- 코드/DB/API/문서 전체에서 이름을 분리해야 한다
- 특히 `AssignmentCard.quantity`는 DB 컬럼이 아니라 payload JSON key이므로
  schema rename이 아니라 JSON key rename + read/write 경로 수정이 필요하다

### 3. Snapshot ST 제거와 ST 역반영이 현재 충돌한다

현재 코드:
- assignment snapshot의 `stSeconds`를 읽어
- `StyleProcessStandard.stSeconds`에 역반영한다

목표 구조:
- persisted snapshot은 CT 중심 구조로 줄인다
- ST는 snapshot에 영구 저장하지 않는다

따라서 최종 리빌드에는 대체 입력 소스가 필요하다.

권장 설계:
- 저장 요청 payload에 ST draft를 write-only로 별도 전달
- 백엔드는 그 draft를 사용해
  1. `bucketStSeconds` 역반영
  2. `pieceStTotalSeconds` / `assignmentStTotalSeconds` 재계산
  3. persisted snapshot에는 ST를 남기지 않음

### 4. `totalSt` 계열 이름이 모호하다

현재 문제:
- `totalSt`가 card-level인지
- piece-level인지
- assignment-level인지
이름만 보고 알 수 없다

의미:
- 모호한 총합 이름은 제거 또는 물리 rename 대상이다

---

## Rebuild Scope

### 1. Style Domain

대상:
- `style.processes[].quantity`
- `style.processes[].timeRefQuantity`
- `style.processes[].stValues[]`
- `StyleProcessStandard.quantity`
- `StyleProcessStandard.stSeconds`
- 스타일 상세 / 스타일 시간 매트릭스 / 공통 process time 유틸

해야 할 일:
- `timesPerPiece`와 `bucketQuantity` 축 분리
- ST 버킷 조회/저장 naming 통일
- style 메뉴에서부터 올바른 개념이 보이도록 수정

### 2. Assignment Snapshot Domain

대상:
- `ctSnapshot.quantity`
- `ctSnapshot.processes[].quantity`
- `ctSnapshot.processes[].ctSeconds`
- `ctSnapshot.processes[].ctPerPieceSeconds`
- `ctSnapshot.totalCtPerPieceSeconds`
- `ctSnapshot.totalCtSeconds`

해야 할 일:
- assignment 수량 / 공정 횟수 / piece 총합 / assignment 총합 분리
- snapshot CT naming 정리
- ST persisted field 제거 시 대체 write-only ST draft payload 설계

### 3. AssignmentPlan / AssignmentCard Domain

대상:
- `AssignmentPlan.quantity`
- `AssignmentPlan.stTotalSeconds`
- `AssignmentPlan.ctTotalSeconds`
- card payload의 `quantity`
- card payload의 `totalPt`, `totalAt`, `totalSt`, `stTotalSeconds`

해야 할 일:
- card / assignment 단위 이름 분리
- `totalSt` 제거 또는 물리 rename
- split/merge 기준으로 총초 재정의

### 4. Split / Merge / Reflow

대상:
- card split
- assignment split
- assignment merge
- line reflow
- split 후 snapshot 재생성

해야 할 일:
- 비율 분배 로직 제거
- split 수량 기준 ST 재조회 로직으로 교체
- CT split 정책 확정:
  - split 시 기존 CT 수동 수정값은 승계하지 않음
  - `60장` split이면 `CT = ST(60)`으로 다시 초기화
  - `40장` split이면 `CT = ST(40)`으로 다시 초기화
  - 즉 split은 CT도 "새 수량 기준으로 다시 만드는" 작업으로 본다

### 5. WorkLog / WorkRecord

대상:
- `WorkLog.totalCtSeconds`
- `WorkRecord.quantity`
- payroll / progress / work history 연결부

해야 할 일:
- `workLogCtTotalSeconds`
- `producedQuantity`
같은 이름으로 물리 rename

주의:
- `WorkLog.totalCtSeconds`는 이미 과거 1차 rename 결과다
- 이번 `workLogCtTotalSeconds`는 2차 rename이므로
  DB 컬럼, Prisma schema, API 응답, 프론트 사용처, AGENTS 적용 메모를 같이 갱신해야 한다

### 6. DB / Prisma / API / JSON

대상:
- Prisma schema
- `migration_fix.sql`
- 저장된 JSON (`style.processes`, `ctSnapshot`, card payload)
- backend select/write payload
- frontend response mapping

해야 할 일:
- 문서상 rename이 아니라 실제 물리 rename 수행
- 필요한 데이터 migration SQL 작성

---

## Proposed Execution Order

### Phase 1. Rename Matrix Freeze

- 최종 canonical name 확정
- 현재 필드 -> 새 필드 매핑표 작성
- DB 컬럼 / JSON key / 로컬 변수 / API 응답 구분

### Phase 2. Schema / Migration Design

- Prisma schema 변경안 작성
- `migration_fix.sql` 변경안 작성
- 기존 데이터 backfill / rename SQL 설계

### Phase 3. Style Domain Refactor

- style process payload
- ST value storage
- style detail / style matrix
- 공통 ST 조회 유틸

### Phase 4. Assignment / Snapshot Refactor

- assignment payload
- `ctSnapshot` 구조
- AssignmentCard / AssignmentPlan
- board save / load

### Phase 5. Split / Merge / Reflow Refactor

- split 시 ST 재조회 구현
- assignment 수량 변경 시 snapshot 재생성 규칙 정리

### Phase 6. WorkLog / WorkRecord / Payroll Refactor

- 생산 수량 naming 분리
- worklog CT 합 naming 분리
- downstream 집계 코드 수정

### Phase 7. Document / Verification

- `AGENTS.md` 전면 정리
- 화면/응답 예시 갱신
- 회귀 테스트 / smoke test / manual checklist

---

## Verification Checklist

- 스타일 공정 row의 `timesPerPiece`와 ST 버킷 `bucketQuantity`가 코드/화면/DB에서 분리되었는가
- split 시 총초 비율 분배가 제거되었는가
- split 후 `ST(60)`, `ST(40)` 재조회가 실제로 일어나는가
- 완료 assignment가 payload에 포함됐지만 DB 기존값과 동일하면 PUT이 성공하는가
- 완료 assignment의 `lineId`, `startIndex/endIndex`, `quantity`, `assignmentCtSnapshot`, `assignmentStTotalSeconds` 중 하나를 바꾸면 PUT 전체가 `409`로 reject되는가
- PUT 저장 후 `AssignmentBoardState.assignments[]`, `AssignmentPlan`, 응답 payload의 `assignmentStTotalSeconds`가 같은가
- snapshot ST 제거 전 `StyleProcessStandard` 백필이 완료되어 기존 활성 assignment의 ST 조회가 null/0으로 떨어지지 않는가
- assignment 상세 ST 수정이 전역 ST 표준으로 역반영되는가
- CT가 스케줄 길이 계산에 사용되지 않는가
- dual-read 기간에 구 key(`ctSnapshot`, `stValues`, `quantity`, `seconds`)만 가진 기존 데이터도 CT/ST 표시가 null이 아닌가
- `final-quantity` 완료 판정 전환 전 `isCompleted = false AND completedAt IS NOT NULL` 데이터 정합성 처리가 끝났는가
- `WorkRecord.quantity`와 `AssignmentPlan.quantity`가 다른 이름으로 분리되었는가
- `totalSt` 같은 모호한 이름이 제거되었는가
- style / assignment / worklog / payroll 전부에서 같은 의미가 같은 이름으로 보이는가

---

## Notes

- `AT`는 ST와 다르다.
- ST는 버킷별 표준값 구조다.
- AT는 `AT(q) = a*q + b` 선형 모델이다.
- 따라서 AT naming은 ST naming을 그대로 복붙하면 안 된다.

- 이번 작업은 점진적 미봉책이 아니라 전면 리빌드다.
- 호환 레이어를 너무 오래 끌지 말고, 한 번에 정리한 뒤 필요한 migration만 명확히 남긴다.

---

## 2026-05-25 Latest Lock Addendum

이 섹션은 리빌드 계획의 최신 잠금 메모다.
위 섹션과 충돌하면 이 섹션을 우선한다.

### A. Snapshot 방향

- 목표 구조에서는 snapshot을 CT 중심 구조로 줄인다.
- ST는 snapshot에 영구 저장하지 않는 방향으로 간다.
- ST는 항상 최신 전역 표준에서 다시 읽어 계산한다.
- assignment 상세에서 ST를 수정하면 그 값은 전역 ST 표준에 역반영한다.

현재 코드 충돌 메모:
- 현재 역반영은 `ctSnapshot.processes[].stSeconds`를 읽어 수행된다
- 따라서 snapshot ST를 제거하려면 그 전에 write-only ST draft payload 경로를 완성해야 한다
- 제거만 먼저 하면 기존 `snapshot ST -> StyleProcessStandard` 역반영 파이프라인이 끊긴다

즉 최신 목표:
- 유지:
  - `snapshotCtSeconds`
  - `pieceCtSeconds`
  - `pieceCtTotalSeconds`
  - `assignmentCtTotalSeconds`
- 제거 검토:
  - `ctSnapshot.processes[].stSeconds`
  - `ctSnapshot.totalStPerPieceSeconds`

### B. card / assignment 설명

- `AssignmentCard`는 원본 카드 쪽 개념이다.
- `AssignmentPlan`은 실제 라인 배치 assignment 쪽 개념이다.
- 둘 다 지금은 "배정카드"처럼 읽히지만 역할이 다르다.
- 이번 리빌드에서는 모델명 rename보다 필드명 disambiguation을 우선한다.

필드명 원칙:
- `AssignmentCard.quantity` -> `cardQuantity`
- `AssignmentCard.payload.totalSt` -> `cardStTotalSeconds`
- `AssignmentCard.payload.totalPt` -> `cardPtTotalSeconds`
- `AssignmentCard.payload.totalAt` -> `cardAtTotalSeconds`
- `AssignmentPlan.quantity` -> `assignmentQuantity`
- `AssignmentPlan.stTotalSeconds` -> `assignmentStTotalSeconds`
- `AssignmentPlan.ctTotalSeconds` -> `assignmentCtTotalSeconds`

저장 레이어 메모:
- `AssignmentPlan.quantity`는 DB 컬럼 rename 대상이다
- `AssignmentCard.quantity`는 DB 컬럼이 아니라 payload JSON key rename 대상이다
- `AssignmentCard.payload.totalSt/totalPt/totalAt/stTotalSeconds`도 DB 컬럼이 아니라 JSON key rename 대상이다
  - migration SQL 또는 read-time normalize + 새 이름 write가 필요하다
  - Prisma `@map`으로 처리할 수 없다

### C. Latest Rename Draft

| Current | Final |
|---|---|
| `style.processes[].quantity` | `timesPerPiece` |
| `StyleProcess.processQuantity` | `timesPerPiece` |
| `style.processes[].stValues` | `stBuckets` |
| `style.processes[].stValues[].quantity` | `bucketQuantity` |
| `style.processes[].stValues[].seconds` | `bucketStSeconds` |
| `StyleProcessStandard.quantity` | `bucketQuantity` |
| `StyleProcessStandard.stSeconds` | `bucketStSeconds` |
| `AssignmentCard.quantity` | `cardQuantity` |
| `AssignmentCard.payload.totalSt` | `cardStTotalSeconds` |
| `AssignmentCard.payload.totalPt` | `cardPtTotalSeconds` |
| `AssignmentCard.payload.totalAt` | `cardAtTotalSeconds` |
| `AssignmentCard.payload.stTotalSeconds` | `cardStTotalSeconds` |
| `AssignmentPlan.quantity` | `assignmentQuantity` |
| `AssignmentPlan.stTotalSeconds` | `assignmentStTotalSeconds` |
| `AssignmentPlan.ctTotalSeconds` | `assignmentCtTotalSeconds` |
| `AssignmentPlan.ctSnapshot` | `AssignmentPlan.assignmentCtSnapshot` |
| `AssignmentBoardState.assignments[].ctSnapshot` | `assignmentCtSnapshot` |
| `assignmentCtSnapshot.quantity` | `assignmentQuantity` |
| `assignmentCtSnapshot.processes[].quantity` | `timesPerPiece` |
| `assignmentCtSnapshot.processes[].ctSeconds` | `snapshotCtSeconds` |
| `assignmentCtSnapshot.processes[].ctPerPieceSeconds` | `pieceCtSeconds` |
| `assignmentCtSnapshot.totalCtPerPieceSeconds` | `pieceCtTotalSeconds` |
| `assignmentCtSnapshot.totalCtSeconds` | `assignmentCtTotalSeconds` |
| `WorkRecord.quantity` | `producedQuantity` |
| `AtTrainingBucketProcess.quantity` | `producedQuantity` |
| `WorkLog.totalCtSeconds` | `workLogCtTotalSeconds` |
| `style.processes[].atParams` | `atModelParams` |

확정:
- `AssignmentPlan.ctSnapshot`은 물리 DB 컬럼명까지 `assignmentCtSnapshot`으로 맞춘다
- `AssignmentBoardState.assignments[].ctSnapshot` key도 같이 `assignmentCtSnapshot`으로 마이그레이션한다
- `style.processes[].stValues`는 `stBuckets`로 실제 rename한다
- nested JSON의 `totalCtSeconds`는 `assignmentCtTotalSeconds`로 맞춘다
- 저장 시 ST draft가 없으면 전역 ST 역반영은 skip한다
- assignment는 저장 시점의 공정/표준 구성을 고정한다
  - 이후 스타일 공정이 바뀌어도 기존 assignment는 자동 갱신하지 않는다
  - 다만 assignment 자체에 구조 변경이 생기면 최신 스타일 공정/표준 기준으로 다시 생성한다
  - 구조 변경 예: 이동, 재배치, 날짜 변경, 수량 변경, split, merge, 취소
- 단순 이동/날짜 변경도 구조 변경으로 본다
  - 수량이 그대로여도 라인 이동 또는 날짜 변경이 있으면 최신 표준 ST 재계산 대상이다
- 라인 인원 변경만 발생한 경우는 구조 변경으로 보지 않는다
  - `assignmentStTotalSeconds`는 유지한다
  - 대신 라인 capacity / 일정 / reflow 재계산 대상으로 본다
- 완료된 assignment는 읽기 전용이다
  - 열람은 가능
  - 저장/수정/이동/split/merge/cancel은 불가
- `assignmentStTotalSeconds`의 최종 계산 책임은 백엔드 저장 시점에 둔다

확정 추가:
- style/process가 바뀐 예전 assignment를 단순 열람할 때는 자동 재매핑하지 않는다
  - snapshot 공정이 현재 StyleProcess DB에 없으면 해당 공정 행은 읽기 전용으로 표시한다
  - 삭제/자동 재매핑하지 않는다
- `stDrafts`가 PUT body에 없거나 `{}` 빈 객체면 동일하게 "역반영 skip"으로 처리한다
- `stDrafts`에 assignment/snapshot에 없는 processKey가 오면
  - 해당 key만 무시하고 나머지는 정상 처리한다
  - save 전체를 실패시키지 않는다
  - 프론트에는 어떤 공정 key가 무시됐는지 토스트/경고 메시지를 보여준다
- 백엔드 구조 변경 감지 기준:
  - `quantity` 변경
  - `lineId` 변경
  - `startIndex` 또는 `endIndex` 변경
  - 신규 `externalId`
  - 위 중 하나라도 해당하면 구조 변경으로 간주
- `coverageStartDate/coverageEndDate`는 WorkLog 기간 필드이며 assignment 구조 변경 감지 기준이 아니다
  - scheduler assignment의 날짜/위치 기준은 `AssignmentPlan.startIndex/endIndex`
- `PATCH /final-quantity` 차단 기준은 최종적으로 `isCompleted === true` 단독으로 간다
  - 단, 배포 전 운영 DB에서 `isCompleted = false AND completedAt IS NOT NULL` 레코드 존재 여부를 먼저 확인한다
  - 레코드가 있으면 `isCompleted = true`로 올려 완료 상태로 맞춘다
  - `completedAt`은 지우지 않는다

추가 메모:
- `resolveAssignmentCtSnapshot`가 `item?.ctSnapshot`을 직접 읽는 동안에는
  `assignmentCtSnapshot` rename을 코드에 함께 반영하지 않으면 모든 assignment snapshot이 null이 된다
- `syncStyleProcessStandardsFromAssignmentSnapshots`가 `snapshot.processes[].stSeconds`를 읽는 경로가 살아 있는 동안에는
  snapshot에서 ST를 먼저 제거하면 안 된다

확정 보강:
- `PUT /assignment-board-state` payload에 완료 assignment가 포함되는 것 자체는 정상이다
  - 완료 assignment가 DB 기존값과 동일하면 백엔드는 기존값을 그대로 보존하고 나머지 미완료 변경만 저장한다
  - 완료 assignment의 write 필드가 DB 기존값과 하나라도 다르면 요청 전체를 `409`로 reject한다
  - 완료 항목만 조용히 skip하지 않는다
  - 예: 완료 A는 그대로이고 미완료 B만 이동된 payload는 허용한다
  - 예: 완료 A의 `lineId`, `startIndex/endIndex`, `quantity`, `assignmentCtSnapshot`, `assignmentStTotalSeconds` 중 하나라도 바뀐 payload는 전체 reject한다
  - 완료 assignment 변경 감지 대상 write 필드는 `toAssignmentPlanWriteData()`가 저장하는 실데이터 필드 전체다
    - 포함: `lineId`, `cardId`, `orderNo`, `customer`, `label`, `colorId`, `colorName`, `previewUrl`, `imageUrl`, `thumbnailUrl`, `quantity`, `originOrderId`, `basis`, `ctTotalSeconds`, `assignmentCtSnapshot`, `color`, `stripeColor`, `assignmentStTotalSeconds`, `startIndex`, `endIndex`, `startDayOffsetPercent`, `startDayPercent`, `endDayPercent`
    - 제외: `updatedAt`, `version`, `versionUpdatedAt`, `dbId`, `createdAt` 같은 서버/동기화 메타 필드
    - 완료 상태 자체(`isCompleted`, `completedAt`, `finalQuantity`)는 board save가 쓰지 않으며 전용 완료 endpoint 소관이다
- `stDrafts: null`은 잘못된 payload로 보고 reject한다
  - ST 수정이 없으면 필드를 생략하거나 `{}` 빈 객체로 보낸다
  - ST 자체는 스타일 저장 시 PT 기반으로 기본 채워지므로 "없음"을 null로 표현하지 않는다
- `stDrafts`에 assignment/snapshot에 없는 processKey가 오면 해당 key만 무시하고 저장은 계속한다
  - 프론트에는 어떤 공정 key가 무시됐는지 토스트/경고 메시지로 안내한다
  - 별도 상세 패널은 필수로 보지 않는다
- reflow로 밀린 다른 assignment의 `startIndex/endIndex` 변경도 구조 변경으로 본다
  - 예: A를 이동해서 B, C가 자동으로 밀리면 B, C도 최신 표준 ST 재계산 대상이다
  - 추가 리소스를 쓰더라도 재계산 일관성을 우선한다
  - 구현 시 PUT 1회 안에서 Style/StyleProcess/StyleProcessStandard 조회는 batch/cache로 묶어 중복 조회를 줄인다
  - 성능 때문에 reflow된 assignment를 재계산 대상에서 제외하지 않는다
- 라인 인원 변경은 날짜 기준 이력을 추적해야 한다
  - 직원 퇴사일
  - 라인 이동일
  - 라인 편성 변경일
  에 따라 해당 날짜부터 capacity / reflow 계산에 반영한다

실행 메모:
- `AssignmentPlan.assignmentCtSnapshot` 물리 rename은 DB migration + Prisma schema + 백엔드/프론트 코드 수정 + board state JSON migration이 모두 필요하다
- `style.processes[].stValues -> stBuckets`는 Style JSON bulk migration이 필요하다
- `normalizeProcessStValue` 계열 유틸 반환 객체가 style ST bucket rename의 cascade 핵심 지점이다
- snapshot ST 제거는 write-only ST draft payload 경로가 준비되기 전에는 적용하면 안 된다
- `assignmentStTotalSeconds`는 최종적으로 백엔드가 표준 ST 재조회 기준으로 재계산해서 저장해야 한다
- snapshot ST 제거 전에는 기존 활성 assignment의 ST를 `StyleProcessStandard`로 일회성 백필해야 한다
  - 기존 `assignmentCtSnapshot.processes[].stSeconds`를 읽어 `StyleProcessStandard.bucketStSeconds`로 upsert한다
  - 완료/미완료를 포함한 활성 assignment가 대상이다
  - 삭제/취소된 assignment는 제외한다
  - 백필 검증 전에는 `assignmentCtSnapshot.processes[].stSeconds`와 `assignmentCtSnapshot.totalStPerPieceSeconds`를 제거하지 않는다
  - 자연적으로 PUT이 발생해 채워지기를 기다리는 방식은 금지한다

### D. Current Code Conflict To Rebuild

- 현재 split은 비율 분배다.
- 최신 정책은 split 수량 버킷 기준 ST 재조회다.
- 따라서 split / merge / reflow / snapshot 재생성은 실제 계산 규칙까지 다시 짜야 한다.

### D-1. Highest Priority Conflicts

1. `assignmentStTotalSeconds` 백엔드 재계산 부재
- 현재 백엔드는 프론트에서 받은 `stTotalSeconds`를 pass-through 한다
- 최종 목표는 백엔드 재계산 확정이므로 save 경로 재설계가 필요하다

2. 완료 assignment 읽기 전용 미보장
- 프론트 일부 액션은 막고 있지만
- 백엔드 `PUT /assignment-board-state`, `DELETE /assignment-board-state/assignment/:id`는 아직 완료 assignment write/cancel을 막지 않는다

3. 구조 변경 시 최신 공정/표준 재생성 미구현
- split, merge, move/reschedule 모두 현재는 비율 분배 또는 단순 합산 중심이다
- 최신 ST 버킷 재조회와 snapshot 재생성 경로가 없다

4. snapshot CT-only 목표와 현재 save 경로 충돌
- snapshot에 아직 ST가 저장되고
- `stTotalSeconds`도 snapshot ST 기반으로 계산한다
- write-only ST draft payload와 백엔드 재계산 경로를 먼저 완성해야 한다

5. `assignmentCtSnapshot` / `stBuckets` 대규모 rename
- 범위는 크지만 우선순위는 위 1~4 다음이다
- 이름 정리는 계산 규칙 잠금 후 한 번에 수행한다

### D-2. Implementation-First Order

정확한 1회성 리빌드를 위해서는 rename보다 행동 규칙을 먼저 고친다.

1. 완료 assignment write 차단
- 백엔드:
  - `PUT /assignment-board-state`
  - `DELETE /assignment-board-state/assignment/:id`
  에 `isCompleted === true` guard 추가
  - `PUT /assignment-board-state`는 완료 assignment가 payload에 포함되는 것 자체는 허용한다
  - 단, 완료 assignment의 write 필드가 DB 기존값과 달라진 경우 요청 전체를 `409`로 reject한다
  - 완료 assignment가 payload에 포함됐지만 값이 동일하면 DB 기존값을 보존하고 나머지 미완료 변경만 저장한다
- 프론트:
  - CT 상세 저장
  - cancel
  - 이미 있는 drag/split/merge guard 누락분 보강

2. ST 재계산 엔진 + `stDrafts` 저장 경로
- save payload에 write-only `stDrafts` 추가
- 백엔드가
  - ST draft 역반영
  - `assignmentStTotalSeconds` 최종 재계산
  - 구조 변경 없는 save는 기존 값 유지
  를 수행하도록 변경
- 재계산된 `assignmentStTotalSeconds`는 같은 저장 트랜잭션/흐름에서 아래에 모두 반영한다
  - `AssignmentBoardState.assignments[]`
  - `AssignmentPlan.assignmentStTotalSeconds`
  - `PUT /assignment-board-state` 응답 payload
- 현재 코드는 board state를 먼저 저장한 뒤 plan sync를 수행하고, 응답도 `updatedState` 기반으로 반환한다
  - 따라서 재계산 로직은 board state 저장 전에 적용하거나
  - plan sync 후 recalculated assignments를 board state와 응답에 다시 merge해야 한다
  - 프론트 입력값을 board state에 남기고 DB plan만 재계산하는 구조는 금지한다
- PUT 1회 안에서 여러 assignment가 재계산되면 Style/StyleProcess/StyleProcessStandard 조회는 batch/cache로 묶는다
  - reflow cascade로 밀린 assignment도 구조 변경이면 재계산 대상이다
  - 성능 때문에 startIndex/endIndex 변경 assignment를 재계산 대상에서 제외하지 않는다

3. 구조 변경 감지 규칙 구현
- 최소 구분:
  - 구조 변경 없음
  - ST draft 있음
  - 구조 변경 있음
- split / merge / quantity change / cancel / recreate는 구조 변경
- line 이동 / 날짜 이동도 구조 변경
- 라인 인원 변경만 발생한 경우는 구조 변경이 아니며 capacity / reflow 대상으로 분리

4. split / merge / recreate 재생성 로직 구현
- 비율 분배 제거
- 최신 ST 버킷 재조회
- CT는 새 ST 기준으로 다시 초기화

5. JSON rename + dual-read + migration
- `stValues -> stBuckets`
- `ctSnapshot -> assignmentCtSnapshot`
- AssignmentBoardState JSON key rename
- 2026-05-27 Phase 5A status:
  - Implemented first slice: `Style.processes` JSON only.
  - `quantity -> timesPerPiece`, `stValues -> stBuckets`,
    `stValues[].quantity -> bucketQuantity`, and
    `stValues[].seconds -> bucketStSeconds`.
  - `backend/migration_fix.sql` includes the `Style.processes` bulk JSON migration.
  - Read paths keep dual-read fallback for old Style JSON keys.
  - Assignment snapshot/card JSON rename is still pending and must not be assumed complete.

6. DB 컬럼 rename + Prisma `@map` 과도기
- `AssignmentPlan.ctSnapshot -> assignmentCtSnapshot`
- `StyleProcessStandard.quantity -> bucketQuantity`
- `StyleProcessStandard.stSeconds -> bucketStSeconds`

7. 마지막에 snapshot ST 제거
- write-only `stDrafts` 경로와 백엔드 재계산이 완성된 뒤에만 수행
- 그 전에는 `snapshot.stSeconds` / `totalStPerPieceSeconds` 제거 금지
- 제거 전 선행 조건:
  - 기존 활성 assignment의 snapshot ST를 읽어 `StyleProcessStandard`로 일회성 백필 완료
  - 백필 검증 완료
  - 백필 없이 "운영 중 PUT으로 자연히 채워질 것"이라고 가정하지 않음

### E. Seconds Suffix

- canonical name의 `Seconds` suffix는 유지한다
- 이유:
  - JS/TS `number`만으로는 단위가 보장되지 않는다
  - `pieceStTotal`보다 `pieceStTotalSeconds`가 의미와 단위를 동시에 보여준다
  - DB/API/JSON grep 기준으로도 유리하다

### F. Recommended Lock Before Coding

- 완료 판정 단일 소스:
  - 확정: `isCompleted === true`
  - `completedAt`, `closedAt`은 표시용 보조값

- `assignmentStTotalSeconds` 백엔드 재계산 규칙:
  - 확정:
    - 구조 변경 없음 + ST draft 없음 -> 기존 DB 값 유지
    - 구조 변경 있음 또는 ST draft 있음 -> 백엔드가 최신 표준으로 재계산

- style/process 삭제 또는 불일치 assignment UX:
  - 확정:
    - assignment 단순 열람 시 자동 재매핑 금지
    - 기존 assignment는 저장 시점 공정 구성을 유지
    - 구조 변경 시에만 최신 스타일 기준 재생성 시도
    - 스타일 자체는 삭제 불가 전제
    - 스타일 공정은 추가/삭제/수정 가능
