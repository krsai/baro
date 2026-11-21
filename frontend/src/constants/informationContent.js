export const partnerHandledCodesInformation={
 ko:{title:'거래처별 취급 코드 지정',paragraphs:[
  '세부 업종에 속한 취급 코드를 묶어, 거래처가 취급하는 품목이나 수행하는 업무를 구체적으로 기록하기 위한 설정입니다.',
  '이 설정을 켠 세부 업종을 사용자가 거래처 등록·수정 시 선택하면, 해당 업종에 속한 취급 코드를 하나 이상 필수로 선택해야 합니다. 예를 들어 ‘의류 부자재’ 업체라면 카톤 박스·라벨 등 실제로 취급하는 품목을 지정합니다.',
  '세부 업종은 업체의 업종을, 취급 코드는 그 업체가 실제로 무엇을 취급하거나 어떤 일을 하는지를 나타냅니다. 자재 품목 등록에 사용할 코드를 정하는 ‘소속 코드를 자재로 활용’과는 별개의 설정입니다.',
 ]},
 en:{title:'Specify codes per business partner',paragraphs:[
  'This setting groups the business codes belonging to an industry so users can record the specific items a partner handles or the work it performs.',
  'When users select an industry with this setting enabled while adding or editing a partner, they must select at least one of its business codes. For example, a garment accessories partner may handle carton boxes, labels, or both.',
  'The industry describes the partner’s line of business; the selected codes describe its actual products or services. This is separate from “Use industry codes as materials”, which enables codes for registering material items.',
 ]},
 vi:{title:'Chỉ định mã theo đối tác',paragraphs:[
  'Thiết lập này nhóm các mã nghiệp vụ thuộc một ngành nghề để người dùng ghi rõ mặt hàng đối tác kinh doanh hoặc công việc đối tác thực hiện.',
  'Khi thêm hoặc sửa đối tác và chọn ngành nghề đã bật thiết lập này, người dùng phải chọn ít nhất một mã nghiệp vụ thuộc ngành đó. Ví dụ, đối tác phụ liệu may mặc có thể kinh doanh thùng carton, nhãn hoặc cả hai.',
  'Ngành nghề thể hiện lĩnh vực hoạt động; các mã được chọn thể hiện sản phẩm hoặc dịch vụ thực tế của đối tác. Thiết lập này độc lập với “Dùng mã của ngành làm vật tư”, dùng để cho phép đăng ký mặt hàng vật tư theo mã.',
 ]},
};

export const industryMaterialsInformation={
 ko:{title:'소속 코드를 자재로 활용',paragraphs:[
  '이 세부 업종의 취급 코드를 자재 품목 등록에 사용할 수 있도록 합니다. SYSTEM에서 코드의 품명·단위와 자재 품목 등록 항목을 설정합니다.',
  '회사의 자재 마스터는 실제 등록된 자재 품목을 관리하는 곳입니다. 예를 들어 카톤 박스 코드에 소유자·타입·색상을 지정해 수량을 구분해 관리할 자재 품목을 등록합니다. 품목 등록 자체로 재고 수량이 생기지는 않습니다.',
  '비용 신청에서 자재로 활용하는 코드를 선택하면 등록된 자재 품목을 바로 선택합니다. 거래처별 취급 코드 지정과 일반 업무의 입력 항목 설정은 별개입니다.',
 ]},
 en:{title:'Use industry codes as materials',paragraphs:[
  'This setting makes the industry’s business codes available for registering material items. SYSTEM defines code names, units and material item registration fields.',
  'The company material master manages actual registered material items, such as carton boxes with an owner, type and color. Quantities are tracked separately for these items; registration itself does not create stock.',
  'Selecting a material-enabled expense code immediately opens the registered material item selection. Partner handled codes and general transaction input settings remain separate.',
 ]},
 vi:{title:'Dùng mã của ngành làm vật tư',paragraphs:[
  'Thiết lập này cho phép dùng mã nghiệp vụ của ngành để đăng ký mặt hàng vật tư. SYSTEM quy định tên mã, đơn vị và trường đăng ký mặt hàng vật tư.',
  'Danh mục vật tư của công ty quản lý các mặt hàng đã đăng ký, ví dụ thùng carton có chủ sở hữu, loại và màu cụ thể. Số lượng được quản lý riêng theo mặt hàng; đăng ký không tự tạo tồn kho.',
  'Chọn mã chi phí được dùng làm vật tư sẽ mở ngay danh sách mặt hàng đã đăng ký. Mã đối tác kinh doanh và trường nhập giao dịch thông thường vẫn là các thiết lập riêng.',
 ]},
};
