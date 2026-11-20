export const partnerHandledCodesInformation={
 ko:{title:'거래처별 취급 코드 지정',paragraphs:[
  '세부 업종에 속한 취급 코드를 묶어, 거래처가 취급하는 품목이나 수행하는 업무를 구체적으로 기록하기 위한 설정입니다.',
  '이 설정을 켠 세부 업종을 사용자가 거래처 등록·수정 시 선택하면, 해당 업종에 속한 취급 코드를 하나 이상 필수로 선택해야 합니다. 예를 들어 ‘의류 부자재’ 업체라면 카톤 박스·라벨 등 실제로 취급하는 품목을 지정합니다.',
  '세부 업종은 업체의 업종을, 취급 코드는 그 업체가 실제로 무엇을 취급하거나 어떤 일을 하는지를 나타냅니다. 자재 마스터에 표시할 코드를 정하는 ‘소속 코드를 자재로 사용’과는 별개의 설정입니다.',
 ]},
 en:{title:'Specify codes per business partner',paragraphs:[
  'This setting groups the business codes belonging to an industry so users can record the specific items a partner handles or the work it performs.',
  'When users select an industry with this setting enabled while adding or editing a partner, they must select at least one of its business codes. For example, a garment accessories partner may handle carton boxes, labels, or both.',
  'The industry describes the partner’s line of business; the selected codes describe its actual products or services. This is separate from “Use industry codes as materials”, which determines which codes appear in the material master.',
 ]},
 vi:{title:'Chỉ định mã theo đối tác',paragraphs:[
  'Thiết lập này nhóm các mã nghiệp vụ thuộc một ngành nghề để người dùng ghi rõ mặt hàng đối tác kinh doanh hoặc công việc đối tác thực hiện.',
  'Khi thêm hoặc sửa đối tác và chọn ngành nghề đã bật thiết lập này, người dùng phải chọn ít nhất một mã nghiệp vụ thuộc ngành đó. Ví dụ, đối tác phụ liệu may mặc có thể kinh doanh thùng carton, nhãn hoặc cả hai.',
  'Ngành nghề thể hiện lĩnh vực hoạt động; các mã được chọn thể hiện sản phẩm hoặc dịch vụ thực tế của đối tác. Thiết lập này độc lập với “Sử dụng mã thuộc ngành làm vật tư”, dùng để xác định mã nào xuất hiện trong danh mục vật tư.',
 ]},
};

export const industryMaterialsInformation={
 ko:{title:'소속 코드를 자재로 사용',paragraphs:[
  '이 세부 업종에 속한 취급 코드를 회사의 자재 마스터에 표시하도록 하는 설정입니다. 예를 들어 ‘의류 부자재’에서 활성화하면 카톤 박스·라벨 등의 코드가 자재 마스터에 표시됩니다.',
  '품명·단위 등 자재 기준은 시스템에서 설정합니다. 회사는 자재 마스터에서 이를 조회하고 입출고에서 소유자·타입·색상에 따른 개별 품목을 선택하거나 등록합니다.',
  '거래처의 실제 취급 품목·업무를 지정하는 ‘거래처별 취급 코드 지정’과는 별개입니다. ‘입력 항목’ 역시 독립된 설정이며 구체적인 적용처는 아직 미확정입니다.',
 ]},
 en:{title:'Use industry codes as materials',paragraphs:[
  'This setting displays the industry’s business codes in the company’s material master. For example, enabling it for garment accessories displays carton box and label codes.',
  'Material names, units and other definitions are configured in SYSTEM. Companies view the material master and select or register individual items by owner, type and color when recording stock movements.',
  'This is separate from “Specify codes per business partner”, which records the items or work a partner actually handles. “Input fields” is also an independent setting whose specific uses have not yet been finalized.',
 ]},
 vi:{title:'Dùng mã của ngành làm vật tư',paragraphs:[
  'Thiết lập này hiển thị mã nghiệp vụ của ngành trong danh mục vật tư của công ty. Ví dụ, bật cho ngành phụ liệu may mặc sẽ hiển thị mã thùng carton và nhãn.',
  'Tên vật tư, đơn vị và các thông tin chuẩn được thiết lập tại SYSTEM. Công ty xem danh mục vật tư và chọn hoặc đăng ký mặt hàng theo chủ sở hữu, loại và màu khi nhập xuất kho.',
  'Thiết lập này độc lập với “Chỉ định mã theo đối tác”, dùng để ghi mặt hàng hoặc công việc thực tế của đối tác. “Trường nhập” cũng là thiết lập độc lập và chưa xác định cách áp dụng cụ thể.',
 ]},
};
