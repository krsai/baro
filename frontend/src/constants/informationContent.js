export const partnerHandledCodesInformation={
 ko:{title:'거래처별 취급 코드 지정',paragraphs:[
  '세부 업종에 속한 취급 코드를 묶어, 거래처가 취급하는 품목이나 수행하는 업무를 구체적으로 기록하기 위한 설정입니다.',
  '이 설정을 켠 세부 업종을 사용자가 거래처 등록·수정 시 선택하면, 해당 업종에 속한 취급 코드를 하나 이상 필수로 선택해야 합니다. 예를 들어 ‘의류 부자재’ 업체라면 카톤 박스·라벨 등 실제로 취급하는 품목을 지정합니다.',
  '세부 업종은 업체의 업종을, 취급 코드는 그 업체가 실제로 무엇을 취급하거나 어떤 일을 하는지를 나타냅니다. 자재 마스터 등록 대상을 정하는 ‘소속 코드를 자재로 사용’과는 별개의 설정입니다.',
 ]},
 en:{title:'Specify codes per business partner',paragraphs:[
  'This setting groups the business codes belonging to an industry so users can record the specific items a partner handles or the work it performs.',
  'When users select an industry with this setting enabled while adding or editing a partner, they must select at least one of its business codes. For example, a garment accessories partner may handle carton boxes, labels, or both.',
  'The industry describes the partner’s line of business; the selected codes describe its actual products or services. This is separate from “Use industry codes as materials”, which determines which codes are eligible for material master registration.',
 ]},
 vi:{title:'Chỉ định mã theo đối tác',paragraphs:[
  'Thiết lập này nhóm các mã nghiệp vụ thuộc một ngành nghề để người dùng ghi rõ mặt hàng đối tác kinh doanh hoặc công việc đối tác thực hiện.',
  'Khi thêm hoặc sửa đối tác và chọn ngành nghề đã bật thiết lập này, người dùng phải chọn ít nhất một mã nghiệp vụ thuộc ngành đó. Ví dụ, đối tác phụ liệu may mặc có thể kinh doanh thùng carton, nhãn hoặc cả hai.',
  'Ngành nghề thể hiện lĩnh vực hoạt động; các mã được chọn thể hiện sản phẩm hoặc dịch vụ thực tế của đối tác. Thiết lập này độc lập với “Sử dụng mã thuộc ngành làm vật tư”, dùng để xác định mã nào được đăng ký trong danh mục vật tư.',
 ]},
};

export const industryMaterialsInformation={
 ko:{title:'소속 코드를 자재로 사용',paragraphs:[
  '이 세부 업종에 속한 취급 코드를 자재 마스터에 등록할 수 있는 품목의 종류로 사용하도록 하는 설정입니다. 예를 들어 ‘의류 부자재’에서 활성화하면 카톤 박스·라벨 등의 코드를 바탕으로 자재를 등록할 수 있습니다.',
  '활성화된 코드의 수정 화면에는 ‘자재 마스터’ 설정이 표시됩니다. 여기서 소유자·구분·색상·치수 등 자재를 등록할 때 필수로 입력할 항목을 정합니다.',
  '자재 목록에서는 이 조건에 맞춰 실제 품목을 등록합니다. 예를 들어 카톤 박스에 소유자와 치수가 필수라면 ‘카톤 박스 · 바로 소유 · 500×400×300mm’처럼 구체적인 자재를 등록합니다. 이 스위치를 켜는 것만으로 자재 품목이 자동 생성되지는 않습니다.',
  '거래처의 실제 취급 품목·업무를 지정하는 ‘거래처별 취급 코드 지정’과는 별개입니다. ‘입력 항목’ 역시 독립된 설정이며 구체적인 적용처는 아직 미확정입니다.',
 ]},
 en:{title:'Use industry codes as materials',paragraphs:[
  'This setting makes the business codes belonging to this industry eligible for material master registration. For example, enabling it for garment accessories allows materials to be registered under codes such as carton boxes and labels.',
  'Eligible codes show a “Material master” section in their edit screen. Use it to set the required fields for material registration, such as owner, variant, color, and dimensions.',
  'Register specific items in the material list using those requirements. If carton boxes require an owner and dimensions, an item could be “Carton box · owned by BARO · 500×400×300 mm”. Enabling this switch does not automatically create material items.',
  'This is separate from “Specify codes per business partner”, which records the items or work a partner actually handles. “Input fields” is also an independent setting whose specific uses have not yet been finalized.',
 ]},
 vi:{title:'Dùng mã của ngành làm vật tư',paragraphs:[
  'Thiết lập này cho phép dùng các mã nghiệp vụ thuộc ngành nghề này để đăng ký trong danh mục vật tư. Ví dụ, bật cho ngành phụ liệu may mặc sẽ cho phép đăng ký vật tư theo mã thùng carton, nhãn và các mã thuộc ngành đó.',
  'Màn hình sửa các mã đủ điều kiện sẽ hiển thị phần “Danh mục vật tư”. Tại đây, thiết lập các trường bắt buộc khi đăng ký vật tư như chủ sở hữu, phân loại, màu sắc và kích thước.',
  'Đăng ký mặt hàng cụ thể trong danh sách vật tư theo các điều kiện này. Nếu thùng carton bắt buộc có chủ sở hữu và kích thước, có thể đăng ký “Thùng carton · BARO sở hữu · 500×400×300 mm”. Bật công tắc không tự động tạo mặt hàng vật tư.',
  'Thiết lập này độc lập với “Chỉ định mã theo đối tác”, dùng để ghi mặt hàng hoặc công việc thực tế của đối tác. “Trường nhập” cũng là thiết lập độc lập và chưa xác định cách áp dụng cụ thể.',
 ]},
};
