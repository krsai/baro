const translations = {
  '일반': ['General', 'Thường'], '수당': ['Output', 'Sản lượng'],
  '기본급': ['Base salary', 'Lương cơ bản'], '급여 수당': ['Allowances', 'Phụ cấp'], '성과급': ['Incentives', 'Thưởng hiệu suất'],
  '매월': ['Monthly', 'Hàng tháng'], '3개월마다': ['Quarterly', 'Mỗi 3 tháng'], '6개월마다': ['Every 6 months', 'Mỗi 6 tháng'], '매년': ['Annually', 'Hàng năm'], '1회 지급': ['One-time', 'Chi trả một lần'],
  '직급별 단가': ['Rate by grade', 'Đơn giá theo cấp bậc'], '실제 근무일수': ['Actual workdays', 'Ngày công thực tế'], '기준 근무일수': ['Scheduled workdays', 'Ngày công tiêu chuẩn'],
  '일': ['days', 'ngày'], '시간': ['hours', 'giờ'], '년': ['years', 'năm'],
  '해당 월의 근무요일에서 등록 공휴일을 제외하고 서버가 계산합니다.': ['The server calculates this by excluding registered holidays from the month’s working weekdays.', 'Máy chủ tính bằng cách loại trừ ngày lễ đã đăng ký khỏi các ngày làm việc trong tháng.'],
  '정규 근무시간': ['Regular work hours', 'Giờ làm việc chính thức'], '연장근무시간': ['Overtime hours', 'Giờ tăng ca'], '휴일 특근시간': ['Holiday work hours', 'Giờ làm ngày lễ'], '근속연수': ['Years of service', 'Số năm làm việc'],
  '만근 충족값': ['Full-attendance factor', 'Hệ số đủ công'], '1 또는 0': ['1 or 0', '1 hoặc 0'], '만근을 채우면 1, 아니면 0으로 계산됩니다.': ['Calculated as 1 when full attendance is met, otherwise 0.', 'Tính là 1 khi đủ công, ngược lại là 0.'],
  '생산수당 계산 결과': ['Production allowance result', 'Kết quả tính phụ cấp sản lượng'],
  '단가·근속': ['Rate & tenure', 'Đơn giá & thâm niên'], '근무일수': ['Workdays', 'Ngày công'], '근무시간': ['Work hours', 'Giờ làm việc'], '조건·외부 계산값': ['Conditions & external values', 'Điều kiện & giá trị tính từ bên ngoài'],
  '점심수당': ['Lunch allowance', 'Phụ cấp ăn trưa'], '통신비': ['Communication allowance', 'Phụ cấp điện thoại'], '교통비': ['Transportation allowance', 'Phụ cấp đi lại'],
  '직책수당': ['Position allowance', 'Phụ cấp chức vụ'], '주거수당': ['Housing allowance', 'Phụ cấp nhà ở'], '어학수당': ['Language allowance', 'Phụ cấp ngoại ngữ'],
  '휴일근무수당': ['Holiday work allowance', 'Phụ cấp làm ngày lễ'], '만근수당': ['Full-attendance allowance', 'Phụ cấp chuyên cần'], '근속수당': ['Seniority allowance', 'Phụ cấp thâm niên'],
  '생산 목표 초과 달성 성과급': ['Production target incentive', 'Thưởng hiệu suất vượt mục tiêu sản xuất'],
  '급여 기준을 불러오지 못했습니다.': ['Could not load salary settings.', 'Không thể tải thiết lập lương.'],
  '화면 시안에 항목을 추가했습니다. 서버 저장은 백엔드 구현 후 연결됩니다.': ['The item was added to this UI preview. Server persistence will be connected after the backend is implemented.', 'Đã thêm khoản mục vào bản xem trước giao diện. Việc lưu trên máy chủ sẽ được kết nối sau khi hoàn thiện backend.'],
  '화면 시안 상태이며 서버 저장 기능은 아직 연결되지 않았습니다. 백엔드 구현 후 실제로 저장됩니다.': ['This is still a UI preview - saving is not yet connected to the server. Values will be persisted once the backend is implemented.', 'Đây vẫn là bản xem trước giao diện - chức năng lưu chưa được kết nối với máy chủ. Giá trị sẽ được lưu khi hoàn thiện backend.'],
  '저장': ['Save', 'Lưu'],
  '정산 주기': ['Payment cycle', 'Chu kỳ thanh toán'],
  '상한값 (선택)': ['Cap (optional)', 'Giới hạn (tùy chọn)'], '계산 결과 최대 금액': ['Maximum calculated amount', 'Số tiền tính tối đa'],
  '급여 체계': ['Salary Structure', 'Cơ cấu lương'], '급여 항목, 복합 계산 단위, 적용 대상별 단가와 변경 이력을 관리합니다.': ['Manage salary items, formula components, rates by target, and change history.', 'Quản lý khoản lương, thành phần công thức, đơn giá theo đối tượng và lịch sử thay đổi.'],
  '적용 시작월': ['Effective month', 'Tháng bắt đầu áp dụng'], '적용 이력': ['Application history', 'Lịch sử áp dụng'], '항목 추가': ['Add item', 'Thêm khoản mục'],
  '급여 항목 및 단가': ['Salary items and rates', 'Khoản lương và đơn giá'], '급여 항목': ['Salary items', 'Khoản lương'],
  '항목을 선택해 계산 방식과 직급별 단가를 설정하세요.': ['Select an item to configure its formula and grade-based rates.', 'Chọn khoản mục để thiết lập công thức và đơn giá theo cấp bậc.'],
  '개': ['items', 'mục'], '기본급은 삭제할 수 없습니다.': ['Base salary cannot be deleted.', 'Không thể xóa lương cơ bản.'], '항목 삭제': ['Delete item', 'Xóa khoản mục'],
  '지급 설정': ['Payment settings', 'Thiết lập chi trả'], '설정': ['Settings', 'Thiết lập'], '상한': ['Cap', 'Giới hạn'], '계산식이 비어 있습니다.': ['The formula is empty.', 'Công thức đang trống.'], '수정': ['Edit', 'Sửa'],
  '권한이나 직무와 관계없이 직원에게 지정된 급여 타입과 직급으로 단가를 결정합니다.': ['Rates are determined by each employee’s assigned pay type and grade, regardless of role or job.', 'Đơn giá được xác định theo loại lương và cấp bậc của nhân viên, không phụ thuộc quyền hạn hay công việc.'],
  '급여 타입': ['Pay type', 'Loại lương'], '직급': ['Grade', 'Cấp bậc'], '단가': ['Rate', 'Đơn giá'],
  '급여체계 적용 이력': ['Salary structure history', 'Lịch sử áp dụng cơ cấu lương'], '적용 시점별 급여 기준을 조회하고 새 버전의 기준으로 복사합니다.': ['Review salary settings by effective date and copy them into a new version.', 'Xem thiết lập lương theo thời điểm áp dụng và sao chép làm cơ sở cho phiên bản mới.'],
  '버전': ['Version', 'Phiên bản'], '적용 기간': ['Effective period', 'Thời gian áp dụng'], '상태': ['Status', 'Trạng thái'], '비고': ['Notes', 'Ghi chú'], '작업': ['Action', 'Thao tác'],
  '현재 기준': ['Current settings', 'Thiết lập hiện tại'], '적용 예정': ['Scheduled', 'Sắp áp dụng'], '일반·수당 대상과 복합 계산 단위를 편집 중인 기준': ['Draft settings for General/Output targets and formula components', 'Thiết lập đang sửa cho đối tượng Thường/Sản lượng và thành phần công thức'], '편집': ['Edit', 'Sửa'],
  '기존 기준': ['Existing settings', 'Thiết lập hiện có'], '최초 적용 ~ 현재': ['First applied ~ present', 'Áp dụng lần đầu ~ hiện tại'], '사용 중': ['In use', 'Đang sử dụng'], '기본급·수당·성과급': ['Base salary · allowances · incentives', 'Lương cơ bản · phụ cấp · thưởng hiệu suất'], '현재 서버에 저장된 기존 기준': ['Existing settings currently stored on the server', 'Thiết lập hiện có đang lưu trên máy chủ'], '조회': ['View', 'Xem'],
  '계산 방식 설정': ['Configure formula', 'Thiết lập công thức'], '모든 지급 방식은 아래 모듈의 조합으로 만듭니다. 기준 근무일수는 선택 월의 근무요일에서 등록 공휴일을 제외해 서버가 계산합니다.': ['Build every payment method from the modules below. The server calculates scheduled workdays from working weekdays minus registered holidays.', 'Mọi phương thức chi trả được tạo từ các mô-đun dưới đây. Máy chủ tính ngày công tiêu chuẩn từ ngày làm việc và loại trừ ngày lễ đã đăng ký.'],
  '계산식': ['Formula', 'Công thức'], '아래 모듈을 눌러 계산식을 만드세요.': ['Select modules below to build a formula.', 'Chọn các mô-đun bên dưới để tạo công thức.'], '파라미터 모듈': ['Parameter modules', 'Mô-đun tham số'], '연산자': ['Operators', 'Toán tử'],
  '숫자 상수': ['Numeric constant', 'Hằng số'], '예: 할증률 1.5': ['e.g. multiplier 1.5', 'VD: hệ số 1.5'], '상수 추가': ['Add constant', 'Thêm hằng số'], '전체 지우기': ['Clear all', 'Xóa tất cả'], '취소': ['Cancel', 'Hủy'], '계산식 적용': ['Apply formula', 'Áp dụng công thức'],
  '급여 항목 추가': ['Add salary item', 'Thêm khoản lương'], '항목명': ['Item name', 'Tên khoản mục'], '예: 자격수당': ['e.g. qualification allowance', 'VD: phụ cấp chứng chỉ'], '급여 구분': ['Salary category', 'Phân loại lương'], '추가': ['Add', 'Thêm'],
};

export const salaryText = (text, languageCode) => {
  if (languageCode === 'ko') return text === '급여 수당' ? '수당' : text;
  if (!translations[text]) return text;
  return translations[text][languageCode === 'vi' ? 1 : 0];
};
