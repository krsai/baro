# 생산 단계 확장 및 다림질 통합 개발 계획

> 작성일: 2026-08-06  
> 상태: 구현 전 설계 기준  
> 적용 범위: 스타일 공정, 작업기록, 배정 snapshot, AT, 생산 진행률, 생산능력, 생산수당  
> 핵심 방향: 공정 데이터는 통합하고 계산 경계는 생산 단계별로 분리한다.

## 1. 문서 목적

현재 BARO의 `StyleProcess`와 `WorkRecord`는 사실상 봉제 공정을 전제로 한다. 앞으로 다림질을 같은 스타일의 필수 생산 공정으로 추가하되, 봉제 완료 후 다른 직원과 작업장으로 업무가 인계되는 현실을 반영해야 한다.

다림질을 별도 업무 시스템으로 복제하지 않는다. 스타일, 주문, 배정, 공정, 작업기록이라는 공통 관계는 재사용한다. 대신 봉제와 다림질의 노동시간, 진행률, 생산능력, 수당 정책을 암묵적으로 같은 계산 풀에 넣지 않도록 생산 단계와 실행 자원을 명시한다.

이 문서는 다음 질문에 대한 구현 기준을 고정한다.

- 다림질을 기존 `StyleProcess`에 포함할 수 있는가?
- 업무 인계 후의 다림질 노동시간을 봉제 AT와 어떻게 분리할 것인가?
- 봉제 라인과 공용 다림질 작업장의 생산능력을 어떻게 구분할 것인가?
- PT, CT, ST, AT를 어떤 목적으로 사용하고 서로 자동 덮어쓰지 않게 할 것인가?
- 기존 봉제 배정 snapshot과 과거 AT 관측을 어떻게 보존할 것인가?
- 향후 검품과 포장을 추가할 때 같은 구조를 재사용할 수 있는가?

## 2. 확정된 업무 원칙

### 2.1 공정과 생산 단계

- 다림질은 스타일을 완성하는 생산 공정이므로 `StyleProcess`로 관리한다.
- 모든 생산 공정은 하나의 공통 공정 체계를 사용한다.
- 공정에는 `SEWING`, `IRONING`, `INSPECTION`, `PACKING` 생산 단계를 명시한다.
- 기존 공정은 모두 `SEWING`으로 분류한다.
- 화면상의 그룹명이 아니라 서버 계산에 사용하는 관계형/enum 값이 소스오브트루스다.
- 공정명에 `다림질`, `봉제` 같은 문자열이 포함됐는지로 단계를 추론하지 않는다.

### 2.2 생산수당

- 생산수당 기준값은 승인된 CT다. 실제 AT가 CT를 자동 변경하지 않는다.
- 현재 예시에서는 공장 초당 단가가 50동이고, 스타일의 봉제 CT 합계가 1,000초이면 장당 봉제 생산수당은 50,000동이다.
- 다림질 CT가 100초이면 같은 초당 단가로 장당 5,000동을 지급하고, 스타일 전체 장당 생산수당은 55,000동으로 계산할 수 있다.
- 같은 초당 단가로 표현할 수 없는 미래 정책을 위해 `PER_SECOND`, `PER_PIECE`, `NONE` 정책을 지원할 수 있는 구조를 만든다.
- 수당 정책이 지정되지 않은 신규 공정은 자동으로 생산수당에 포함하지 않는다.
- 생산수당은 계속 생산수당만 계산하며 전체 급여 체계로 확대하지 않는다.

### 2.3 시간값의 의미

| 값 | 의미 | 자동 변경 여부 |
|---|---|---|
| PT | 최초 직접 측정 또는 공정 설계 참고시간 | CT를 자동 변경하지 않음 |
| CT | 생산수당 지급 기준시간 | 관리자 승인으로만 변경 |
| ST | 계획과 생산능력 계산 기준시간 | 버전과 수량 버킷으로 관리 |
| AT | 실제 작업기록과 노동시간으로 산출한 관측/추정시간 | PT·CT·ST를 자동 변경하지 않음 |

### 2.4 AT 경계

- 봉제 노동시간은 봉제 공정에만 배분한다.
- 다림질 노동시간은 다림질 공정에만 직접 귀속하거나 다림질 기록끼리만 배분한다.
- 서로 다른 생산 단계 또는 생산능력 그룹의 기록을 같은 노동시간 배분 풀에 넣지 않는다.
- 직접 측정한 시간은 출퇴근 기반 배분 가능 시간에서 먼저 차감한다. 같은 시간을 직접 귀속과 비례배분에 이중 사용하지 않는다.
- 기존 `v2`와 `v3-st-stable` 관측은 감사 자료로 보존한다. 새로운 단계 인식 모델은 별도 모델 버전으로 생성한다.

### 2.5 진행률과 생산능력

- 봉제 완료와 전체 생산 완료는 서로 다른 지표다.
- 다림질 완료수량이 봉제 완료수량을 낮추지 않는다.
- 다림질 ST를 봉제 라인의 잔여 부하와 생산능력에 넣지 않는다.
- 전체 주문 리드타임에는 각 생산 단계의 시간을 포함할 수 있지만 단계별 capacity는 별도로 계산한다.
- 공장 공용 다림질 직원이 여러 봉제 라인의 제품을 처리해도 다림질 capacity는 특정 봉제 라인 소유가 아니다.

### 2.6 과거 데이터

- 과거 `AssignmentPlan.assignmentCtSnapshot`과 `assignmentStSnapshot`을 재작성하지 않는다.
- 과거 `StyleProcessAtObservation`과 AT 파라미터를 새 모델 값으로 덮어쓰지 않는다.
- 기존 봉제 결과가 배포 전후 동일해야 하는 호환 기간을 둔다.
- 과거 배정에 신규 다림질 실적을 연결해야 할 때 원본 snapshot을 수정하지 않고 추가 snapshot revision을 사용한다.

## 3. 현재 구현 조사 결과

### 3.1 현재 관계

- `StyleProcess`는 스타일별 공정, PT, AT 파라미터와 ST 표준행의 기준이다.
- `WorkRecord`는 `styleProcessId`, `assignmentPlanId`, `styleId`를 필수로 요구하고 `lineId`를 선택값으로 저장한다.
- 실제 작업기록 저장 API는 라인과 직원 배정을 검증하므로 실행 흐름은 봉제 라인 중심이다.
- `AssignmentPlan`은 공정별 CT/ST JSON snapshot과 합계시간을 보존한다.
- 진행률은 배정 CT snapshot의 필수 공정 그룹과 공정별 누적수량을 사용한다.
- 라인 월 capacity는 라인 인원, 출퇴근시간, 작업기록 ST, 배정 잔여 ST를 결합한다.
- 생산수당은 `WorkRecord.quantity × WorkRecord.ctSeconds × 공장 초당 단가`로 계산한다.
- 수량 정산은 스타일의 공정별 작업수량 최소값을 사용하므로 단계 분리 없이 다림질을 추가하면 기존 추정수량이 바뀔 수 있다.
- AT 학습 버킷은 작업자와 일자 중심이지만 생산 단계와 capacity group 경계가 없다.
- 월 작업 화면 일부는 현장 직무가 봉제인 직원만 대상으로 판별한다.

### 3.2 단순 공정 추가 시 발생하는 오류

1. 다림질 수량이 기존 봉제 완료수량의 최소값 계산에 들어간다.
2. 다림질 ST가 봉제 라인의 총 ST와 잔여 부하에 포함될 수 있다.
3. 다림질 전담 직원에게 임의의 봉제 라인 배정이 필요해진다.
4. 출퇴근 노동시간이 생산 단계 구분 없이 공정들 사이에 배분될 수 있다.
5. 직접 측정한 다림질 시간이 출퇴근 기반 노동시간에도 남아 이중 귀속될 수 있다.
6. 신규 공정이 기존 생산수당에 의도치 않게 자동 포함될 수 있다.
7. 기존 배정 snapshot에 없는 다림질 공정은 작업기록 저장 검증에서 차단된다.
8. 스타일 공정 수 변경이 기존 배정의 완료 조정과 ST 대체 판단에 영향을 줄 수 있다.

## 4. 목표 도메인 모델

명칭은 Prisma 구현 전에 최종 검토하되 아래 책임 분리는 유지한다.

### 4.1 enum

```text
ProductionStage
- SEWING
- IRONING
- INSPECTION
- PACKING

AtAllocationMethod
- ALLOCATED
- DIRECT_MEASURED
- NONE

CapacityGroupType
- SEWING_LINE
- IRONING
- INSPECTION
- PACKING

ProductionAllowanceRateType
- PER_SECOND
- PER_PIECE
- NONE

WorkRecordStatus
- DRAFT
- CONFIRMED
- CANCELLED

WorkRecordKind
- NORMAL
- REWORK
- CORRECTION
```

`INSPECTION`과 `PACKING`은 초기 화면에 노출하지 않아도 DB와 계산 계약에서 예약한다. 실제 업무 규칙이 확정되기 전에는 해당 단계의 생성 기능을 활성화하지 않는다.

### 4.2 StyleProcess 확장

```text
StyleProcess
- productionStage                ProductionStage
- defaultCapacityGroupId         Int?
- atAllocationMethod             AtAllocationMethod
- sewingCompletionRequired       Boolean
- productionCompletionRequired   Boolean
- allowanceEligible              Boolean
- allowancePolicyId              Int?
- isActive                       Boolean
```

불변식:

- 기존 행은 `productionStage=SEWING`, `atAllocationMethod=ALLOCATED`로 백필한다.
- `sewingCompletionRequired=true`는 `productionStage=SEWING`에서만 허용한다.
- `productionCompletionRequired`는 최종 생산 완료 계산에 포함할지 결정한다.
- `DIRECT_MEASURED` 공정은 확정 작업기록에 유효한 측정 세션이 있어야 AT 관측에 포함한다.
- `allowanceEligible=true`만으로 지급하지 않는다. 유효한 정책과 적용 기간이 함께 있어야 한다.

### 4.3 CapacityGroup

```text
CapacityGroup
- id
- orgId
- factoryId
- type
- name / nameKo / nameVi
- isActive
- created/updated audit fields
```

관계:

- 기존 `Line`을 삭제하거나 즉시 대체하지 않는다.
- 각 활성 봉제 라인은 정확히 하나의 `SEWING_LINE` capacity group과 1:1 연결한다.
- 다림질은 공장별 하나 이상의 `IRONING` capacity group을 가질 수 있다.
- `CapacityGroup(factoryId, orgId)`는 `Factory(id, orgId)` 복합 FK로 조직 범위를 강제한다.
- 직원의 실행 자원 소속은 기간 이력이 필요한 `CapacityGroupAssignment`로 관리한다.

```text
CapacityGroupAssignment
- capacityGroupId
- employeeId
- startAt
- endAt
```

- 같은 시각에 한 직원이 여러 그룹에 속할 수 있는지 여부는 단계별 운영 정책으로 검증한다.
- 봉제 라인 이력은 기존 `LineAssignment`를 보존하고 capacity group assignment와 트랜잭션으로 동기화한다.
- 장기적으로 `LineAssignment`를 제거할지는 별도 마이그레이션 단계에서 결정하며 이번 변경에서 즉시 삭제하지 않는다.

### 4.4 WorkSession

직접 측정 AT의 원본 증거를 작업기록 숫자 한 칸으로만 보존하지 않고 별도 세션으로 관리한다.

```text
WorkSession
- id
- orgId
- workerId
- assignmentPlanId
- styleProcessId
- capacityGroupId
- startedAt
- endedAt
- breakSeconds
- measuredLaborSeconds
- measurementSource
- status
- created/updated audit fields
```

불변식:

- `endedAt > startedAt`이어야 한다.
- `breakSeconds >= 0`이고 전체 세션 길이를 초과할 수 없다.
- `measuredLaborSeconds = endedAt - startedAt - breakSeconds`를 서버가 계산한다.
- 같은 작업자의 확정 세션 시간은 겹칠 수 없다.
- 세션의 조직, 작업자, 배정, 공정, capacity group은 동일 조직 범위여야 한다.
- 취소 세션은 AT와 진행률 및 수당에 포함하지 않는다.
- 하나의 세션이 여러 스타일/배정을 포함하면 자동 분할 추정하지 않고 사용자가 별도 세션으로 나누도록 한다.

### 4.5 WorkRecord 확장

```text
WorkRecord
- capacityGroupId                 Int?
- productionStageSnapshot        ProductionStage?
- atAllocationMethodSnapshot     AtAllocationMethod?
- workSessionId                  Int?
- measuredLaborSecondsSnapshot   Int?
- allowancePolicySnapshotId      Int?
- allowanceIncluded              Boolean
- recordStatus                   WorkRecordStatus
- recordKind                     WorkRecordKind
- originalWorkRecordId           Int?
```

불변식:

- 신규 확정 기록은 `capacityGroupId`와 단계 snapshot을 필수로 한다.
- 봉제 기록은 `lineId`와 해당 라인의 capacity group이 일치해야 한다.
- 비봉제 기록은 임의의 봉제 `lineId`를 요구하지 않는다.
- 기록의 단계 snapshot은 저장 당시 `StyleProcess.productionStage`와 일치해야 한다.
- 정상 완료수량과 재작업수량을 분리하고 재작업은 최초 생산수량에 중복 합산하지 않는다.
- `DIRECT_MEASURED` 기록은 확정 시 세션 또는 검증된 측정시간을 요구한다.
- `CANCELLED`와 `DRAFT`는 진행률, AT, 생산수당에서 제외한다.

### 4.6 AssignmentProcessSnapshot

현재 JSON snapshot을 즉시 폐기하지 않되, 공정별 불변식을 DB FK로 강제할 수 있는 관계형 snapshot을 신규 소스오브트루스로 도입한다.

```text
AssignmentProcessSnapshot
- id
- orgId
- assignmentPlanId
- revision
- styleProcessId
- productionStage
- capacityGroupId
- ctSeconds
- stSeconds
- quantityBucketEntryId
- quantityBucketSetVersionId
- atAllocationMethod
- sewingCompletionRequired
- productionCompletionRequired
- allowancePolicyId
- snapshotSource
- addedAfterAssignment
- createdAt
```

원칙:

- 신규 배정은 저장 트랜잭션에서 서버가 snapshot 행을 생성한다.
- 클라이언트가 보낸 CT/ST와 단계값을 신뢰하지 않는다.
- 기존 배정의 snapshot 행은 기존 JSON, 정확한 관계 FK와 저장 합계가 교차 검증되는 경우에만 백필한다.
- 정확한 과거 공정/version을 확정할 수 없으면 추정 백필하지 않고 수리 대상으로 남긴다.
- 과거 배정에 다림질을 추가하면 `ADDED_AFTER_ASSIGNMENT` revision을 생성한다.
- 추가 revision은 원래 봉제 ST, 봉제 완료율과 기존 일정 결과를 소급 변경하지 않는다.
- 호환 기간에는 JSON snapshot 응답도 관계형 snapshot에서 생성하되 양쪽 일치 검증을 수행한다.

### 4.7 생산수당 정책

현재 공장 단가 이력은 유지하고 공정 단계 및 지급 방식 선택을 추가한다.

```text
ProductionAllowancePolicy
- id
- orgId
- factoryId
- productionStage
- rateType: PER_SECOND | PER_PIECE | NONE
- rate
- effectiveFromMonth
- effectiveToMonth
- isActive
- version
```

계산:

```text
PER_SECOND = quantity × ctSecondsSnapshot × applicableWagePerSecond
PER_PIECE  = quantity × pieceRateSnapshot
NONE       = 0
```

원칙:

- 기존 공장 초당 단가 이력과 직원별 override 의미를 보존한다.
- 신규 정책은 적용 시작 월 기준으로 버전 관리한다.
- 작업기록과 생산수당 snapshot에는 실제 적용 정책을 동결한다.
- AT, PT 또는 현재 스타일의 변경값을 과거 생산수당 계산에 재사용하지 않는다.
- 단계별 정책이 없으면 계산을 조용히 0으로 만들지 않고 준비 상태 오류로 표시한다. 단, 명시적 `NONE`은 정상 제외다.

### 4.8 업무 인계와 WIP

단계별 최소 완료수량만으로 화면을 만들 수 있지만 실제 인계 책임과 수량 차이를 보존하려면 관계형 이벤트가 필요하다.

```text
ProductionHandoff
- id
- orgId
- assignmentPlanId
- fromStage
- toStage
- sourceCapacityGroupId
- destinationCapacityGroupId
- quantity
- handedOffAt
- handedOffByEmployeeId
- receivedAt
- receivedByEmployeeId
- status
- correctionOfId
- note
```

원칙:

- 인계는 원본 삭제가 아니라 취소/정정 이벤트로 보정한다.
- 인계수량은 출발 단계 완료수량을 초과할 수 없으며 초과 시 저장을 차단하거나 관리자 예외를 명시적으로 기록한다.
- 다림질 완료수량이 수령수량을 초과하면 경고한다.
- 초기 배포에서는 인계 화면을 기능 플래그 뒤에 두되 스키마와 계산 인터페이스는 단계 모델에 맞춘다.

## 5. 계산 계약

### 5.1 단계별 완료수량

```text
sewingCompletedQuantity
= sewingCompletionRequired=true인 봉제 공정별 정상 완료수량의 최소값

stageCompletedQuantity(stage)
= 해당 단계의 필수 공정별 정상 완료수량의 최소값

productionCompletedQuantity
= productionCompletionRequired=true인 전체 공정별 정상 완료수량의 최소값
```

- 단계에 필수 공정이 없으면 `0`으로 가장하지 않고 `NOT_CONFIGURED` 상태를 반환한다.
- 완료 조정은 기존 봉제 완료 조정과 단계별 완료 조정을 구분한다.
- 현재 `MANUAL_PROGRESS_ADJUSTMENT`는 봉제 배정 상태만 바꾸는 기존 의미를 보존한다.
- 재작업과 취소 기록은 최초 완료수량을 증가시키지 않는다.

### 5.2 WIP

인계 기능 활성화 전 참고 계산:

```text
wipAwaitingIroning
= max(0, sewingCompletedQuantity - ironingCompletedQuantity)
```

인계 기능 활성화 후 운영 계산:

```text
ironingWaitingQuantity
= receivedForIroning - ironingCompleted - validReturnOrCorrection
```

두 값은 각각 `추정 WIP`와 `인계 기준 WIP`로 구분해 표시한다.

### 5.3 AT 배분 풀

기본 풀:

```text
Organization × Worker × WorkDate/coverage period × ProductionStage × CapacityGroup
```

처리 순서:

1. 유효 출퇴근시간 또는 기존 8시간 fallback으로 `sourceLaborInputSeconds`를 확정한다.
2. 해당 풀의 확정 `DIRECT_MEASURED` 세션 시간을 합산한다.
3. 직접 측정시간을 원 노동시간에서 차감한다.
4. 직접 측정 공정에는 세션 시간을 그대로 귀속한다.
5. 남은 시간만 같은 풀의 `ALLOCATED` 공정에 ST snapshot 비율로 한 번 배분한다.
6. 기존 ST 작업량 2배 상한을 적용한다.
7. 배분되지 않은 시간은 `unexplainedLaborInputSeconds`로 보존한다.
8. `NONE`, `DRAFT`, `CANCELLED`, 잘못된 FK 기록은 학습에서 제외하고 진단 건수로 노출한다.

공식:

```text
remainingLaborSeconds
= max(0, sourceLaborInputSeconds - confirmedDirectMeasuredSeconds)

direct allocatedLaborInputSeconds
= measuredLaborSeconds

allocated pool input
= min(remainingLaborSeconds, 2 × allocatedProcessStWorkloadSeconds)
```

- 직접 측정시간 합계가 출퇴근 노동시간을 초과하면 자동 축소하지 않는다. 데이터 오류 또는 초과근무 미기록으로 표시하고 관리자 검토 대상으로 둔다.
- 직접 측정 공정도 기존 `Organization × StyleProcess × AssignmentPlan` 관측 단위를 유지할 수 있으나 `observationSource`, 단계, capacity group을 함께 저장한다.

### 5.4 신규 AT 모델 버전

- 기존 `v3-st-stable`을 수정하거나 삭제하지 않는다.
- 단계 인식과 직접 측정 혼합 모델은 새로운 상수, 예: `v4-stage-aware`로 생성한다.
- 운영 화면 전환 전 동일한 봉제 입력에 대해 v3와 v4의 봉제 관측 및 파라미터가 허용 오차 내에서 일치해야 한다.
- 다림질은 충분한 직접 측정 관측이 쌓이기 전에는 `PROVISIONAL`로 표시한다.
- 회귀식 `total labor seconds = a × quantity + b`, `a > 0`, `b >= 0`과 관측 범위 밖 정책은 기존 v3 규칙을 유지한다.
- 직접 측정과 배분 관측은 품질 등급에서 출처를 구분하고 혼합 비율을 진단값으로 제공한다.

### 5.5 생산능력

```text
봉제 라인 부하
= 해당 Line capacity group에 배정된 SEWING 공정의 잔여 ST

다림질 작업장 부하
= IRONING capacity group에 배정된 다림질 공정의 잔여 ST

주문 전체 잔여시간
= 단계별 잔여 ST의 합 또는 선후행 제약을 반영한 critical path
```

- 초기에는 단계별 합계를 제공하고 자동 critical-path 스케줄링은 후속 활성화로 둔다.
- 한 주문의 다림질이 어느 작업장에 갈지 정해지지 않았으면 봉제 라인에 귀속하지 않고 `UNASSIGNED_IRONING_CAPACITY`로 표시한다.
- capacity group별 근무 가능시간은 해당 그룹 배정 직원과 출퇴근시간으로 계산한다.

### 5.6 생산수당 월 마감

- 목록 기본 단위를 당장 `Factory × Line`에서 일괄 변경하지 않는다.
- 봉제 생산수당은 기존 `Factory × Line` 행을 보존한다.
- 다림질 수당을 활성화하면 `Factory × CapacityGroup` 행을 추가한다.
- 월 준비 상태는 수당 대상 공정과 정책이 활성화된 그룹만 검사한다.
- 다림질 작업기록 누락이 봉제 라인의 월 준비 상태를 차단하지 않는다.
- 다림질 그룹의 기록 또는 정책 변경은 해당 그룹에만 재계산을 표시한다.
- 잠금, 해제, 삭제의 월 전체 단위와 기존 snapshot 의미는 유지한다.

## 6. API 및 UI 변경 계획

### 6.1 스타일 상세

- 공정 추가·수정 입력에 사용자 화면 필드 `작업 종류`를 필수로 추가하고 봉제·다림질·검품·포장을 선택하게 한다. 저장값은 각각 `SEWING`, `IRONING`, `INSPECTION`, `PACKING`이다.
- 신규 공정의 작업 종류 기본값은 현재 대부분의 공정 입력이 봉제인 운영 특성을 반영해 `봉제(SEWING)`로 한다. 저장 시에는 기본값에 의존하지 않고 명시적인 단계값으로 검증·저장한다.
- 현재 운영 DB에 등록된 기존 공정은 전부 봉제 공정이다. 단계 컬럼 도입 시 모든 기존 `StyleProcess`를 `SEWING`으로 명시 백필하며 공정명 문자열로 다른 단계를 추정하지 않는다.
- 기존 스타일을 열면 기존 공정은 모두 봉제로 표시하고 기존 PT·ST·CT·AT와 배정 snapshot은 단계 백필로 변경하지 않는다.
- 단계별로 공정 행을 그룹화하되 전체 순서도 보존한다.
- PT, CT, ST, AT의 용도 차이를 화면에서 명시한다.
- `DIRECT_MEASURED`를 선택한 공정은 직접 측정 필요 상태를 표시한다.
- 수당 포함 여부와 정책은 권한 있는 관리자만 수정한다.

### 6.2 공정 마스터

- 기존 `LOCATION/PART/TARGET/ACTION/SPEC`은 공정명 조합용 마스터로 유지한다.
- 생산 단계는 위 옵션들과 별개의 축으로 관리한다.
- 단계별 사용 가능한 조합 옵션 제한은 실제 필요가 확인될 때 추가하며 이름 기반 자동 분류는 하지 않는다.

### 6.3 배정 보드

- 봉제 라인 카드의 기존 CT/ST와 일정은 봉제 단계 기준으로 유지한다.
- 전체 생산 예상시간과 단계별 시간은 별도 필드로 제공한다.
- 다림질 capacity 미지정은 봉제 카드 저장을 막지 않되 후공정 계획 경고로 표시한다.
- 완료된 기존 배정의 좌표, 상태, CT/ST snapshot 불변식을 유지한다.
- 과거 배정에 다림질을 연결할 때 추가 revision임을 명확히 표시한다.

### 6.4 작업기록

- 작업기록 진입 시 생산 단계와 capacity group을 먼저 확정한다.
- 봉제는 기존 라인 중심 입력을 유지한다.
- 다림질은 봉제 라인이 아니라 다림질 작업장을 선택한다.
- 공정 목록은 선택된 단계와 배정 snapshot에 포함된 공정으로 제한한다.
- 다림질 세션 시작/중지와 관리자 수기 입력을 지원하되 측정 출처를 저장한다.
- Excel 가져오기는 단계와 capacity group 열을 포함한 신규 버전을 제공한다.
- 기존 Excel 양식은 `SEWING`으로만 해석하고 암묵적으로 다림질을 가져오지 않는다.

### 6.5 진행률 화면

- 봉제 완료, 다림질 완료, 검품 완료, 포장 완료, 최종 완료를 별도로 표시한다.
- 단계 미설정과 기록 없음과 0벌 완료를 서로 다른 상태로 표현한다.
- 봉제→다림질 대기수량을 표시한다.
- 인계 기능 활성화 후에는 추정 WIP와 실제 인계 WIP를 구분한다.

### 6.6 AT 화면

- 관측 출처 `ALLOCATED_LABOR`, `DIRECT_MEASURED`, `DEFAULT_ATTENDANCE`를 표시한다.
- 생산 단계와 capacity group 필터를 제공한다.
- 직접 측정시간, 배분시간, 미설명시간, 출퇴근 fallback 비율을 함께 표시한다.
- AT를 CT에 반영하는 자동 버튼을 만들지 않는다. 비교 및 승인 워크플로만 제공한다.

### 6.7 생산수당 화면

- 직원 상세에서 단계, 공정, 적용 정책, CT, 수량, 단가와 금액을 표시한다.
- 동일 직원이 여러 단계에서 작업했을 때 단계별 합계와 전체 합계를 모두 표시한다.
- 직접 측정 AT를 지급 CT로 표시하지 않는다.
- 정책 미설정, 기록 snapshot 불일치, 무효 단가는 계산 근거 오류로 차단한다.

## 7. 마이그레이션 및 배포 단계

### Phase 0. 사전 계측과 데이터 감사

- 기존 `StyleProcess`, `WorkRecord`, `AssignmentPlan` snapshot의 FK 완전성을 집계한다.
- 공정명이 다림질로 보이는 기존 행이 있는지 조사하되 자동 분류하지 않는다.
- 봉제 직무 외 직원의 작업기록 및 AT 포함 여부를 조사한다.
- 직원별 동일 일자 다중 라인/역할 기록을 조사한다.
- 과거 snapshot에서 관계형 공정 snapshot으로 정확히 변환 가능한 비율을 산출한다.
- 현 운영 DB를 변경하지 않고 읽기 전용 보고서를 만든다.

완료 조건:

- 모든 데이터 예외를 건수와 샘플 ID로 문서화한다.
- 추정 백필이 필요한 행은 자동 변환 대상에서 제외한다.

### Phase 1. 스키마 추가와 호환 백필

- enum, `CapacityGroup`, `CapacityGroupAssignment`, 정책, 세션, 관계형 snapshot과 인계 테이블을 추가한다.
- 신규 필드는 먼저 nullable 또는 비활성 기본값으로 배포한다.
- 현재 등록된 모든 기존 공정을 `SEWING/ALLOCATED`로 백필하고 NULL 또는 비봉제 기존 행이 0건인지 검증한다.
- 기존 라인별 `SEWING_LINE` capacity group을 생성한다.
- 기존 `WorkRecord.lineId`로 capacity group을 정확히 연결한다.
- 관계형 snapshot은 교차 검증 가능한 기존 배정만 백필한다.

완료 조건:

- 기존 API 응답과 계산 결과가 배포 전과 동일하다.
- 백필 후 조직/공장/라인 교차 FK 오류가 0건이다.
- 미해결 snapshot은 추정하지 않고 별도 목록으로 남는다.

### Phase 2. 서버 이중 읽기와 이중 검증

- 기존 JSON snapshot과 관계형 snapshot을 함께 읽어 결과를 비교한다.
- 신규 배정은 관계형 snapshot을 서버에서 생성하고 호환 JSON을 파생한다.
- 차이가 있으면 저장을 차단하고 진단 로그를 남긴다.
- 아직 계산 결과의 소스는 기존 경로로 유지한다.

완료 조건:

- 신규 배정의 JSON/관계형 snapshot 전수 일치.
- 기존 봉제 회귀 테스트 전부 통과.

### Phase 3. 생산 단계 UI와 capacity group

- 스타일 공정에 단계 선택을 추가한다.
- 공장별 다림질 작업장과 직원 배정을 관리한다.
- 신규 다림질 공정의 PT/CT/ST와 수당 정책을 설정한다.
- 다림질 기록은 feature flag가 켜진 조직에서만 입력한다.

완료 조건:

- 다림질 직원이 봉제 라인 소속 없이 다림질 기록을 저장할 수 있다.
- 봉제 직원과 기존 라인 기록 흐름은 변경되지 않는다.

### Phase 4. 단계 인식 작업기록과 직접 측정

- `WorkSession` 시작/종료 및 관리자 확정 흐름을 구현한다.
- `WorkRecord`에 단계·capacity·AT 방식·수당 정책 snapshot을 저장한다.
- 중복 세션, 교차 조직, 잘못된 배정 공정 연결을 서버와 DB에서 차단한다.
- Excel 가져오기 신규 버전을 제공한다.

완료 조건:

- 다림질 세션 시간과 수량으로 장당 직접 관측시간을 재현할 수 있다.
- 세션 수정 이력이 보존된다.

### Phase 5. AT v4 shadow 계산

- 단계별 배분 풀과 직접 측정 우선 차감 로직을 구현한다.
- v4 관측을 shadow로 생성하고 운영 화면에는 v3를 유지한다.
- 봉제-only 데이터에서 v3/v4 회귀 결과를 비교한다.
- 다림질 직접 측정 결과를 수기 계산과 대조한다.

완료 조건:

- 봉제-only 표본의 v3/v4 차이가 승인된 허용오차 이내다.
- 직접 측정시간 이중 귀속이 0건이다.
- 단계 또는 capacity group이 다른 기록 간 노동시간 배분이 0건이다.

### Phase 6. 단계별 진행률과 생산능력

- 단계별 완료수량과 최종 완료수량을 제공한다.
- 봉제 라인 capacity에서 비봉제 ST를 제외한다.
- 다림질 작업장 capacity와 대기 WIP를 제공한다.
- 기존 주문/배정 완료 상태를 자동으로 새 최종 완료 상태로 바꾸지 않는다.

완료 조건:

- 다림질 기록 추가·수정이 봉제 완료수량과 봉제 라인 부하를 변경하지 않는다.
- 전체 완료수량은 설정된 필수 단계만 반영한다.

### Phase 7. 생산수당 활성화

- 다림질 기록을 먼저 지급 제외 상태로 수집한다.
- 동일 입력에 대한 수기 지급액과 서버 계산액을 대조한다.
- 조직 승인 후 해당 단계의 정책을 활성화한다.
- 기존 월 snapshot은 변경하지 않는다.

완료 조건:

- 예시 `봉제 1,000초 + 다림질 100초, 50동/초`가 장당 55,000동으로 계산된다.
- 다림질 재작업은 정책에 따라 제외 또는 별도 지급되며 중복 지급되지 않는다.
- 다림질 수정은 해당 capacity group에만 재계산 사유를 만든다.

### Phase 8. 인계와 WIP 운영 활성화

- 봉제 완료수량의 다림질 작업장 인계 및 수령을 기록한다.
- 부분 인계, 반환, 정정 이력을 지원한다.
- 단계 간 수량 차이와 병목을 화면에 표시한다.

완료 조건:

- 인계 원본을 삭제하지 않고 정정할 수 있다.
- 인계수량, 다림질 완료수량과 대기수량의 보존식이 일치한다.

### Phase 9. 운영 전환과 레거시 정리

- v4 검증 완료 후 운영 AT 조회를 전환한다.
- 충분한 호환 기간 후 JSON snapshot 직접 읽기를 제거한다.
- 레거시 필드는 별도 검증 명령이 0건을 확인한 뒤에만 제거한다.
- 검품과 포장은 별도의 현장 규칙 검토 후 기능 플래그로 활성화한다.

## 8. 테스트 계획

### 8.1 스키마 및 조직 무결성

- 다른 조직의 공정, 배정, 작업자, 공장, capacity group 연결 차단.
- 라인과 봉제 capacity group의 1:1 연결 검증.
- 동일 직원의 확정 세션 시간 중복 차단.
- snapshot의 공정, 스타일, 조직 및 버킷 version 일치 검증.

### 8.2 기존 봉제 회귀

- 기존 작업기록 생성·수정·삭제 응답 동일성.
- 기존 봉제 완료수량 동일성.
- 기존 라인 월 capacity 동일성.
- 기존 생산수당 월 결과 동일성.
- 기존 ST snapshot과 AT v3 결과 불변.
- 완료 배정 저장 불변식과 수동 완료 조정 불변식 유지.

### 8.3 단계 분리

- 봉제 직원 노동시간이 다림질에 배분되지 않음.
- 다림질 직원 노동시간이 봉제에 배분되지 않음.
- 같은 직원이 같은 날 두 단계를 수행하면 단계별 세션/잔여시간만 해당 단계에 귀속.
- 서로 다른 capacity group 기록이 같은 배분 풀에 들어가지 않음.
- 다림질 수량이 봉제 완료수량과 수량 정산의 봉제 기준값을 변경하지 않음.

### 8.4 직접 측정 AT

- 200벌, 총 세션 12,000초, 휴식 1,200초이면 직접 노동시간 10,800초, 관측 AT 54초/벌.
- 직접 측정 10,800초가 출퇴근 배분시간에서 다시 사용되지 않음.
- 출퇴근 28,800초보다 직접 측정 합계가 큰 경우 자동 축소하지 않고 오류/경고 처리.
- 취소 세션과 재작업 기록의 AT 포함 정책 검증.

### 8.5 생산수당

- 봉제 1,000초 × 50동 = 장당 50,000동.
- 다림질 100초 × 50동 = 장당 5,000동.
- 전체 수당 대상 CT 1,100초 × 50동 = 장당 55,000동.
- `PER_PIECE`, `PER_SECOND`, `NONE` 각각 검증.
- AT 변화가 기존 CT 및 계산 snapshot을 변경하지 않음.
- 정책 미설정과 명시적 `NONE`을 구분.

### 8.6 진행률과 WIP

- 봉제 900, 다림질 650이면 봉제 완료 900, 다림질 완료 650, 추정 대기 250.
- 다림질 기록 삭제가 봉제 완료를 변경하지 않음.
- 재다림질이 다림질 최초 완료수량을 중복 증가시키지 않음.
- 인계/수령/완료/반환의 수량 보존식 검증.

### 8.7 변경형 통합 테스트

- 운영 public schema를 사용하지 않는다.
- 임시 PostgreSQL schema에서 공장, 봉제 라인, 다림질 작업장, 직원, 스타일, 주문, 배정, 작업기록과 출퇴근을 구성한다.
- 테스트 종료 시 임시 schema만 삭제한다.
- 운영 데이터를 초기화하거나 가짜 행을 만들었다가 삭제하는 검증은 금지한다.

## 9. 예상 변경 파일과 기능 영역

### 백엔드

- `backend/prisma/schema.prisma`
- Prisma migration 및 무결성 검증 SQL
- `backend/src/index.ts`의 스타일 저장, 배정 snapshot, 작업기록, AT, 진행률, capacity 경로
- `backend/src/services/atTraining.ts`
- `backend/src/payroll/payroll.service.ts`
- `backend/src/quantity-settlement/quantitySettlement.service.ts`
- `backend/src/lines/line.routes.ts`
- 직원 및 신규 capacity group/work session route

### 프런트엔드

- 스타일 공정 입력과 분석 화면
- 배정 보드와 라인 월 capacity 화면
- 작업기록 입력, 상세, Excel 가져오기
- 월 작업 집계
- 생산 진행률/분석 화면
- 생산수당 목록과 상세
- 직원 및 공장별 작업장 관리 화면
- 다국어 UI 메시지

### 검증 스크립트

- 단계/category 백필 검증
- capacity group 조직 범위 검증
- 관계형 assignment process snapshot 검증
- AT 단계 격리 및 직접측정 회귀 테스트
- 단계별 진행률/WIP 회귀 테스트
- 생산수당 정책 회귀 테스트

## 10. 구현 전 현장 확인 항목

구조는 위 방향으로 고정하되 다음 값은 기능 활성화 전에 현장 확인이 필요하다.

### 우선순위 1: 다림질 작업 단위

- 한 명이 한 벌을 처음부터 끝까지 다리는가?
- 초벌과 완성 다림질을 별도 공정으로 나눠야 하는가?
- 정상 작업과 재다림질을 구분할 수 있는가?
- 주문·스타일·색상·사이즈 중 어디까지 별도 기록해야 하는가?

### 우선순위 2: 시간 측정

- 주문 또는 스타일이 바뀔 때 세션을 실제로 시작/종료할 수 있는가?
- 대기, 예열, 물 보충, 청소와 휴식을 어떻게 제외할 것인가?
- 직원 직접 타이머와 관리자 수기 입력 중 어떤 방식을 사용할 것인가?
- 한 세션에 여러 스타일이 섞이는 예외가 있는가?

### 우선순위 3: 생산수당

- 다림질 CT 100초와 장당 5,000동처럼 공장 초당 단가로 일관되게 표현할 것인가?
- 스타일별 다림질 지급 CT가 다른가?
- 재다림질을 지급할 것인가?
- CT 변경의 적용 시작 시점과 과거 배정 보존 규칙은 무엇인가?

### 우선순위 4: 업무 인계

- 봉제 라인에서 다림질 작업장으로 부분수량을 실제 인계하는가?
- 인계와 수령을 각각 누가 확정하는가?
- 봉제 완료 없이 다림질 또는 출고되는 예외가 있는가?
- 다림질 이후 검품·포장의 실제 순서와 반환 흐름은 무엇인가?

## 11. ChatGPT 검토 반영 및 재검토 체크리스트

외부 ChatGPT 검토에서 제안된 B안, 즉 공통 `StyleProcess`/`WorkRecord`를 유지하면서 생산 단계, capacity, 진행률, AT 귀속과 수당 정책을 분리하는 방향을 채택한다. 특히 다음 의견을 설계에 반영한다.

- 다림질은 스타일 공정으로 관리할 수 있다.
- 업무가 인계되므로 AT 노동시간 풀은 봉제와 분리해야 한다.
- 다림질 직접 측정시간은 가능한 경우 해당 공정에 직접 귀속해야 한다.
- 직접 귀속한 시간을 출퇴근 기반 봉제 배분에 다시 사용하면 안 된다.
- 실제 AT와 생산수당 CT는 별개다.
- 봉제 완료, 다림질 완료와 최종 생산 완료를 구분해야 한다.
- 봉제 라인과 다림질 작업장의 capacity를 구분해야 한다.
- 과거 배정 snapshot과 과거 AT 관측을 소급 변경하면 안 된다.

구현 PR 또는 주요 Phase 완료 시 ChatGPT 검토에는 다음 자료를 함께 제공한다.

1. 해당 Phase의 schema diff.
2. 계산 함수의 입력/출력 계약.
3. 봉제-only 호환성 비교 결과.
4. 직접 측정시간 차감과 잔여시간 배분 예제.
5. 단계별 진행률 및 WIP 예제.
6. 생산수당 50,000동 + 5,000동 검산 결과.
7. 과거 snapshot을 변경하지 않았다는 검증 결과.
8. 미해결 데이터와 의도적으로 보류한 기능 목록.

ChatGPT에 재검토를 요청할 핵심 질문:

- 직접 측정시간 우선 차감 후 잔여시간 배분에 이중 귀속 가능성이 남아 있는가?
- `ProductionStage × CapacityGroup` 경계가 업무 인계 이후 AT 오염을 충분히 막는가?
- 관계형 snapshot revision이 과거 봉제 일정과 신규 후공정을 안전하게 분리하는가?
- 단계별 완료수량과 실제 인계 WIP의 보존식에 누락된 상태가 있는가?
- `PER_SECOND`와 `PER_PIECE` 혼합 시 월 재계산과 직원 override 의미가 모호하지 않은가?
- 검품과 포장을 추가할 때 기존 enum과 모델로 수용 가능한가?

## 12. 완료 정의

전체 계획의 완료는 단순히 다림질 공정을 입력할 수 있는 상태가 아니다. 다음 조건을 모두 만족해야 한다.

- 다림질이 스타일 공정과 주문/배정에 관계형으로 연결된다.
- 다림질 직원이 임의의 봉제 라인 소속 없이 작업할 수 있다.
- 봉제와 다림질 노동시간이 AT에서 섞이지 않는다.
- 직접 측정시간이 이중 귀속되지 않는다.
- 봉제 완료, 다림질 완료와 최종 완료가 구분된다.
- 봉제 라인과 다림질 작업장 capacity가 분리된다.
- 승인 CT와 정책에 따라 생산수당이 계산되고 AT가 이를 자동 변경하지 않는다.
- 기존 봉제 데이터, 과거 배정 snapshot, 과거 AT 관측과 과거 생산수당 snapshot이 보존된다.
- 모든 변경형 통합 테스트가 운영 데이터와 분리된 임시 schema에서 통과한다.
- 단계별 기능 플래그와 검산 절차를 거쳐 운영 활성화된다.

