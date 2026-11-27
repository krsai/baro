export const shippingOperationText={
 ko:{title:'운송장',overview:'운송장 정보',schedule:'담당·운송 일정',assignee:'운송장 담당자',vessel:'선박명',voyage:'항차',flight:'항공편',flightNumber:'편명',etd:'출발 예정일',eta:'도착 예정일',customer:'고객',route:'운송 구간',cargo:'화물',parties:'운송 당사자',shipper:'Shipper',consignee:'Consignee',notify:'Notify Party',request:'의뢰 내용',received:'접수 내용',documents:'연결 서류',progress:'진행',charges:'금액 초안',save:'저장',retry:'같은 요청 재시도',failed:'저장하지 못했습니다. 입력과 현재 버전을 확인하세요.',conflict:'다른 화면에서 변경되었습니다. 입력을 보존했습니다. 최신 자료를 확인하세요.',saved:'저장했습니다.',close:'닫기'},
 en:{title:'Waybill',overview:'Waybill Information',schedule:'Assignment & Schedule',assignee:'Waybill Assignee',vessel:'Vessel',voyage:'Voyage',flight:'Flight',flightNumber:'Flight Number',etd:'Estimated Departure',eta:'Estimated Arrival',customer:'Customer',route:'Route',cargo:'Cargo',parties:'Transport Parties',shipper:'Shipper',consignee:'Consignee',notify:'Notify Party',request:'View Request',received:'Received Information',documents:'Linked Documents',progress:'Progress',charges:'Charge Drafts',save:'Save',retry:'Retry Same Request',failed:'Could not save. Check the input and current version.',conflict:'Changed in another screen. Your input is preserved. Review the latest record.',saved:'Saved.',close:'Close'},
 vi:{title:'Phiếu Vận Chuyển',overview:'Thông Tin Nghiệp Vụ',schedule:'Phụ Trách & Lịch Trình',assignee:'Người Phụ Trách',vessel:'Tên Tàu',voyage:'Chuyến Tàu',flight:'Chuyến Bay',flightNumber:'Số Hiệu Chuyến Bay',etd:'Ngày Đi Dự Kiến',eta:'Ngày Đến Dự Kiến',customer:'Khách Hàng',route:'Tuyến Vận Chuyển',cargo:'Hàng Hóa',parties:'Các Bên Vận Chuyển',shipper:'Shipper',consignee:'Consignee',notify:'Notify Party',request:'Xem Yêu Cầu',received:'Thông Tin Tiếp Nhận',documents:'Chứng Từ Liên Kết',progress:'Tiến Độ',charges:'Nháp Chi Phí',save:'Lưu',retry:'Thử Lại Cùng Yêu Cầu',failed:'Không Thể Lưu. Kiểm Tra Dữ Liệu Và Phiên Bản.',conflict:'Dữ Liệu Đã Thay Đổi. Nội Dung Nhập Được Giữ Lại. Kiểm Tra Bản Mới Nhất.',saved:'Đã Lưu.',close:'Đóng'}
};

Object.assign(shippingOperationText.ko,{masterChoice:'mBL 등록',houseChoice:'hBL의 Master 선택',oneMaster:'One Master B/L',masterHouse:'Master + House B/L',existingMaster:'기존 Master B/L 찾기 · 연결',createMaster:'새 Master B/L 등록',forwarderUnavailable:'포워더 회사 정보를 불러온 뒤 다시 시도해 주세요.'});
Object.assign(shippingOperationText.en,{masterChoice:'Create mBL',houseChoice:'Choose Master For hBL',oneMaster:'One Master B/L',masterHouse:'Master + House B/L',existingMaster:'Find / Link Existing Master B/L',createMaster:'Create New Master B/L',forwarderUnavailable:'Load The Forwarder Company Information And Try Again.'});
Object.assign(shippingOperationText.vi,{masterChoice:'Tạo mBL',houseChoice:'Chọn Master Cho hBL',oneMaster:'One Master B/L',masterHouse:'Master + House B/L',existingMaster:'Tìm / Liên Kết Master B/L Hiện Có',createMaster:'Tạo Master B/L Mới',forwarderUnavailable:'Tải Thông Tin Công Ty Giao Nhận Và Thử Lại.'});

Object.assign(shippingOperationText.ko,{viewSr:'SR 보기',srUnavailable:'저장된 SR 원본이 없습니다.'});
Object.assign(shippingOperationText.en,{viewSr:'View SR',srUnavailable:'No Saved SR Original Is Available.'});
Object.assign(shippingOperationText.vi,{viewSr:'Xem SR',srUnavailable:'Không Có Bản Gốc SR Đã Lưu.'});

Object.assign(shippingOperationText.ko,{detail:'운송장',returnDetail:'운송장로 돌아가기',arAp:'AR/AP 입력',terms:'거래·운임 조건',packageCount:'포장 수량',applyDimensions:'치수 합계 적용'});
Object.assign(shippingOperationText.en,{detail:'Waybill',returnDetail:'Back to Waybill',arAp:'AR/AP Entry',terms:'Trade & Freight Terms',packageCount:'Package Count',applyDimensions:'Apply Dimension Totals'});
Object.assign(shippingOperationText.vi,{detail:'Phiếu Vận Chuyển',returnDetail:'Quay Lại Phiếu Vận Chuyển',arAp:'Nhập AR/AP',terms:'Điều Kiện Thương Mại & Cước',packageCount:'Số Kiện',applyDimensions:'Áp Dụng Tổng Kích Thước'});

Object.assign(shippingOperationText.ko,{"refresh":"최신 자료 확인","review":"최신 자료를 불러왔습니다. 유지된 입력을 확인한 뒤 저장하세요."});

Object.assign(shippingOperationText.en,{"refresh":"Review Latest Record","review":"Latest record loaded. Review your preserved input before saving."});

Object.assign(shippingOperationText.vi,{"refresh":"Xem Bản Mới Nhất","review":"Đã Tải Bản Mới. Kiểm Tra Nội Dung Được Giữ Lại Trước Khi Lưu."});

Object.assign(shippingOperationText.ko,{"masterSection":"공통 MBL","houseSection":"이 업무의 HBL","linkMaster":"기존 MBL 연결","newMaster":"MBL 등록","newHouse":"HBL 등록","openDocument":"열기 · 수정","unlink":"연결 해제","link":"연결","issuer":"발행사","masterSearch":"MBL 번호 · 발행사 검색","noMaster":"연결된 MBL이 없습니다.","noHouse":"등록된 HBL이 없습니다.","standaloneHouse":"MBL 미연결","sharedCount":"연결 업무 {count}건","unlinkConfirm":"{number}의 이 업무 연결을 해제하시겠습니까?","unlinkHouses":"이 업무의 HBL에서 MBL 연결을 먼저 해제해 주세요.","unlinkCharges":"금액이 연결되어 있어 이 업무에서 MBL을 해제할 수 없습니다.","loadingPort":"출발항","dischargePort":"도착항","originAirport":"출발 공항","destinationAirport":"도착 공항","pickup":"출발지","delivery":"도착지","notSpecified":"미지정","sourceCharges":"MBL 금액은 등록 업무에서 관리합니다."});

Object.assign(shippingOperationText.en,{"masterSection":"Shared MBL","houseSection":"HBLs for This Job","linkMaster":"Link Existing MBL","newMaster":"New MBL","newHouse":"New HBL","openDocument":"Open / Edit","unlink":"Unlink","link":"Link","issuer":"Issuer","masterSearch":"Search MBL Number / Issuer","noMaster":"No MBL Linked.","noHouse":"No HBL Registered.","standaloneHouse":"No MBL Linked","sharedCount":"{count} Linked Jobs","unlinkConfirm":"Unlink {number} from this job?","unlinkHouses":"Unlink this job’s HBLs from the MBL first.","unlinkCharges":"The MBL has charges in this job and cannot be unlinked.","loadingPort":"Port of Loading","dischargePort":"Port of Discharge","originAirport":"Departure Airport","destinationAirport":"Arrival Airport","pickup":"Origin","delivery":"Destination","notSpecified":"Not Specified","sourceCharges":"MBL Charges Are Managed in Its Source Job."});

Object.assign(shippingOperationText.vi,{"masterSection":"MBL Dùng Chung","houseSection":"HBL Của Công Việc Này","linkMaster":"Liên Kết MBL Có Sẵn","newMaster":"Tạo MBL","newHouse":"Tạo HBL","openDocument":"Mở / Sửa","unlink":"Gỡ Liên Kết","link":"Liên Kết","issuer":"Đơn Vị Phát Hành","masterSearch":"Tìm Số MBL / Đơn Vị Phát Hành","noMaster":"Chưa Liên Kết MBL.","noHouse":"Chưa Có HBL.","standaloneHouse":"Chưa Liên Kết MBL","sharedCount":"{count} Công Việc Liên Kết","unlinkConfirm":"Gỡ {number} Khỏi Công Việc Này?","unlinkHouses":"Gỡ Liên Kết MBL Trong HBL Của Công Việc Này Trước.","unlinkCharges":"MBL Có Chi Phí Trong Công Việc Này Nên Không Thể Gỡ.","loadingPort":"Cảng Xếp Hàng","dischargePort":"Cảng Dỡ Hàng","originAirport":"Sân Bay Đi","destinationAirport":"Sân Bay Đến","pickup":"Nơi Đi","delivery":"Nơi Đến","notSpecified":"Chưa Xác Định","sourceCharges":"Chi Phí MBL Được Quản Lý Trong Công Việc Gốc."});

Object.assign(shippingOperationText.ko,{placeOfReceipt:'\uD654\uBB3C \uC778\uC218\uC9C0',placeOfDelivery:'\uD654\uBB3C \uC778\uB3C4\uC9C0'});
Object.assign(shippingOperationText.en,{placeOfReceipt:'Place of Receipt',placeOfDelivery:'Place of Delivery'});
Object.assign(shippingOperationText.vi,{placeOfReceipt:'N\u01A1i Nh\u1EADn H\u00E0ng',placeOfDelivery:'N\u01A1i Giao H\u00E0ng'});

Object.assign(shippingOperationText.ko,{routeCompleted:'날짜 경과',routePending:'날짜 미경과'});
Object.assign(shippingOperationText.en,{routeCompleted:'Date Passed',routePending:'Date Not Passed'});
Object.assign(shippingOperationText.vi,{routeCompleted:'Đã Qua Ngày',routePending:'Chưa Qua Ngày'});
Object.assign(shippingOperationText.ko,{editSr:'SR 수정'});
Object.assign(shippingOperationText.en,{editSr:'Edit SR'});
Object.assign(shippingOperationText.vi,{editSr:'Sửa SR'});
