import { getCurrentLanguageCode, normalizeLanguageCode } from '../utils/appLanguage';

export const UI_MESSAGES = {
  common: {
    search: { ko: '\uac80\uc0c9...', en: 'Search...', vi: 'Tim kiem...' },
    save: { ko: '저장', en: 'Save', vi: 'Luu' },
    cancel: { ko: '취소', en: 'Cancel', vi: 'Huy' },
    close: { ko: '닫기', en: 'Close', vi: 'Dong' },
    delete: { ko: '삭제', en: 'Delete', vi: 'Xoa' },
    undo: { ko: '되돌리기', en: 'Undo', vi: 'Hoan tac' },
    redo: { ko: '다시하기', en: 'Redo', vi: 'Lam lai' },
    reset: { ko: '초기화', en: 'Reset', vi: 'Dat lai' },
    new: { ko: '신규', en: 'New', vi: 'Moi' },
    dueDate: { ko: '납기 {date}', en: 'Due {date}', vi: 'Han giao {date}' },
    dueDateUndecided: { ko: '납기 미정', en: 'Due TBD', vi: 'Chua co han giao' },
    itemCountSuffix: { ko: '{count}개', en: '{count} items', vi: '{count} muc' },
    previousMonthFirstDay: {
      ko: '이전 달 1일',
      en: 'First day of previous month',
      vi: 'Ngay dau thang truoc',
    },
    nextMonthLastDay: {
      ko: '다음 달 말일',
      en: 'Last day of next month',
      vi: 'Ngay cuoi thang sau',
    },
  },
  menu: {
    sales: { ko: '영업 관리', en: 'Sales', vi: 'Kinh doanh' },
    order: { ko: '주문', en: 'Orders', vi: 'Don hang' },
    style: { ko: '스타일', en: 'Styles', vi: 'Style' },
    production: { ko: '생산 관리', en: 'Production', vi: 'San xuat' },
    assignment: { ko: '배정', en: 'Assign', vi: 'Phan cong' },
    productionPlan: { ko: '작업 계획 현황', en: 'Production Plan', vi: 'Ke hoach san xuat' },
    standardReview: { ko: '표준 공임 검토', en: 'Standard Review', vi: 'Xem xet cong chuan' },
    workHistory: { ko: '작업 기록', en: 'Work Logs', vi: 'Nhat ky cong viec' },
    shipmentReview: { ko: '수량 정산', en: 'Quantity Settlement', vi: 'Doi chieu so luong' },
    attendance: { ko: '출퇴근', en: 'Attendance', vi: 'Cham cong' },
    inventory: { ko: '재고 관리', en: 'Inventory', vi: 'Ton kho' },
    inventoryIssue: { ko: '재고 불출', en: 'Inventory Issue', vi: 'Xuat kho' },
    accounting: { ko: '회계 관리', en: 'Accounting', vi: 'Ke toan' },
    payroll: { ko: '급여 계산', en: 'Payroll', vi: 'Tinh luong' },
    productionResult: { ko: '생산 결과', en: 'Production Result', vi: 'Ket qua san xuat' },
    organization: { ko: '조직 관리', en: 'Organization', vi: 'To chuc' },
    business: { ko: '사업체 관리', en: 'Business', vi: 'Doanh nghiep' },
    line: { ko: '라인 관리', en: 'Lines', vi: 'Chuyen may' },
    employee: { ko: '직원 관리', en: 'Employees', vi: 'Nhan vien' },
    customer: { ko: '고객', en: 'Customer', vi: 'Khach hang' },
    misc: { ko: '기타 관리', en: 'Miscellaneous', vi: 'Quan ly khac' },
    holiday: { ko: '휴일 관리', en: 'Holidays', vi: 'Ngay nghi' },
    profile: { ko: '개인 정보', en: 'Profile', vi: 'Ho so ca nhan' },
    subscription: { ko: '구독 관리', en: 'Subscription', vi: 'Goi dich vu' },
    system: { ko: '시스템 설정', en: 'System', vi: 'He thong' },
    accessPolicy: { ko: '접근 권한', en: 'Access Policy', vi: 'Chinh sach truy cap' },
    attribute: { ko: '속성 관리', en: 'Attributes', vi: 'Thuoc tinh' },
    attributeColors: { ko: '색상 관리', en: 'Color Management', vi: 'Quan ly mau' },
    attributeCategories: {
      ko: '카테고리 관리',
      en: 'Category Management',
      vi: 'Quan ly danh muc',
    },
    attributeProcesses: { ko: '공정 관리', en: 'Process Management', vi: 'Quan ly cong doan' },
    staticOptions: { ko: '정적 사전', en: 'Static Dictionary', vi: 'Tu dien tinh' },
    onboardingApproval: { ko: '가입 승인', en: 'Onboarding Approval', vi: 'Duyet dang ky' },
    logout: { ko: '로그아웃', en: 'Logout', vi: 'Dang xuat' },
  },
  workHistoryView: {
    daily: { ko: '일간', en: 'Daily', vi: 'Ngay' },
    monthly: { ko: '월간', en: 'Monthly', vi: 'Thang' },
  },
  orderDetail: {
    newTitle: { ko: '신규 주문 등록', en: 'New Order', vi: 'Tao don hang moi' },
    editTitle: { ko: '주문 정보 수정', en: 'Edit Order', vi: 'Sua thong tin don hang' },
    lockLabel: { ko: '주문 수정 잠금', en: 'Order Edit Lock', vi: 'Khoa sua don hang' },
    lockSwitchAria: {
      ko: '주문 수정 잠금 스위치',
      en: 'Order edit lock switch',
      vi: 'Cong tac khoa sua don hang',
    },
    lockedShort: { ko: '잠금됨', en: 'Locked', vi: 'Da khoa' },
    unlockedShort: { ko: '수정 가능', en: 'Editable', vi: 'Co the sua' },
    clearDraft: { ko: '임시 저장 삭제', en: 'Clear Draft', vi: 'Xoa ban nhap tam' },
    noPartners: {
      ko: '연결된 주문 파트너가 없습니다. 고객 관계를 먼저 등록해 주세요.',
      en: 'No linked order partners. Register the customer relationship first.',
      vi: 'Chua co doi tac don hang lien ket. Hay dang ky quan he khach hang truoc.',
    },
    lockHelperNew: {
      ko: '주문을 저장한 뒤 잠금 스위치를 사용할 수 있습니다.',
      en: 'Save the order before using the lock switch.',
      vi: 'Hay luu don hang truoc khi dung cong tac khoa.',
    },
    lockHelperConfirmed: {
      ko: '주문이 확정되어 자동 잠금 상태입니다.',
      en: 'This order is auto-locked because it is confirmed.',
      vi: 'Don hang nay dang duoc khoa tu dong vi da xac nhan.',
    },
    lockHelperAssignment: {
      ko: '배정 계약 데이터가 있어 자동 잠금 상태입니다.',
      en: 'This order is auto-locked because assignment contract data exists.',
      vi: 'Don hang nay dang duoc khoa tu dong vi da co du lieu hop dong phan cong.',
    },
    lockHelperManual: {
      ko: '수동 잠금 상태입니다. {meta}',
      en: 'Manual lock is enabled. {meta}',
      vi: 'Dang khoa thu cong. {meta}',
    },
    lockHelperManualSimple: {
      ko: '수동 잠금 상태입니다.',
      en: 'Manual lock is enabled.',
      vi: 'Dang khoa thu cong.',
    },
    lockHelperUnsaved: {
      ko: '미저장 변경사항이 있으면 잠글 수 없습니다. 먼저 저장해 주세요.',
      en: 'You cannot lock the order while there are unsaved changes. Save first.',
      vi: 'Khong the khoa khi van con thay doi chua luu. Hay luu truoc.',
    },
    lockHelperDefault: {
      ko: '필요할 때 주문 수정 잠금을 켜서 기본 정보를 고정할 수 있습니다.',
      en: 'Turn on the edit lock when you want to freeze the basic order information.',
      vi: 'Ban co the bat khoa sua khi muon co dinh thong tin co ban cua don hang.',
    },
    lockAlertConfirmed: {
      ko: '이 주문은 확정되어 기본 정보가 자동으로 잠겨 있습니다.',
      en: 'This order is confirmed, so the basic information is automatically locked.',
      vi: 'Don hang nay da duoc xac nhan nen thong tin co ban bi khoa tu dong.',
    },
    lockAlertAssignment: {
      ko: '이 주문은 배정 계약 데이터가 있어 자동으로 잠겨 있습니다.',
      en: 'This order is automatically locked because assignment contract data exists.',
      vi: 'Don hang nay bi khoa tu dong vi da co du lieu hop dong phan cong.',
    },
    lockAlertManual: {
      ko: '이 주문은 수동 잠금 상태입니다. 상단 스위치로 잠금을 해제하면 다시 수정할 수 있습니다.',
      en: 'This order is manually locked. Turn off the switch above to edit it again.',
      vi: 'Don hang nay dang duoc khoa thu cong. Tat cong tac ben tren de sua lai.',
    },
    modificationLocked: {
      ko: '잠긴 주문은 수정하거나 삭제할 수 없습니다.',
      en: 'Locked orders cannot be edited or deleted.',
      vi: 'Don hang da khoa khong the sua hoac xoa.',
    },
  },
  staticOptionBoard: {
    title: { ko: '정적 사전', en: 'Static Dictionary', vi: 'Tu dien tinh' },
    description: {
      ko: '앱에 하드코딩된 정적 코드 사전을 읽기 전용으로 보여줍니다. 누락된 라벨이나 alias를 검토할 때 기준표로 사용하세요.',
      en: 'This read-only board shows the static code dictionaries bundled in the app so you can review missing labels or aliases.',
      vi: 'Bang chi doc nay hien thi cac tu dien ma tinh trong ung dung de kiem tra nhan hoac alias bi thieu.',
    },
    groupCount: { ko: '그룹 {count}', en: 'Groups {count}', vi: 'Nhom {count}' },
    itemCount: { ko: '항목 {count}', en: 'Items {count}', vi: 'Muc {count}' },
    goToSystemSetting: {
      ko: '구독 관리로 이동',
      en: 'Go to Subscription',
      vi: 'Den quan ly goi dich vu',
    },
    itemCountChip: { ko: '{count}개', en: '{count} items', vi: '{count} muc' },
    columnCode: { ko: 'Code', en: 'Code', vi: 'Code' },
    columnKo: { ko: '한국어', en: 'Korean', vi: 'Tieng Han' },
    columnEn: { ko: 'English', en: 'English', vi: 'English' },
    columnVi: { ko: 'Tiếng Việt', en: 'Vietnamese', vi: 'Tieng Viet' },
    columnAliases: { ko: 'Aliases', en: 'Aliases', vi: 'Aliases' },
    groupKey: { ko: 'key: {key}', en: 'key: {key}', vi: 'key: {key}' },
  },
  assign: {
    pageTitle: { ko: '작업 배정', en: 'Assignment', vi: 'Phan cong' },
    searchPlaceholder: {
      ko: '스타일/고객사/색상 검색',
      en: 'Search styles/customers/colors',
      vi: 'Tim style/khach hang/mau',
    },
    unassignedCards: { ko: '미배정 작업', en: 'Unassigned Work', vi: 'Cong viec chua phan cong' },
    cardsSyncing: { ko: '카드 동기화 중...', en: 'Syncing cards...', vi: 'Dang dong bo the...' },
    cardSummary: {
      ko: '{cardCount}개 · {orderCount}주문',
      en: '{cardCount} cards · {orderCount} orders',
      vi: '{cardCount} the · {orderCount} don',
    },
    orderWithNumber: {
      ko: '주문 {orderNo}',
      en: 'Order {orderNo}',
      vi: 'Don {orderNo}',
    },
    noUnassignedCards: {
      ko: '미배정 작업이 없습니다.',
      en: 'No unassigned work.',
      vi: 'Khong co cong viec chua phan cong.',
    },
    progressCompact: { ko: '진행 {percent}', en: 'Progress {percent}', vi: 'Tien do {percent}' },
    orderNoFallback: { ko: '주문 없음', en: 'No order', vi: 'Khong co don' },
    remainingHoursCompact: { ko: '잔량 {hours}', en: 'Remain {hours}', vi: 'Con lai {hours}' },
    visiblePlanHoursCompact: {
      ko: '표시 구간 {hours}',
      en: 'In view {hours}',
      vi: 'Trong khung nhin {hours}',
    },
    unlinkedWorkLogsCompact: {
      ko: '미연결 기록',
      en: 'Unlinked logs',
      vi: 'Nhat ky chua lien ket',
    },
    lineCapacityBoard: { ko: '라인 용량', en: 'Line Capacity', vi: 'Cong suat chuyen' },
    assignmentCancelSection: {
      ko: '배정 취소',
      en: 'Cancel Assignment',
      vi: 'Huy phan cong',
    },
    assignmentCancelDropHint: {
      ko: '배정된 작업을 여기에 놓으면 미배정 작업으로 돌아갑니다.',
      en: 'Drop an assigned task here to return it to unassigned work.',
      vi: 'Tha cong viec da phan cong vao day de dua ve danh sach chua phan cong.',
    },
    assignmentCancelRecordedWorkHint: {
      ko: '작업기록이 입력된 작업은 배정을 취소할 수 없습니다.',
      en: 'Tasks with work records cannot be unassigned.',
      vi: 'Khong the huy phan cong cong viec da co nhat ky san xuat.',
    },
    cannotCancelAssignmentWithWorkRecords: {
      ko: '작업기록이 입력된 작업은 미배정으로 되돌릴 수 없습니다.',
      en: 'Assignments with work records cannot be returned to unassigned work.',
      vi: 'Khong the dua cong viec da co nhat ky san xuat ve danh sach chua phan cong.',
    },
    capacityMode: { ko: '용량', en: 'Capacity', vi: 'Cong suat' },
    timelineMode: { ko: '타임라인', en: 'Timeline', vi: 'Tien do' },
    capacitySummaryHint: {
      ko: '계획 부하는 현재 보드를 따르고, 실제 산출과 미연결 작업기록 경고는 저장된 작업기록을 따릅니다.',
      en: 'Planned load follows the current board. Actual output and unlinked-log warnings follow saved work logs.',
      vi: 'Tai trong ke hoach theo bang hien tai. San luong thuc te va canh bao nhat ky chua lien ket theo work log da luu.',
    },
    lineCapacityHeader: { ko: '라인', en: 'Line', vi: 'Chuyen' },
    assignmentCountCompact: {
      ko: '배정 {count}건',
      en: '{count} assignments',
      vi: '{count} phan cong',
    },
    plannedLoad: { ko: '계획 부하', en: 'Planned load', vi: 'Tai trong ke hoach' },
    forecastLoad: {
      ko: '이번달 배정된 작업',
      en: 'Assigned work this month',
      vi: 'Cong viec duoc giao thang nay',
    },
    actualOutput: {
      ko: '이번달 누적 생산',
      en: 'Cumulative production this month',
      vi: 'San luong luy ke thang nay',
    },
    workRecordsThroughCompact: {
      ko: '기록 기준 {date}',
      en: 'Records through {date}',
      vi: 'Ghi nhan den {date}',
    },
    noRecentWorkRecord: {
      ko: '최근 기록 없음',
      en: 'No recent records',
      vi: 'Khong co ghi nhan gan day',
    },
    totalEstimatedLoad: { ko: '총 예상', en: 'Total est.', vi: 'Tong du kien' },
    carryOutCompact: { ko: '이월 {hours}', en: 'Carry {hours}', vi: 'Chuyen sang {hours}' },
    capacityCompact: { ko: '용량 {hours}', en: 'Capacity {hours}', vi: 'Cong suat {hours}' },
    forecastFromCompact: {
      ko: '{date}부터 예측',
      en: 'Forecast from {date}',
      vi: 'Du bao tu {date}',
    },
    queueCountCompact: { ko: '대기 {count}건', en: '{count} queued', vi: '{count} dang cho' },
    completedCountCompact: { ko: '완료 {count}건', en: '{count} completed', vi: '{count} hoan thanh' },
    readyCountCompact: {
      ko: '확정 대기 {count}건',
      en: '{count} awaiting completion',
      vi: '{count} cho xac nhan',
    },
    remainingLoadCompact: { ko: '잔량 {hours}', en: 'Remain {hours}', vi: 'Con lai {hours}' },
    backlogDaysCompact: { ko: '예상 {days}', en: 'Backlog {days}', vi: 'Ton dong {days}' },
    lineFreeByCompact: { ko: '{date} 비움 예상', en: 'Free by {date}', vi: 'Ranh vao {date}' },
    lineFreeNowCompact: { ko: '지금 비어 있음', en: 'Free now', vi: 'Dang ranh' },
    queuePositionCompact: { ko: '순서 {position}', en: 'Q{position}', vi: 'Thu tu {position}' },
    etaDaysCompact: { ko: '남은 {days}', en: 'ETA {days}', vi: 'Con {days}' },
    forecastEndCompact: { ko: '예상 종료 {date}', en: 'Finish {date}', vi: 'Xong {date}' },
    completedAtCompact: { ko: '완료 {date}', en: 'Done {date}', vi: 'Xong {date}' },
    completedEstimatedAtCompact: { ko: '완료 추정 {date}', en: 'Done est. {date}', vi: 'Uoc tinh xong {date}' },
    workDoneAtCompact: { ko: '작업 종료 {date}', en: 'Work done {date}', vi: 'Da xong viec {date}' },
    workDoneEstimatedAtCompact: {
      ko: '작업 종료 추정 {date}',
      en: 'Work done est. {date}',
      vi: 'Uoc tinh xong viec {date}',
    },
    awaitingCompletionCompact: {
      ko: '완료 확정 대기',
      en: 'Awaiting completion',
      vi: 'Cho xac nhan hoan thanh',
    },
    etaUnavailableCompact: { ko: 'ETA 계산 불가', en: 'ETA unavailable', vi: 'Khong tinh duoc ETA' },
    completedStatusCompact: { ko: '완료', en: 'Completed', vi: 'Hoan thanh' },
    readyStatusCompact: { ko: '작업 완료', en: 'Work done', vi: 'Da xong viec' },
    stUnknownExcludedCompact: {
      ko: 'ST 미설정 {count}건 제외',
      en: '{count} ST-missing excluded',
      vi: 'Loai tru {count} cong viec thieu ST',
    },
    unlinkedWorkLogsWithCount: {
      ko: '미연결 기록 {count}건',
      en: 'Unlinked logs {count}',
      vi: 'Nhat ky chua lien ket {count}',
    },
    activeAssignmentsHeader: {
      ko: '현재 대기 작업',
      en: 'Queued on this line',
      vi: 'Cong viec dang cho tren chuyen',
    },
    finishedAssignmentsHeader: {
      ko: '작업 종료 목록',
      en: 'Finished on this line',
      vi: 'Cong viec da xong tren chuyen',
    },
    lineAssignments: {
      ko: '이 라인 배정 목록',
      en: 'Assignments on this line',
      vi: 'Danh sach phan cong tren chuyen nay',
    },
    noQueuedAssignmentsInLine: {
      ko: '이 라인에 대기 작업이 없습니다.',
      en: 'No queued assignments in this line.',
      vi: 'Khong co phan cong dang cho tren chuyen nay.',
    },
    noFinishedAssignmentsInLine: {
      ko: '이 라인에 작업 종료 항목이 없습니다.',
      en: 'No finished assignments in this line.',
      vi: 'Khong co cong viec da xong tren chuyen nay.',
    },
    noAssignmentsInLine: {
      ko: '이 라인에는 배정이 없습니다.',
      en: 'No assignments in this line.',
      vi: 'Khong co phan cong tren chuyen nay.',
    },
    noLineCapacityRows: {
      ko: '표시할 라인 용량 데이터가 없습니다.',
      en: 'No line capacity data is available.',
      vi: 'Khong co du lieu cong suat chuyen de hien thi.',
    },
    manualLockRequiredCompact: {
      ko: '수동 잠금 필요',
      en: 'Manual lock required',
      vi: 'Can khoa thu cong',
    },
    ctMissingCompact: {
      ko: '시간 미설정',
      en: 'Time missing',
      vi: 'Chua co thoi gian',
    },
    lineDropHint: {
      ko: '이 라인에 배정하려면 여기에 놓으세요.',
      en: 'Drop cards here to assign to this line',
      vi: 'Tha the vao day de phan cong cho chuyen nay',
    },
    insertAssignmentAria: {
      ko: '여기에 배정 삽입',
      en: 'Insert assignment here',
      vi: 'Chen phan cong vao day',
    },
    expandLineAria: { ko: '라인 펼치기', en: 'Expand line', vi: 'Mo rong chuyen' },
    collapseLineAria: { ko: '라인 접기', en: 'Collapse line', vi: 'Thu gon chuyen' },
    lineTimeline: { ko: '라인 타임라인', en: 'Line Timeline', vi: 'Tien do chuyen' },
    lineColumn: { ko: '라인', en: 'Line', vi: 'Chuyen' },
    headcount: {
      ko: '{count}명',
      en: '{count} ppl',
      vi: '{count} nguoi',
    },
    weekdaySun: { ko: '일', en: 'Sun', vi: 'CN' },
    weekdayMon: { ko: '월', en: 'Mon', vi: 'T2' },
    weekdayTue: { ko: '화', en: 'Tue', vi: 'T3' },
    weekdayWed: { ko: '수', en: 'Wed', vi: 'T4' },
    weekdayThu: { ko: '목', en: 'Thu', vi: 'T5' },
    weekdayFri: { ko: '금', en: 'Fri', vi: 'T6' },
    weekdaySat: { ko: '토', en: 'Sat', vi: 'T7' },
    quantityCompact: {
      ko: '수량 {quantity}',
      en: 'Qty {quantity}',
      vi: 'SL {quantity}',
    },
    quantityLabel: { ko: '수량', en: 'Quantity', vi: 'So luong' },
    colorLabel: { ko: '색상', en: 'Color', vi: 'Mau' },
    genderLabel: { ko: '성별', en: 'Gender', vi: 'Gioi tinh' },
    customerLabel: { ko: '고객', en: 'Customer', vi: 'Khach hang' },
    styleLabel: { ko: '스타일', en: 'Style', vi: 'Style' },
    cardCustomerLabel: { ko: '고객사', en: 'Customer', vi: 'Khach hang' },
    cardOrderNoLabel: { ko: '주문번호', en: 'Order No.', vi: 'Ma don hang' },
    cardStyleLabel: { ko: '스타일', en: 'Style', vi: 'Style' },
    cardQuantityLabel: { ko: '수량', en: 'Quantity', vi: 'So luong' },
    cardProgressLabel: { ko: '진행도', en: 'Progress', vi: 'Tien do' },
    lineLabel: { ko: '라인', en: 'Line', vi: 'Chuyen' },
    imageUnavailable: {
      ko: '이미지\n없음',
      en: 'No\nImage',
      vi: 'Khong\nanh',
    },
    detailTitle: { ko: '업무 상세', en: 'Assignment Detail', vi: 'Chi tiet phan cong' },
    detailNotFound: {
      ko: '선택한 카드 정보를 찾을 수 없습니다.',
      en: 'The selected card could not be found.',
      vi: 'Khong tim thay the da chon.',
    },
    contextOpenDetail: {
      ko: '업무 상세',
      en: 'Open Detail',
      vi: 'Mo chi tiet',
    },
    contextSplitQuantity: {
      ko: '수량 분할',
      en: 'Split Quantity',
      vi: 'Tach so luong',
    },
    splitQuantityPrompt: {
      ko: '분할할 수량을 입력하세요 (1 ~ {max})',
      en: 'Enter the quantity to split (1 to {max})',
      vi: 'Nhap so luong can tach (1 den {max})',
    },
    saveSuccess: {
      ko: '작업 배정을 저장했습니다.',
      en: 'Assignment saved.',
      vi: 'Da luu phan cong.',
    },
    saveError: {
      ko: '작업 배정 저장에 실패했습니다.',
      en: 'Failed to save the assignment.',
      vi: 'Khong the luu phan cong.',
    },
    versionConflict: {
      ko: '서버 최신 상태와 화면 버전이 어긋났습니다. 작업 배정 화면을 다시 불러온 뒤 다시 시도해 주세요.',
      en: 'The server data is newer than this screen. Reload the assignment page and try again.',
      vi: 'Du lieu tren may chu moi hon man hinh nay. Hay tai lai trang phan cong va thu lai.',
    },
    leaveWithoutSaving: {
      ko: '저장되지 않은 작업 배정 데이터가 있습니다. 저장하지 않고 이동하시겠습니까?',
      en: 'There are unsaved assignment changes. Leave without saving?',
      vi: 'Co du lieu phan cong chua luu. Roi trang ma khong luu?',
    },
    resetConfirm: {
      ko: '저장되지 않은 작업 배정 변경사항을 마지막 저장 상태로 되돌릴까요?',
      en: 'Restore unsaved assignment changes to the last saved state?',
      vi: 'Khoi phuc cac thay doi chua luu ve trang thai da luu gan nhat?',
    },
    resetFailed: {
      ko: '마지막 저장 상태를 복원하지 못했습니다. 화면을 새로고침 후 다시 시도해 주세요.',
      en: 'Failed to restore the last saved state. Refresh the page and try again.',
      vi: 'Khong the khoi phuc trang thai da luu gan nhat. Hay tai lai trang va thu lai.',
    },
    resetSuccess: {
      ko: '마지막 저장 상태로 되돌렸습니다.',
      en: 'Restored the last saved state.',
      vi: 'Da khoi phuc trang thai da luu gan nhat.',
    },
    dragOverlayFallback: {
      ko: '미배정 카드',
      en: 'Unassigned Card',
      vi: 'The chua phan cong',
    },
    savedCtBadge: { ko: 'CT 저장', en: 'CT Saved', vi: 'CT da luu' },
    unsavedCtBadge: { ko: 'CT 미저장', en: 'CT Unsaved', vi: 'CT chua luu' },
    savedCtLabel: { ko: '저장 CT', en: 'Saved CT', vi: 'CT da luu' },
    savedState: { ko: '저장됨', en: 'Saved', vi: 'Da luu' },
    unsavedState: { ko: '미저장', en: 'Unsaved', vi: 'Chua luu' },
    updatedByLabel: {
      ko: '최근 저장자',
      en: 'Last Saved By',
      vi: 'Nguoi luu gan nhat',
    },
    ctCostSummary: { ko: 'CT/비용 요약', en: 'CT / Cost Summary', vi: 'Tom tat CT / chi phi' },
    processStSumPerPiece: {
      ko: '공정 ST 합 (한 벌)',
      en: 'Process ST Total (per piece)',
      vi: 'Tong ST cong doan (moi san pham)',
    },
    processInputCtSumPerPiece: {
      ko: '공정 입력 CT 합 (한 벌)',
      en: 'Entered CT Total (per piece)',
      vi: 'Tong CT nhap (moi san pham)',
    },
    processInputCtSumTotal: {
      ko: '공정 입력 CT 합 (전체)',
      en: 'Entered CT Total (all qty)',
      vi: 'Tong CT nhap (toan bo)',
    },
    divergenceLabel: { ko: '변동률', en: 'Variance', vi: 'Do lech' },
    expectedDurationLabel: { ko: '예상 기간', en: 'Expected Duration', vi: 'Thoi gian du kien' },
    expectedCostLabel: { ko: '예상 비용', en: 'Expected Cost', vi: 'Chi phi du kien' },
    processCtDetail: { ko: '공정 CT 상세', en: 'Process CT Detail', vi: 'Chi tiet CT cong doan' },
    processDataUnavailable: {
      ko: '공정 정보가 없어 상세 CT를 표시할 수 없습니다.',
      en: 'Process data is not available, so CT detail cannot be shown.',
      vi: 'Khong co du lieu cong doan nen khong the hien thi chi tiet CT.',
    },
    processLabel: { ko: '공정', en: 'Process', vi: 'Cong doan' },
    inputCtColumn: { ko: '입력 CT({quantity})', en: 'Entered CT({quantity})', vi: 'CT nhap({quantity})' },
    savedCtColumn: { ko: '저장 CT({quantity})', en: 'Saved CT({quantity})', vi: 'CT da luu({quantity})' },
    unitCostDong: { ko: '단가(동)', en: 'Unit Cost (dong)', vi: 'Don gia (dong)' },
    noData: { ko: '데이터 없음', en: 'No data', vi: 'Khong co du lieu' },
    processSumPerPiece: {
      ko: '공정 합(한 벌)',
      en: 'Process Total (per piece)',
      vi: 'Tong cong doan (moi san pham)',
    },
    ctSnapshotHint: {
      ko: '입력 CT를 비우면 ST(q) 값을 그대로 사용합니다. 현재 값은 작업 배정을 저장할 때 날짜/라인 정보와 함께 CT snapshot으로 저장됩니다.',
      en: 'If Entered CT is empty, the ST(q) value is used as-is. The current value is saved as a CT snapshot together with date and line info when you save the assignment.',
      vi: 'Neu de trong CT nhap, se su dung nguyen gia tri ST(q). Gia tri hien tai se duoc luu thanh CT snapshot cung voi ngay va thong tin chuyen khi ban luu phan cong.',
    },
    durationDays: { ko: '{days}일', en: '{days}d', vi: '{days} ngay' },
    connectPrev: { ko: '앞 작업과 연결', en: 'Link to previous task', vi: 'Noi voi cong viec truoc' },
    currencyUnit: { ko: '동', en: 'dong', vi: 'dong' },
    secondsUnit: { ko: '초', en: 'sec', vi: 'giay' },
    fallbackNoColor: { ko: '색상 없음', en: 'No Color', vi: 'Khong mau' },
    fallbackStyleName: { ko: '스타일 {index}', en: 'Style {index}', vi: 'Style {index}' },
    fallbackProcessName: { ko: '공정 {index}', en: 'Process {index}', vi: 'Cong doan {index}' },
    fallbackOrderNumber: { ko: '주문번호 없음', en: 'No Order No.', vi: 'Khong co ma don' },
  },
  styleBoard: {
    searchPlaceholder: {
      ko: '스타일명 또는 고객사 검색...',
      en: 'Search style name or customer...',
      vi: 'Tim ten style hoac khach hang...',
    },
    addStyle: { ko: '스타일 추가', en: 'Add Style', vi: 'Them style' },
    tableAriaLabel: { ko: '스타일 목록 표', en: 'Style list table', vi: 'Bang danh sach style' },
    customer: { ko: '고객사', en: 'Customer', vi: 'Khach hang' },
    styleName: { ko: '스타일명', en: 'Style Name', vi: 'Ten style' },
    styleCode: { ko: '스타일 코드', en: 'Style Code', vi: 'Ma style' },
    unitCost: { ko: '단위 공임', en: 'Unit Cost', vi: 'Cong don vi' },
    registrationDate: { ko: '등록일', en: 'Registered', vi: 'Ngay dang ky' },
    action: { ko: '작업', en: 'Action', vi: 'Tac vu' },
    loadingMessage: {
      ko: '스타일 목록을 불러오는 중입니다.',
      en: 'Loading styles...',
      vi: 'Dang tai danh sach style...',
    },
    fetchError: {
      ko: '스타일 목록을 불러오지 못했습니다.',
      en: 'Failed to load styles.',
      vi: 'Khong the tai danh sach style.',
    },
    emptyMessage: {
      ko: '등록된 스타일이 없습니다.',
      en: 'No styles found.',
      vi: 'Chua co style nao.',
    },
    deleteDialogTitle: {
      ko: '스타일 삭제 확인',
      en: 'Confirm Style Deletion',
      vi: 'Xac nhan xoa style',
    },
    deleteDialogDescription: {
      ko: "정말로 '{name}' 스타일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
      en: "Delete style '{name}'? This action cannot be undone.",
      vi: "Ban co chac muon xoa style '{name}' khong? Hanh dong nay khong the hoan tac.",
    },
    deleteSuccess: {
      ko: '스타일이 삭제되었습니다.',
      en: 'Style deleted.',
      vi: 'Da xoa style.',
    },
    deleteError: {
      ko: '스타일 삭제에 실패했습니다.',
      en: 'Failed to delete style.',
      vi: 'Xoa style that bai.',
    },
  },
  customerBoard: {
    title: { ko: '고객', en: 'Customer', vi: 'Khach hang' },
    searchPlaceholder: {
      ko: '고객명, 코드, 담당자 또는 주소 검색...',
      en: 'Search customer name, code, manager, or address...',
      vi: 'Tim ten khach, ma, nguoi phu trach hoac dia chi...',
    },
    addCustomer: { ko: '고객 추가', en: 'Add Customer', vi: 'Them khach hang' },
    code: { ko: '고객 코드', en: 'Customer Code', vi: 'Ma khach hang' },
    name: { ko: '고객명', en: 'Customer Name', vi: 'Ten khach hang' },
    country: { ko: '국가', en: 'Country', vi: 'Quoc gia' },
    address: { ko: '주소', en: 'Address', vi: 'Dia chi' },
    manager: { ko: '담당자', en: 'Manager', vi: 'Nguoi phu trach' },
    contact: { ko: '연락처', en: 'Contact', vi: 'Lien he' },
    email: { ko: '이메일', en: 'Email', vi: 'Email' },
    registeredAt: { ko: '등록일', en: 'Registered', vi: 'Ngay dang ky' },
    loadingMessage: {
      ko: '고객 목록을 불러오는 중입니다.',
      en: 'Loading customers...',
      vi: 'Dang tai danh sach khach hang...',
    },
    emptyMessage: {
      ko: '등록된 고객이 없습니다.',
      en: 'No customers found.',
      vi: 'Chua co khach hang nao.',
    },
    createTitle: { ko: '고객 등록', en: 'Add Customer', vi: 'Tao khach hang' },
    editTitle: { ko: '고객 정보 수정', en: 'Edit Customer', vi: 'Sua khach hang' },
    drawerDescription: {
      ko: '고객 기본 정보를 입력합니다.',
      en: 'Enter the customer basic information.',
      vi: 'Nhap thong tin co ban cua khach hang.',
    },
    countryCode: { ko: '국가번호', en: 'Country Code', vi: 'Ma quoc gia' },
    phoneNumber: { ko: '전화번호', en: 'Phone Number', vi: 'So dien thoai' },
    saveInProgress: { ko: '저장 중...', en: 'Saving...', vi: 'Dang luu...' },
    fetchError: {
      ko: '고객 목록을 불러오지 못했습니다.',
      en: 'Failed to load customer list.',
      vi: 'Khong the tai danh sach khach hang.',
    },
    saveError: {
      ko: '고객 저장 중 오류가 발생했습니다.',
      en: 'An error occurred while saving customer information.',
      vi: 'Co loi khi luu khach hang.',
    },
    createSuccess: {
      ko: '고객을 등록했습니다.',
      en: 'Customer has been created.',
      vi: 'Da tao khach hang.',
    },
    updateSuccess: {
      ko: '고객 정보를 수정했습니다.',
      en: 'Customer information has been updated.',
      vi: 'Da cap nhat thong tin khach hang.',
    },
    codeRequired: {
      ko: '고객 코드를 입력해 주세요.',
      en: 'Please enter a customer code.',
      vi: 'Vui long nhap ma khach hang.',
    },
    nameRequired: {
      ko: '고객명을 입력해 주세요.',
      en: 'Please enter a customer name.',
      vi: 'Vui long nhap ten khach hang.',
    },
  },
};

Object.assign(UI_MESSAGES, {
  organizationBoard: {
    title: { ko: '\uC870\uC9C1', en: 'Organization', vi: 'To chuc' },
    tabBusiness: { ko: '\uBC95\uC778 \uC815\uBCF4', en: 'Business Info', vi: 'Thong tin doanh nghiep' },
    tabFactory: { ko: '\uACF5\uC7A5 \uC815\uBCF4', en: 'Factory Info', vi: 'Thong tin nha may' },
    toggleAriaLabel: {
      ko: '\uC870\uC9C1 \uAD00\uB9AC \uD0ED',
      en: 'Organization management tabs',
      vi: 'Tab quan ly to chuc',
    },
  },
  factoryBoard: {
    title: { ko: '\uACF5\uC7A5', en: 'Factory', vi: 'Nha may' },
    addFactory: { ko: '\uACF5\uC7A5 \uCD94\uAC00', en: 'Add Factory', vi: 'Them nha may' },
    deleteFactory: { ko: '\uACF5\uC7A5 \uC0AD\uC81C', en: 'Delete Factory', vi: 'Xoa nha may' },
    columnName: { ko: '\uACF5\uC7A5\uBA85', en: 'Factory Name', vi: 'Ten nha may' },
    columnAddress: { ko: '\uC8FC\uC18C', en: 'Address', vi: 'Dia chi' },
    columnContact: { ko: '\uC5F0\uB77D\uCC98', en: 'Contact', vi: 'Lien he' },
    columnManager: { ko: '\uAD00\uB9AC\uC790', en: 'Manager', vi: 'Quan ly' },
    columnWagePerSecond: { ko: '\uCD08\uB2F9 \uAE09\uC5EC', en: 'Wage / sec', vi: 'Luong/giay' },
    columnAction: { ko: '\uAD00\uB9AC', en: 'Action', vi: 'Tac vu' },
    loading: { ko: '\uBD88\uB7EC\uC624\uB294 \uC911...', en: 'Loading...', vi: 'Dang tai...' },
    empty: { ko: '\uB4F1\uB85D\uB41C \uACF5\uC7A5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.', en: 'No factories found.', vi: 'Chua co nha may nao.' },
    fetchError: { ko: '\uACF5\uC7A5 \uBAA9\uB85D\uC744 \uBD88\uB7EC\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.', en: 'Failed to load factory list.', vi: 'Khong the tai danh sach nha may.' },
    saveSuccess: { ko: '\uACF5\uC7A5 \uC815\uBCF4\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.', en: 'Factory information has been saved.', vi: 'Da luu thong tin nha may.' },
    saveError: { ko: '\uACF5\uC7A5 \uC815\uBCF4 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.', en: 'Failed to save factory information.', vi: 'Khong the luu thong tin nha may.' },
    deleteConfirm: {
      ko: "'{name}'\uB97C \uC0AD\uC81C\uD558\uC2DC\uACA0\uC2B5\uB2C8\uAE4C?\\n\uAD00\uB828 \uB77C\uC778/\uC9C1\uC6D0/\uB77C\uC778\uBC30\uC815\uB3C4 \uD568\uAED8 \uC0AD\uC81C\uB429\uB2C8\uB2E4.",
      en: "Delete '{name}'?\\nRelated lines, employees, and assignments will also be deleted.",
      vi: "Xoa '{name}'?\\nCac chuyen, nhan vien va phan cong lien quan cung se bi xoa.",
    },
    deleteSuccess: {
      ko: '\uACF5\uC7A5\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4. \uB77C\uC778 {lineCount}\uAC1C, \uC9C1\uC6D0 {employeeCount}\uBA85\uB3C4 \uD568\uAED8 \uC0AD\uC81C\uB418\uC5C8\uC2B5\uB2C8\uB2E4.',
      en: 'Factory deleted. Lines {lineCount}, employees {employeeCount} were also deleted.',
      vi: 'Da xoa nha may. Cung da xoa {lineCount} chuyen va {employeeCount} nhan vien.',
    },
    deleteError: { ko: '\uACF5\uC7A5 \uC0AD\uC81C\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.', en: 'Failed to delete factory.', vi: 'Khong the xoa nha may.' },
  },
  factoryDetail: {
    createTitle: { ko: '\uACF5\uC7A5 \uCD94\uAC00', en: 'Add Factory', vi: 'Them nha may' },
    editTitle: { ko: '\uACF5\uC7A5 \uC218\uC815', en: 'Edit Factory', vi: 'Sua nha may' },
    name: { ko: '\uACF5\uC7A5\uBA85', en: 'Factory Name', vi: 'Ten nha may' },
    address: { ko: '\uC8FC\uC18C', en: 'Address', vi: 'Dia chi' },
    manager: { ko: '\uAD00\uB9AC\uC790', en: 'Manager', vi: 'Quan ly' },
    country: { ko: '\uAD6D\uAC00', en: 'Country', vi: 'Quoc gia' },
    countryCode: { ko: '\uAD6D\uAC00\uBC88\uD638', en: 'Country Code', vi: 'Ma quoc gia' },
    phoneNumber: { ko: '\uC804\uD654\uBC88\uD638', en: 'Phone Number', vi: 'So dien thoai' },
    targetMonthlyWage: { ko: '\uC6D4 \uBAA9\uD45C \uAE09\uC5EC', en: 'Target Monthly Wage', vi: 'Muc luong thang muc tieu' },
    wagePerSecond: { ko: '\uCD08\uB2F9 \uAE09\uC5EC (\uC790\uB3D9\uACC4\uC0B0)', en: 'Wage / sec (auto)', vi: 'Luong/giay (tu dong)' },
    targetMonthlyWageHelper: {
      ko: '\uC6D4 26\uC77C, \uD558\uB8E8 8\uC2DC\uAC04(08:00~17:00, \uC810\uC2EC 1\uC2DC\uAC04 \uC81C\uC678) \uAE30\uC900',
      en: 'Based on 26 days/month, 8 hours/day (08:00-17:00 with 1 hour lunch break).',
      vi: 'Tinh theo 26 ngay/thang, 8 gio/ngay (08:00-17:00, tru 1 gio nghi trua).',
    },
    wagePerSecondHelper: {
      ko: '\uC6D4 \uBAA9\uD45C \uAE09\uC5EC \uAE30\uC900\uC73C\uB85C \uC790\uB3D9 \uACC4\uC0B0',
      en: 'Automatically calculated from monthly target wage.',
      vi: 'Tu dong tinh theo muc luong thang muc tieu.',
    },
  },
  organizationDetail: {
    title: { ko: '\uD68C\uC0AC \uC815\uBCF4', en: 'Company Info', vi: 'Thong tin cong ty' },
    name: { ko: '\uD68C\uC0AC\uBA85', en: 'Company Name', vi: 'Ten cong ty' },
    businessNumber: {
      ko: '\uC0AC\uC5C5\uC790\uB4F1\uB85D\uBC88\uD638',
      en: 'Business Registration Number',
      vi: 'So dang ky kinh doanh',
    },
    representative: { ko: '\uB300\uD45C\uC790\uBA85', en: 'Representative', vi: 'Nguoi dai dien' },
    industry: { ko: '\uC5C5\uC885', en: 'Industry', vi: 'Nganh nghe' },
    address: { ko: '\uC8FC\uC18C', en: 'Address', vi: 'Dia chi' },
    phone: { ko: '\uC5F0\uB77D\uCC98', en: 'Contact', vi: 'Lien he' },
    email: { ko: '\uC774\uBA54\uC77C', en: 'Email', vi: 'Email' },
    saveSuccess: {
      ko: '\uD68C\uC0AC \uC815\uBCF4\uB97C \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.',
      en: 'Company information has been saved.',
      vi: 'Da luu thong tin cong ty.',
    },
    saveError: {
      ko: '\uD68C\uC0AC \uC815\uBCF4 \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
      en: 'Failed to save company information.',
      vi: 'Khong the luu thong tin cong ty.',
    },
  },
  holidayBoard: {
    title: { ko: '\uD734\uC77C \uAD00\uB9AC', en: 'Holiday Management', vi: 'Quan ly ngay nghi' },
    saveInProgress: { ko: '\uC800\uC7A5 \uC911...', en: 'Saving...', vi: 'Dang luu...' },
    manualHolidayCount: {
      ko: '\uC218\uB3D9 \uB4F1\uB85D \uD734\uC77C {count}\uC77C',
      en: 'Manual holidays {count} days',
      vi: 'Ngay nghi thu cong {count} ngay',
    },
    selectedDate: { ko: '\uC120\uD0DD\uC77C', en: 'Selected Date', vi: 'Ngay da chon' },
    registerSelected: {
      ko: '\uC120\uD0DD\uC77C \uD734\uC77C \uB4F1\uB85D',
      en: 'Register Selected Date',
      vi: 'Dang ky ngay da chon',
    },
    unregisterSelected: {
      ko: '\uC120\uD0DD\uC77C \uD734\uC77C \uD574\uC81C',
      en: 'Remove Selected Date',
      vi: 'Bo ngay da chon',
    },
    sundayInfo: {
      ko: '\uC77C\uC694\uC77C\uC740 \uAE30\uBCF8 \uD734\uC77C\uB85C \uC790\uB3D9 \uBC18\uC601\uB429\uB2C8\uB2E4.',
      en: 'Sundays are automatically treated as holidays.',
      vi: 'Chu nhat duoc tu dong tinh la ngay nghi.',
    },
    pastDateHint: {
      ko: '\uC9C0\uB09C \uB0A0\uC9DC\uB294 \uD68C\uC0C9 \uD1A4\uC73C\uB85C \uD45C\uC2DC\uB429\uB2C8\uB2E4.',
      en: 'Past dates are shown in gray tone.',
      vi: 'Ngay trong qua khu duoc hien thi mau xam.',
    },
    registeredHolidays: { ko: '\uB4F1\uB85D\uB41C \uD734\uC77C', en: 'Registered Holidays', vi: 'Ngay nghi da dang ky' },
    emptyMessage: {
      ko: '\uB4F1\uB85D\uB41C \uD734\uC77C\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uB2EC\uB825\uC5D0\uC11C \uB0A0\uC9DC\uB97C \uC120\uD0DD\uD574 \uD734\uC77C\uB85C \uB4F1\uB85D\uD558\uC138\uC694.',
      en: 'No registered holidays. Select a date from the calendar to register one.',
      vi: 'Chua co ngay nghi da dang ky. Hay chon ngay tren lich de dang ky.',
    },
    pastSuffix: { ko: '\uC9C0\uB0A8', en: 'Past', vi: 'Da qua' },
    noChanges: {
      ko: '\uC800\uC7A5\uD560 \uBCC0\uACBD\uC0AC\uD56D\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.',
      en: 'There are no changes to save.',
      vi: 'Khong co thay doi de luu.',
    },
    saveSuccess: {
      ko: '\uD734\uC77C \uBCC0\uACBD\uC0AC\uD56D\uC744 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.',
      en: 'Holiday changes have been saved.',
      vi: 'Da luu thay doi ngay nghi.',
    },
    saveError: {
      ko: '\uD734\uC77C \uBCC0\uACBD\uC0AC\uD56D \uC800\uC7A5\uC5D0 \uC2E4\uD328\uD588\uC2B5\uB2C8\uB2E4.',
      en: 'Failed to save holiday changes.',
      vi: 'Khong the luu thay doi ngay nghi.',
    },
  },
});

const resolveMessageNode = (key) => {
  if (!key) return null;
  return String(key)
    .split('.')
    .reduce((current, token) => (current && typeof current === 'object' ? current[token] : null), UI_MESSAGES);
};

const resolveLocalizedMessage = (value, languageCode = getCurrentLanguageCode()) => {
  if (!value || typeof value !== 'object') return '';
  const normalizedLanguageCode = normalizeLanguageCode(languageCode, 'ko');
  return (
    value[normalizedLanguageCode] ||
    value.ko ||
    value.en ||
    value.vi ||
    ''
  );
};

const formatMessage = (template, params = {}) =>
  String(template || '').replace(/\{(\w+)\}/g, (_match, token) => {
    if (!Object.prototype.hasOwnProperty.call(params, token)) return '';
    return String(params[token] ?? '');
  });

export const getUiMessage = (
  key,
  fallback = '',
  languageCode = getCurrentLanguageCode(),
  params = null
) => {
  const template =
    resolveLocalizedMessage(resolveMessageNode(key), languageCode) || String(fallback || '');
  if (!params || typeof params !== 'object') return template;
  return formatMessage(template, params);
};

export const hasUiMessage = (key) => Boolean(resolveMessageNode(key));
