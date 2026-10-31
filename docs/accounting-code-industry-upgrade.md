# 세부 업종과 회계 코드 연결 전환

기준은 `거래처 구분 → 세부 업종 ↔ 회계 코드`다. 한 코드가 여러 업종에 연결될 수 있고 한 업종에 여러 코드가 들어갈 수 있다. 업체의 업종은 코드 선택·저장 제한으로 사용하지 않는다. 대납을 이유로 업체 업종이나 코드 연결을 자동 확대하지 않는다.

## 데이터 처리

- `AccountingCodeIndustry(baseId, systemIndustryId)`에 실제 source FK를 저장한다. 기존 `TransactionCodeBase.serviceTypeId` 중 GENERAL이 아닌 명시적 연결만 초기 복사한다. 이름, 업체 유형, 코드 문자열로 관계를 추측하지 않는다.
- `industryRevision`으로 오래된 화면의 덮어쓰기를 거부하고 선택 업종도 잠금 후 검증한다.
- 원래 코드 ID, 회사 코드, V/Z/E variant, 생산·정산용 serviceTypeId, 입력 방식, 회사별 입력 정책, 비용 금액과 문서 snapshot은 재작성하지 않는다. 기존 사용 코드의 입력 방식은 변경할 수 없다.
- 연결 변경은 현재 기준정보를 바꾼다. 기존 비용 내역의 업종은 원래 저장된 FK로 표시한다. 새 사후 검토 기능이 기존 신청서를 재판정하지 않도록 적용 시점/생성 당시 기준 보존은 후속 검토 기능에서 지켜야 한다.

## 삭제한 레거시

- 회계 유형 편집 화면과 유형 정렬 기능, 목록의 독립 유형 열.
- 미사용 `CodeBaseSettings.jsx`, `CatalogueOrderButtons.jsx`, 유형 정렬 helper/설정.
- 호출처가 없고 이전 NOT NULL/type backfill을 다시 적용할 위험이 있는 단독 `migrate-expense-code-separation.js`. 원래 migration 파일은 보존한다.
- 폐지된 유형 편집/정렬 API는 인증·권한을 확인한 다음 410으로 종료한다. 과거 화면 주소는 새 관리 화면으로 연결한다.

## 보존한 레거시와 근거

`ExpenseType`, `TransactionCodeBase.expenseTypeId`, `SettingServiceDefault.expenseTypeId`, `Organization.partnerExpenseTypeId`는 호환 조회와 기존 코드의 활성/폐지 상태에 실제로 연결돼 있다. 새 코드에는 유형을 지정하지 않고 기존 FK를 새 유형으로 변환하지 않는다. 기존 참조의 편집은 막는다. 유형이 없는 새 코드도 비용·입출금 SQL guard를 통과하도록 새 migration에서 nullable 관계를 처리한다. 이전 비활성/OTHER 코드가 다시 사용 가능해지지는 않는다.

실제 참조와 운영 자료를 확인하지 못한 상태에서 테이블/열/과거 자료를 물리 삭제하지 않는다. 읽기 전용 현황 도구는 `node backend/scripts/audit-accounting-industry-links.js`이며 자동 삭제 기능이 없다. 현재 환경에서는 연결하지 못해 운영 데이터의 건수·정합성이나 배포 후 상태를 확인했다고 간주할 수 없다.

## 검증 범위

`npm run test:accounting-code-industries`는 실제 PostgreSQL 호환 SQL 검사, 코드/variant/FK·금액 보존, 새 코드 회사별 배포, 비용/입출금 검증, 권한과 과거 승인·정산, 오래된 화면의 저장 거부 및 한·영·베 관리/비용 목록 브라우저 검사를 포함한다. 운영 DB migration은 직접 실행하지 않으며 PNG도 생성하지 않는다.
