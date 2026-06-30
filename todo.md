# TODO - WorkRecord 실DB FK 정규화와 레거시 컬럼 정리 인수인계

기준일: 2026-06-30

이 문서는 “지금 코드가 어디까지 바뀌었는지”, “왜 Railway DB에서는 아직 예전 WorkRecord가 보이는지”, “다른 사무실 환경에서 무엇부터 확인하고 어떤 순서로 이어서 해야 하는지”를 정리한 인수인계 문서다.

---

## 1. 지금 문제의 핵심

이번 작업에서 내가 먼저 바꾼 것은 크게 두 가지였다.

1. 앱 코드의 WorkRecord 저장/조회 맵핑
2. WorkRecord를 정규화하는 DB 스키마 + migration SQL

그런데 사용자 입장에서 중요한 것은 맵핑이 아니라 실제 DB다.

즉, 아래 둘이 실제로 완료되어야 의미가 있다.

1. 기존 WorkRecord 실데이터에 FK를 실제로 찾아서 채우는 것
2. 그 뒤 레거시 컬럼을 실제 DB에서 삭제하는 것

지금 Railway 화면에서 보이는 상황은 이 두 번째 단계까지 실제 DB에 아직 반영되지 않았다는 뜻이다.

---

## 2. 최종 목표 구조

### WorkRecord에서 최종적으로 남겨야 하는 컬럼

- `id`
- `orgId`
- `workLogId`
- `workerId`
- `lineId`
- `styleId`
  - 최종 의미: `Style.uid`를 가리키는 정수 FK
- `styleProcessId`
  - 최종 의미: `StyleProcess.id`를 가리키는 정수 FK
  - ST 계산의 핵심 기준
- `assignmentPlanId`
- `effectiveCoverageStartDate`
- `effectiveCoverageEndDate`
- `ctSeconds`
- `quantity`
- `createdAt`
- `createdBy`
- `updatedAt`

### WorkRecord에서 지워야 하는 레거시 컬럼

- `workerName`
- `customerName`
- `orderNo`
- `styleUid`
- `styleName`
- `processId`
- `processCode`
- `colorId`
- `colorCode`

주의:
- 최종 구조에서는 `styleId`가 더 이상 스타일 코드 문자열이 아니다.
- 최종 구조에서는 `styleId = Style.uid` 정수 FK다.
- 스타일 코드 문자열이 필요하면 `Style.styleId`를 join으로 읽어야 한다.

---

## 3. 이미 코드에서 바뀐 것

### 스키마

파일:
- `backend/prisma/schema.prisma`

반영 내용:
- `WorkRecord.styleId`를 `Int?` FK로 바꿈
- `WorkRecord.style` relation을 `Style.uid`에 연결
- `WorkRecord.worker` relation 추가
- `WorkRecord.styleProcessId` 기준 구조 반영
- `processId`를 포함한 위 레거시 컬럼들을 Prisma 스키마에서 제거

### 저장/응답 맵핑

파일:
- `backend/src/index.ts`
- `backend/src/work-records/workRecord.shared.ts`
- `frontend/src/pages/App/work/WorkDetail.jsx`
- `frontend/src/pages/App/work/workLogStorage.js`
- `backend/src/payroll/payroll.service.ts`
- `backend/src/quantity-settlement/quantitySettlement.service.ts`

반영 내용:
- WorkRecord 저장 시 canonical FK 중심으로 저장하도록 수정
- style/process/worker/customer/order 표시값은 가능하면 relation이나 assignmentPlan에서 복원
- 레거시 컬럼에 직접 의존하던 조회 경로 일부 제거

중요:
- 이건 “앱 코드” 기준 반영이다.
- 실제 Railway DB 테이블이 예전 상태면, 코드는 바뀌어도 DB는 그대로일 수 있다.

---

## 4. migration_fix.sql에서 이미 준비된 실제 DB 작업

파일:
- `backend/migration_fix.sql`

이번 WorkRecord 관련 핵심 step은 아래 네 단계다.

### Step 5a-2

- `WorkRecord.styleProcessId` 컬럼 추가
- `WorkRecord.styleProcessId -> StyleProcess.id` FK 추가

### Step 5b

2026-04-01 이후 운영 데이터에 대해 deterministic하게만 backfill한다.

채우는 값:
- `orderNo`
- `lineId`
- `styleUid`
- `styleId` 텍스트
- `styleName`
- `processCode`

소스:
- `assignmentPlanId -> AssignmentPlan`
- `AssignmentPlan.cardId/originOrderId -> WorkOrder -> WorkOrderItem -> Style`
- `processCode -> StyleProcess`

중요:
- 애매한 추정은 하지 않는다.
- 한 개로 확정되는 경우만 채운다.

### Step 5c

- `styleUid + processCode`가 정확히 1개의 `StyleProcess`와 매칭될 때만
- `WorkRecord.styleProcessId`를 backfill한다.

### Step 5d

여기서 드디어 destructive cleanup을 한다.

내용:
- 텍스트 `styleId` + `styleUid` 구조를 canonical 정수 FK 구조로 바꾼다.
- 필요 시 `styleUid` 값을 새 `styleId`로 승격한다.
- 레거시 컬럼을 drop한다.
- 새 FK와 index를 다시 만든다.

즉, 코드만 바꾼 게 아니라 실제 DB 정리 SQL도 이미 들어가 있다.
지금 Railway 화면이 옛 구조로 보인다는 것은 이 SQL이 그 환경에 아직 적용되지 않았다는 뜻이다.

---

## 5. 2026-06-30 기준 실제 확인 결과

내 현재 작업 환경에서 `DATABASE_URL`로 연결되는 DB에 대해 직접 확인했다.

### 확인용 스크립트 추가

새로 추가한 파일:
- `backend/scripts/inspect-workrecord-state.js`

새 npm 명령:
- `npm run workrecord:inspect`

이 스크립트는 다음을 출력한다.

- 현재 WorkRecord 컬럼 목록
- `styleId` 타입이 text인지 integer인지
- legacy 컬럼이 아직 남아 있는지
- canonical 컬럼이 어느 정도 있는지
- null summary
- 문제가 되는 sample row

### 현재 내 환경에서 나온 결과

결과 요약:
- `WorkRecord.total = 0`
- `styleIdDataType = "text"`
- legacy 컬럼들이 그대로 있음
- `styleProcessId` 없음
- 즉 `isLegacySchema = true`

이 말은 매우 중요하다.

### 해석

현재 내 로컬 환경의 `DATABASE_URL`은

1. 사용자가 캡처한 Railway DB와 다른 DB이거나
2. 같은 서비스가 아니거나
3. 비어 있는 오래된 DB를 보고 있을 가능성이 높다.

왜냐하면:
- 사용자가 캡처한 화면에는 WorkRecord 행이 실제로 많이 있음
- 그런데 내 현재 연결 DB에서는 `WorkRecord` row count가 0임

따라서 이 환경에서는 “실제 운영 DB 데이터가 FK로 잘 backfill되었는지”를 끝까지 검증할 수 없었다.

즉:
- 코드 변경은 끝남
- migration SQL도 준비됨
- 하지만 사용자가 보여준 그 Railway DB 자체는 여기서 직접 완료 검증하지 못함

---

## 6. 다른 사무실 환경에서 바로 해야 할 일

여기서부터가 실제 이어서 할 작업 순서다.

### 1단계. 올바른 DB를 보고 있는지 먼저 확인

백엔드 폴더에서:

```bash
npm run workrecord:inspect
```

기대하는 것:
- `WorkRecord.total`이 Railway 화면과 대략 비슷한 수준이어야 함
- 0이면 잘못된 DB를 보고 있는 것

만약 또 `total = 0`이면:
- 현재 환경변수의 `DATABASE_URL`이 운영 Railway DB가 아님
- 이 상태에서는 backfill/cleanup 검증을 하면 안 됨

### 2단계. 실제 운영 DB가 맞다면 schema stage 확인

`npm run workrecord:inspect` 결과에서 아래를 본다.

- `styleIdDataType`
- `legacyColumnsPresent`
- `isLegacySchema`
- `isCanonicalSchema`

현재 Railway 스크린샷처럼 옛 구조라면 대략 아래처럼 나와야 정상이다.

- `styleIdDataType = text`
- `styleUid` 존재
- `styleProcessId` 없음
- `workerName/customerName/orderNo/processId/processCode/colorId/colorCode` 존재
- `isLegacySchema = true`

### 3단계. 최신 백엔드 코드와 DB migration을 같은 작업 세션에서 반영

매우 중요:

레거시 컬럼 drop는 destructive change다.
따라서 “옛 백엔드 코드가 계속 떠 있는 상태”에서 DB 컬럼만 먼저 drop하면 서버가 깨질 수 있다.

안전한 순서:

1. 최신 코드 pull
2. 최신 백엔드 빌드 가능 확인
3. migration 적용
4. 최신 백엔드 재시작/배포

명령:

```bash
cd backend
npm run prisma:prepare-client
npm run prisma:apply:migration-fix
npm run prisma:deploy:safe
```

설명:
- `prisma:apply:migration-fix`
  - `migration_fix.sql` 직접 실행
- `prisma:deploy:safe`
  - `prisma db push --skip-generate`
  - destructive reset 없이 스키마를 맞추는 용도

### 4단계. 적용 후 다시 점검

다시:

```bash
npm run workrecord:inspect
```

기대 결과:
- `styleIdDataType = integer`
- `styleUid` 없음
- `styleProcessId` 존재
- `workerName/customerName/orderNo/styleName/processCode/colorId/colorCode` 없음
- `processId` 없음
- `isCanonicalSchema = true`

### 5단계. 데이터 손실 없이 row count 유지되는지 확인

확인 포인트:
- migration 전 WorkRecord row count
- migration 후 WorkRecord row count

둘이 같아야 한다.

### 6단계. canonical FK가 얼마나 잘 채워졌는지 확인

`workrecord:inspect` 결과와 SQL로 확인할 것:

- `assignmentPlanId` null 개수
- `styleId` null 개수
- `styleProcessId` null 개수

핵심:
- `styleProcessId`가 가장 중요하다.
- 실제 생산 ST 계산은 `WorkRecord.styleProcessId -> StyleProcessStandard`로 가야 하기 때문이다.

### 7단계. 실제 화면 검증

최소 검증 화면:

1. 작업 기록 저장/수정
2. 작업 기록 목록 조회
3. 배정 화면 실제 생산 계산
4. 급여 집계
5. 스타일/AT 관련 화면

특히 확인할 것:
- 작업기록 신규 저장이 되는지
- 기존 작업기록 조회 시 스타일/공정 이름이 정상 표시되는지
- `/line-month-capacity` 실제 생산 계산이 깨지지 않는지

---

## 7. 왜 “맵핑만 바꾸는 것”이 부족한가

이건 명확히 남겨둬야 한다.

맵핑만 바꾸면 생기는 문제:

1. 기존 DB row는 여전히 텍스트 `styleId`, 별도 `styleUid`, `processCode`, `workerName` 구조로 남아 있음
2. 새 코드가 relation을 기대해도 old row가 그대로면 실제 계산은 계속 fallback/legacy 의존이 됨
3. 결국 “정규화된 척하는 코드”가 되고, 실제 데이터는 여전히 정규화되지 않음

그래서 반드시 필요한 순서는 아래다.

1. deterministic backfill
2. canonical FK 검증
3. 레거시 컬럼 drop
4. 앱 코드에서 레거시 참조 제거

이번 repo에서는 1~3에 대한 SQL은 넣어둔 상태다.
지금 부족한 건 “사용자가 보는 실제 Railway DB에 그 SQL이 적용되었는지 검증”이다.

---

## 8. 지금 시점의 정확한 판단

### 완료된 것

- Prisma 스키마 기준 정규화 방향 확정
- 앱 코드 저장/조회 맵핑 반영
- WorkRecord 정리용 `migration_fix.sql` 반영
- WorkRecord 실DB 점검용 `npm run workrecord:inspect` 추가

### 아직 완료라고 말하면 안 되는 것

- 사용자가 캡처한 Railway DB에 실제 migration이 끝났는지
- 실제 운영 WorkRecord row가 FK로 얼마나 backfill됐는지
- 레거시 컬럼 drop가 그 환경에서 이미 끝났는지

즉, “코드는 준비됐는데 실제 운영 DB 완료 검증은 아직”이라고 보는 게 맞다.

---

## 9. 주의할 파일

### 가장 중요한 파일

- `backend/prisma/schema.prisma`
- `backend/migration_fix.sql`
- `backend/src/index.ts`
- `backend/src/work-records/workRecord.shared.ts`
- `backend/scripts/inspect-workrecord-state.js`

### 주의할 보조 파일

- `backend/scripts/backfill-workrecord-canonical-fields.js`

이 스크립트는 더 이상 WorkRecord를 수정하지 않는다.
현재 최종 구조의 소스오브트루스는 `migration_fix.sql`이다.
명령 이름은 유지하지만 내용은 스키마/FK 상태를 점검하고 migration 적용 필요 여부를 출력하는 안전한 점검용이다.

---

## 10. 다음 작업 우선순위

### 우선순위 1

실제 운영 Railway DB가 맞는 환경에서 아래 실행:

```bash
cd backend
npm run workrecord:inspect
```

### 우선순위 2

운영 DB가 legacy schema면 아래 실행:

```bash
npm run prisma:prepare-client
npm run prisma:apply:migration-fix
npm run prisma:deploy:safe
npm run workrecord:inspect
```

### 우선순위 3

WorkRecord row count와 canonical FK null 개수 확인

### 우선순위 4

배정 화면 실제 생산 계산, 작업기록 저장/조회, 급여 집계를 실제로 테스트

### 우선순위 5

작업기록 저장/파일 업로드/배정 실제 생산 화면을 실제 운영 DB에서 확인

---

## 11. 마지막 메모

지금 상태를 한 줄로 요약하면:

“코드는 WorkRecord 정규화 방향으로 바뀌었고 DB 정리 SQL도 들어갔지만, 사용자가 보여준 실제 Railway DB에는 아직 그 변화가 적용된 것으로 확인되지 않았다.”

다음 환경에서는 반드시

1. 올바른 DB를 잡고
2. `workrecord:inspect`로 현재 상태를 확인한 뒤
3. migration 적용 여부를 검증

하는 순서로 이어가면 된다.

---

## 12. 2026-06-30 추가 작업 기록

이번 세션에서 실제로 반영한 내용:

- `WorkRecord` 저장 payload에서 `workerName`, `customerName`, `orderNo`, `styleUid`, `styleName`, `processId`, `colorId`, `colorCode`, `colorName` 저장 경로를 제거했다.
- `WorkRecord.styleId`는 `Style.uid` 정수 FK로만 다루고, 화면 표시용 스타일 코드는 `styleCode`로 분리했다.
- 작업기록 응답에서 `styleUid`, `processId`, `colorId`, `colorCode`, `colorName`을 제거했다.
- 작업기록 상세 화면 저장 요약에서도 `styleUid`와 색상 필드를 보내지 않도록 정리했다.
- 작업기록 상세 화면 저장 요약과 디버그 로그에서 WorkRecord 저장값으로 `processId`를 보내거나 표시하지 않도록 정리했다.
- `/line-month-capacity` 실제 생산 계산은 `WorkRecord.styleId`와 `WorkRecord.styleProcessId`를 기준으로만 진단/계산하도록 정리했다.
- 진행률/완료량 공정 그룹도 `styleProcessId` 기준으로 맞췄다.
- 배정 CT 스냅샷 정규화와 파일 업로드 공정 옵션에서 `styleProcessId`를 보존/요구하도록 정리했다.
- 사용되지 않던 orphan WorkRecord 텍스트 매칭 함수(스타일명/주문번호로 배정 카드를 추정하는 경로)를 제거했다.
- `backend/scripts/backfill-workrecord-canonical-fields.js`는 더 이상 쓰기 백필을 하지 않고, migration 경로를 안내하는 점검 스크립트로 바꿨다.
- 백엔드 시작 보정 함수가 `WorkRecord.orderNo`를 다시 추가하지 않도록 제거했다.
- 수량 정산의 WorkRecord 집계에서 `processId`와 색상별 생산량 집계를 제거하고, 스타일/`styleProcessId` 기준 집계로 정리했다.
- `AGENTS.md`에 정확 계산 원칙, WorkRecord FK 기준, 색상/사이즈/성별 미사용 원칙, `todo.md` 지속 업데이트 원칙을 반영했다.

검증한 것:

- `backend`: `npm run prisma:prepare-client`, `npm run build`
- `frontend`: `npm run build`
- `backend`: `npm run backfill:workrecord-canonical-fields`는 쓰기 없이 schema 점검 결과만 출력하는 것을 확인
- 현재 이 환경의 `npm run workrecord:inspect` 결과는 `WorkRecord.total = 0`, `isLegacySchema = true`다. 사용자가 캡처한 운영 데이터가 있는 DB와 다른 연결로 보이므로 운영 데이터 backfill 완료 여부는 여기서 검증하지 못했다.

아직 남은 것:

- 실제 운영 Railway DB에서 `npm run workrecord:inspect`로 현재 DB가 canonical schema인지 확인해야 한다.
- 운영 DB가 legacy schema이면 `npm run prisma:apply:migration-fix` 적용 후 다시 `npm run workrecord:inspect`를 실행해야 한다.
- `AssignmentPlan.colorId/colorName/color`, `WorkOrderItem.colorId/colorCode/colorName`은 아직 스키마와 여러 화면에 남아 있다. 작업기록/실제생산 계산에서는 제거했지만, 배정/주문 쪽 컬럼 삭제는 별도 범위로 검토해야 한다.

화면 테스트 방법:

- 작업 기록 상세 화면에서 저장 후 Network payload에 `styleUid`, `processId`, `colorId`, `colorCode`, `colorName`이 없는지 확인한다.
- 작업 기록 상세 화면에서 저장 후 목록을 다시 열어 작업자/스타일/공정 표시가 relation 기반으로 정상 복원되는지 확인한다.
- 배정 화면(`/assignment`)에서 4월/5월을 열고 콘솔의 `[line-month-capacity] actual output diagnostics`에서 `workRowsWithStyleId`, `workRowsWithStyleProcessId`, `directMatchedRecordCount`, `skipReasonCounts`를 확인한다.
- 스타일 삭제는 작업기록이 연결된 스타일이면 `WorkRecord.styleId = Style.uid` 기준으로 차단되는지 확인한다.
