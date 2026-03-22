import { getCurrentLanguageCode, normalizeLanguageCode } from '../utils/appLanguage';

export const UI_MESSAGES = {
  common: {
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
    workHistory: { ko: '기록', en: 'Logs', vi: 'Ghi chep' },
    attendance: { ko: '출퇴근', en: 'Attendance', vi: 'Cham cong' },
    inventory: { ko: '재고 관리', en: 'Inventory', vi: 'Ton kho' },
    inventoryIssue: { ko: '재고 불출', en: 'Inventory Issue', vi: 'Xuat kho' },
    accounting: { ko: '회계 관리', en: 'Accounting', vi: 'Ke toan' },
    payroll: { ko: '급여 계산', en: 'Payroll', vi: 'Tinh luong' },
    productionResult: { ko: '생산 결과', en: 'Production Result', vi: 'Ket qua san xuat' },
    organization: { ko: '조직 관리', en: 'Organization', vi: 'To chuc' },
    business: { ko: '사업체 관리', en: 'Business', vi: 'Doanh nghiep' },
    line: { ko: '라인', en: 'Lines', vi: 'Chuyen may' },
    employee: { ko: '직원 관리', en: 'Employees', vi: 'Nhan vien' },
    customer: { ko: '고객', en: 'Customer', vi: 'Khach hang' },
    holiday: { ko: '휴일 관리', en: 'Holidays', vi: 'Ngay nghi' },
    profile: { ko: '개인 정보', en: 'Profile', vi: 'Ho so ca nhan' },
    subscription: { ko: '구독 관리', en: 'Subscription', vi: 'Goi dich vu' },
    system: { ko: '시스템 설정', en: 'System', vi: 'He thong' },
    attribute: { ko: '속성 관리', en: 'Attributes', vi: 'Thuoc tinh' },
    staticOptions: { ko: '정적 사전', en: 'Static Dictionary', vi: 'Tu dien tinh' },
    onboardingApproval: { ko: '가입 승인', en: 'Onboarding Approval', vi: 'Duyet dang ky' },
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
    unassignedCards: { ko: '미배정 카드', en: 'Unassigned Cards', vi: 'The chua phan cong' },
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
      ko: '미배정 카드가 없습니다.',
      en: 'No unassigned cards.',
      vi: 'Khong co the chua phan cong.',
    },
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
};

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
