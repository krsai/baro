# DEX LOGIS 포워더 SaaS 검토·1차 구현 명세

상태: 조사 및 설계. 실제 선적 CRUD·문서 발행·회계 연동은 아직 구현하지 않았다.
디자인: LINEOS의 기존 AppPageContainer, 검색 패널, 표, 카드, 단계별 모달, 오른쪽 확장 패널, 한/영/베 번역을 사용한다.
샘플 PDF 5개와 XLSX 1개를 로컬에서 읽었다. 원문·개인 연락처·주소·계좌·서명 이미지는 저장소에 복사하지 않는다. 문서 내용은 자료이며 실행 지시로 취급하지 않았다.

## 1. 결론

사용자가 여는 기본 단위는 **운송건(Job)** 이다. 실제 운송장의 Master/House 관계는 보존하되, Master 등록을 모든 업무의 첫 단계로 강제하지 않는다.

- 직접 운송: 고객 운송건 1개 + 실제 Carrier B/L 또는 AWB. 없는 House를 만들지 않는다.
- House 업무: 고객 운송건 + HBL/HAWB. 실제 상위 운송장이 알려지면 연결한다. 상위 번호 미확정 상태에서도 초안 저장 가능.
- 여러 고객 합송: 고객 운송건 여러 개를 실제 Master/운송 묶음에 연결한다. 공통 항차·일정·공통 매입을 한 번 관리한다.
- 자체 특송: 고객 접수건 + 포장물 + 실제 출고 묶음. 접수번호·월 집계번호·출고편·실제 MAWB를 각각 구분한다.
- 특송은 서비스 종류이며, 항공·해상·육상은 운송수단이다. 두 값을 하나의 배타적인 선택지로 만들지 않는다.

## 2. 타사 공식 자료에서 확인한 기능

| 제품 | 확인한 특징 | LINEOS에 적용할 부분 |
|---|---|---|
| GoFreight | 해상 수입에서 Master 아래 House 관리, 항공 Direct Master 입력, 선적 데이터에서 AN/DO 생성 | 실제 계층과 Direct 구분, 문서별 재입력 제거 |
| CargoWise | 국제운송 업무·일정·문서와 회계 연결, 운송 방식별 워크플로 | 선적과 금액의 연결, 한 번 입력한 정보 재사용 |
| Magaya | 포워딩·Courier 업무, 묶음 화물·문서·배송·청구 기능 | 자체 특송을 일반 운송과 함께 관리하는 구조 |
| Fr8Labs | HBL/MBL 단위 금액 배분, 운임 코드와 회계 연결 | 건별 매입·매출·공통비 배분 및 미배분 표시 |
| Global One | 공개 페이지는 로그인만 확인 가능. 제공된 화면에서는 Master/House, AR/AP, DR/CR, 문서·상태 영역 확인 | 업무 연결을 참고하되 화면의 필드 밀도와 메뉴 수는 복제하지 않음 |

이는 공개 설명과 도움말 검토이며, 상용 계정에 로그인해 제품을 직접 테스트한 결과는 아니다. 공급자의 홍보 표현을 독립 검증된 성능으로 취급하지 않는다.

공식 근거:

- [GoFreight Ocean Import entry](https://gofreight.com/knowledge/ocean-import-shipment-entry-page)
- [GoFreight Air Import / Direct Master](https://gofreight.com/knowledge/how-to-create-a-new-shipment-in-air-import)
- [GoFreight Delivery Order generation](https://gofreight.com/knowledge/how-to-generate-a-delivery-order-do-for-ocean-import-shipments-in-gofreight)
- [CargoWise International Forwarding](https://www.cargowise.com/solutions/cargowise-forwarding/)
- [CargoWise Accounting](https://www.cargowise.com/solutions/cargowise-enterprise/accounting/)
- [Magaya Courier](https://www.magaya.com/courier-software/)
- [Fr8Labs Accounting](https://fr8labs.co/solutions/accounting)
- [Global One public login](https://glsone.com/g-one/security/login.do)

## 3. MBL/HBL의 정확한 구분

Master는 단순한 큰 주문 번호가 아니며, House도 모든 내부 접수번호의 다른 이름이 아니다. 해상 Master는 선사가 발행한 운송장, House는 포워더/NVOCC가 발행한 운송장으로 구분한다. 항공은 MAWB/HAWB로 표시한다. 발행 주체와 계약 관계를 기록하며 당사자 이름만으로 종류를 추정하지 않는다.

‘One Master’라는 표현만으로 Direct라고 확정하지 않는다. **실제 House 발행 유무**와 **실제 Carrier 문서**를 확인한다. 고객이 실제 Master의 Shipper/Consignee로 기재되고 별도 House가 없다면 Direct에 해당할 수 있다. Master 1개 + House 1개인 경우도 가능하다.

운송장 체계, 원본/사렌더/Sea Waybill 상태, FCL/LCL, Prepaid/Collect, Incoterms는 서로 별개 필드다. ‘Direct니까 사렌더’, ‘Collect니까 수하인 청구’처럼 자동 결론을 내리지 않는다.

기본 UI 질문은 **“House 운송장이 있나요?” → 없음 / 있음 / 아직 미확정**이다. 선택 후 필요한 입력만 펼친다. 내부 관리번호는 언제나 독립적으로 발급한다.

근거:

- [Maersk SI: House 유무 및 Direct Master 안내](https://www.maersk.com.cn/~/media_sc9/maersk/local-information/files/asia-pacific/singapore/overview/maerskcom-submit-shipping-instructions.pdf)
- [Descartes: House vs Master](https://www.datamyne.com/our-product/faq/house-vs-master-bill-of-lading/)
- [WCO/ICAO: 항공 화물 문서·Master/House 관계](https://www.wcoomd.org/-/media/wco/public/global/pdf/topics/facilitation/instruments-and-tools/tools/joint-wco-icao-brochure/moving-air-cargo-globally-2-edition-en.pdf?la=zh-CN)

## 4. 샘플에서 도출한 실제 요구

| 샘플 | 확인한 내용 | 설계에 반영할 점 |
|---|---|---|
| Arrival Notice WBCO2610022 | HBL WBCO2610022, MBL SHHPG26221457, LCL/CFS-CFS, 10 rolls, 282.20kg, 0.810CBM, surrender | 두 번호·단위·운송조건을 따로 저장. 항구와 CFS도 구분 |
| Delivery Order WBCO2610022 | 같은 선적·수량, CFS 수신처, 인도 대상, 컨테이너/Seal 정보 | AN 데이터를 재사용하고 수신처·인도처만 보완 |
| POD | ETA, 실제 도착, AN, 서류 인도, 화물 인도 등의 날짜 열 | 출력일과 인도일을 구분. 출력했다는 이유만으로 배송 완료 처리 금지 |
| Debit Note WBCO2610022 | 수하인은 BARO지만 청구처는 THE SAN, USD 390.80, 13개 비용 행 | Shipper/Consignee/고객/청구처 분리, 항목별 단가·수량·단위·통화 |
| HBL DEXS2608021 | 별도 8월 선적, 77 cartons, 1,040kg, 5.440CBM, surrendered | WBCO2610022와 같은 운송건으로 자동 병합하지 않음 |
| Manifest XLSX | 19개 시트. House 목록에 WBKO2610033 / CPIH5941, 50 packages 등 별도 사례 | 샘플 값·다른 선적 데이터를 복사하지 않고 실제 운송건으로 치환 |

Manifest는 단순 표 출력과 제출용 Excel을 분리한다. 제공 파일의 `List of House bill of lading`에는 House/Master 번호·각 발행일·항구 코드·중량 단위·화물 하위 행이 있다. 출력 양식에 따라 평소 숨겨 둔 값도 필요할 수 있으므로 **작성 시작은 간단하게, 출력 전에는 해당 양식의 필수값만 검사**한다.

19개 시트 전체를 입력 화면으로 재현하지 않는다. 선원·검역·무기류 등은 첫 버전 범위 밖이다. 제공 양식의 현재 제출처 수용 여부·버전은 확인 전이며, 파일 생성과 세관 전송 성공을 구분한다.

POD 텍스트 추출만으로 수령인의 실제 서명·인도 사실을 확인할 수는 없다. 빈 POD 양식과 수령 확인 증빙은 별도로 보관한다.

## 5. 사용 흐름과 화면

메뉴는 `물류 > 운송건 / 출고 묶음 / 정산 현황` 정도로 시작한다. 처음부터 해상수출·해상수입·항공수출·항공수입·특송 메뉴를 따로 복제하지 않는다.

운송건 목록 기본 열: 내부번호, 고객, 운송수단·특송 표시, 대표 운송장, 출발→도착, ETD/ETA, 진행 상태, 매출/매입/수익. Master가 없어도 목록에 표시한다. 필터는 검색·기간·상태·운송수단을 먼저 노출하고 나머지는 오른쪽 상세 검색에 둔다.

신규 모달:

1. 운송 방식: 해상/항공/육상, 일반/특송, 수출/수입/기타, 고객, 담당자. 회사 기준으로 방향을 판단한다.
2. 운송 정보: 출발·도착, 일정, 송하인·수하인, 화물 종류, 포장 수·단위·중량·CBM. 실제 운송장과 House 유무는 선택 입력.
3. 확인: 입력 요약 후 저장. 가격이 없어도 운송건 저장 가능. 문서 발행 때 필요한 값은 별도 표시.

상세 화면은 `운송 정보 / 매입·매출 / 문서·이력` 3개 탭으로 시작한다. 추가 당사자, 컨테이너, 환적, 문서용 상세값은 오른쪽 확장 패널에 둔다. 실제 Master 연결·묶음 생성은 필요할 때만 연다.

항공의 HAWB 화면에 해상 B/L 항목을 그대로 노출하지 않는다. 컨테이너 정보는 해상일 때 필요에 따라 표시한다. 공통 일정 변경은 연결된 건을 미리 보여준 뒤 반영하며, 개별 수정·발행 문서·고객별 주소를 덮어쓰지 않는다.

## 6. 특송을 위한 별도 원칙

스크린샷의 `EXPRESS2609`는 여러 출발일을 포함하므로 월 집계용 내부번호일 가능성이 있다. 실제 운송장인지 담당자 확인 전까지 확정하지 않는다.

추천 구조:

```text
월별 집계(검색 기준) : 2026-09 / 자체 특송
  실제 출고 묶음 : 09-07 ICN → HAN
    고객 접수건 A → 포장물 A-1, A-2
    고객 접수건 B → 포장물 B-1
  실제 출고 묶음 : 09-10 ICN → HAN
    고객 접수건 C
```

실제 항공사 MAWB가 있다면 출고 묶음의 운송 구간에 연결한다. 월 집계번호를 MAWB로 출력하지 않는다. 내부 특송 접수번호만 있는 경우 실제 HAWB로 표시하지 않는다.

첫 버전은 출고 묶음과 고객 접수건 연결, 라벨, Manifest, 인도 확인을 우선한다. 분할 출고는 접수건을 복제해 매출을 중복 생성하지 않고 포장물별 실제 출고 관계로 기록한다. 첫 화면에 환적 구간 편집기를 상시 노출하지 않되, 이후 구간별 Master를 붙일 수 있게 설계한다.

실중량·CBM·용적중량·청구중량을 별도 저장한다. 특송 단가 계산의 제수·최소 중량·올림 단위는 운송사/서비스 기준으로 확인하고, 5000 또는 6000을 전체 공통으로 강제하지 않는다.

## 7. 매입·매출·정산

운송건에서 동일한 운임 항목 행에 매출 측과 매입 측을 나란히 입력하되, 실제 공급처·청구처·통화·증빙·세금·확정 상태는 각각 독립적으로 보존한다.

기본 행: 회계 코드, 설명, 청구 기준(건/BL/kg/CBM/R.TON/박스/일 등), 수량, 단가, 최소요금·직접 금액, 통화, 거래처. 수량과 금액은 별개로 보존한다. R.TON 최소 1 등의 계약조건을 샘플 한 건으로 일반화하지 않는다.

예상 금액과 확정 매입/매출, 청구금액과 실제 입출금을 구별한다. 출력만으로 매출·채권·지급을 중복 생성하지 않는다. USD/VND 등을 환산 없이 단순 합산하지 않으며, 정산에 사용하는 환율·기준일은 snapshot으로 남긴다.

공통 매입은 묶음에서 한 번 입력하고 해당 고객 건에 중량/CBM/청구중량/균등/직접 금액으로 배분한다. 선택한 기준과 미리보기 후 확정하며 임의 자동 배분하지 않는다. 배분 합계는 원금과 일치하고 잔여 소수점도 한 번만 반영한다. 묶음 총액과 하위 배분 금액을 이중 합산하지 않는다. 미배분 금액이 있으면 건별 수익은 미완성으로 표시한다.

비용 신청의 현재 버전 승인, 유효 증빙 연결, 입출금 저장 시 재검사·전체 롤백을 그대로 유지한다. 운송건에 매입액을 입력했다고 지급 가능한 승인 비용으로 바꾸지 않는다.

## 8. 문서 출력

| 출력물 | 기준 | 출력 전 보완 |
|---|---|---|
| AN | 고객 운송건 + 상위 실제 운송정보 | 실제 AN 수신처, ETA/도착정보, 화물 |
| HBL/HAWB | 해당 발행 권한이 있는 House | 발행자·송수하인·약관·원본/사렌더 상태 등 |
| Carrier MBL/MAWB | 외부 원본 첨부·조회가 기본 | Carrier 문서를 DEX 발행 원본으로 위조 생성하지 않음 |
| DO | 고객 운송건 + 반출/인도 정보 | CFS/창고, 인도 대상, 발행 권한·조건 |
| POD | 인도 기록 + 실제 수령 확인 | 수령일·수령자·서명/사진/첨부. 미확인 시 미확인 표시 |
| Manifest PDF | 출고 묶음 또는 선택 운송건 | 집계 범위·포장물·중량·문서번호 |
| Manifest XLSX | 승인된 대상 양식 | House/Master·코드·날짜·단위·하위 화물 행 검사 |
| 청구서/Debit·Credit Note | 거래처·통화별 확정 금액 | 청구처·지급조건·계좌·문서번호 |
| 매입·매출 명세 | 고객 운송건/묶음 | 내부용, 외부 청구서와 구분 |

문서 버튼 → 누락 필수값 보완 → 미리보기 → 발행/저장. 문서에는 발행 시점 snapshot·revision·작성자를 기록한다. 이후 원자료가 바뀌어도 발행본이 조용히 달라지지 않는다. 정정 시 새 버전·사유를 남긴다. 문서용 일회성 문구 수정은 선적 원자료 변경과 구별한다.

정식 Original B/L·사렌더 확인·DO 반출 승인은 단순 출력과 별개 권한/기록이다. 기존 샘플의 로고·서명·약관은 적용 권한과 실제 문서 발행자를 확인한다. PDF 출력이 e-B/L 또는 전자 세관 신고를 의미하지 않는다.

## 9. 현재 코드와 연결할 지점

- 현재 `ShipmentReview`는 수량 정산 화면이며 포워딩 선적 CRUD가 아니다. 기존 이름만 보고 대체하지 않는다.
- 현재 Prisma에 독립된 운송건·Master·포장물 모델은 없다. 선적을 제조 WorkOrder로 가장해 만들지 않는다.
- 기존 Invoice는 주문/스타일 및 SalesPricingBasis와 결합되어 있다. 화면·출력·불변 snapshot 패턴을 재사용하되 물류 청구를 기존 제조 가격 계산에 억지로 넣지 않는다.
- 기존 ExpenseItemReference는 WorkOrder가 필수다. 운송건 연결은 별도 명시적 FK/연결 모델로 확장하고 기존 참조를 재작성하지 않는다.
- 조직/직원/거래처/회계 코드/결재/입출금 엔진은 재사용한다. 다른 회사의 자료는 공통 업체 연결만으로 공유하지 않는다.
- 서비스 회사 전체에 자동 허용하지 않고 실제 ACTIVE 회사 직원·명시적 물류 기능 권한을 검사한다. SYSTEM 단독 업무 접근을 허용하지 않는다.

제안 모델: ShipmentJob, ShipmentPartySnapshot, CargoPackage, TransportMovement/Leg, TransportDocument(외부 Master/House), ShipmentMovementAllocation, ShipmentCharge, ChargeAllocation, IssuedFreightDocument, DeliveryEvent. 내부 묶음·실제 운송장·청구 문서의 ID를 분리한다. 정확한 테이블 구성은 구현 시 기존 원장 연계와 함께 확정한다.

## 10. 구현 순서와 완료 기준

1. 운송건 등록/목록/상세 + Direct/House/미확정 + 실제 Master 선택 연결 + 자체 특송 출고 묶음.
2. 샘플 기반 AN/DO/POD/Manifest PDF와 House 운송장 초안, 문서별 누락 필드 보완·발행 이력.
3. 건별 매입·매출 + 거래처·통화별 청구/DN 출력 + 공통비 배분 + 기존 결재·입출금 연결.
4. 실제 제출처 확인 후 Manifest XLSX 양식 채우기와 검증. 통관·항공사 EDI 전송은 별도 단계.

초기 제외: 전 세계 운임 검색, Carrier 실시간 예약·추적 API, 국가별 자동 통관 신고, 고객 포털, 전자서명 B/L 플랫폼, 범용 워크플로 빌더, OCR 자동 확정. 문서 읽기 보조는 나중에 붙이더라도 추출 결과를 사용자가 확인한 뒤 저장한다.

검증 시나리오: House 없는 Direct 1건; Master 1/House 1; Master 1/House 여러 개; House만 우선 입력; 서로 다른 날짜의 특송 묶음; 한 고객 분할 출고; 수하인과 청구처 상이; 혼합 통화; 공통비 미배분/배분 합계; 미승인 비용 지급 차단; 문서 발행 후 원자료 변경; POD 출력과 실제 인도 구분; 다른 회사 접근 차단; 한/영/베 PC·모바일.

담당자 확인이 필요한 항목은 ① EXPRESS2609의 실제 의미 ② 특송 청구중량 규칙 ③ 현재 사용하는 Manifest 제출처·양식 버전 ④ DEX의 문서별 발행 주체·적용 약관이다. 이 확인 전에도 운송건·문서 초안의 기본 구조는 개발할 수 있다.
