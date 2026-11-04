export const packagingText={
 ko:{section:'포장 정보',packedCbmPerPiece:'폴리백 포장 부피 (CBM/장)',volumeHint:'폴리백에 포장한 한 장의 부피를 입력하세요. 미입력 시 임의로 추정하지 않습니다.',boxLengthCm:'박스 길이 (cm)',boxWidthCm:'박스 너비 (cm)',boxHeightCm:'박스 높이 (cm)',boxVolume:'박스 부피',boxFit:'박스당 예상 수량',missingVolume:'스타일 포장 부피가 없으면 박스당 수량을 직접 입력하세요.',volumeEstimate:'부피 기준 예상치이며 실제 포장 형태에 따라 달라질 수 있습니다.'},
 en:{section:'Packaging',packedCbmPerPiece:'Polybag-packed volume (CBM/piece)',volumeHint:'Enter the volume of one garment packed in a polybag. Missing volume is never guessed.',boxLengthCm:'Box length (cm)',boxWidthCm:'Box width (cm)',boxHeightCm:'Box height (cm)',boxVolume:'Box volume',boxFit:'Estimated pieces per box',missingVolume:'Enter pieces per box when style packaging volume is missing.',volumeEstimate:'Volume-based estimate; actual packing may differ.'},
 vi:{section:'Thông tin đóng gói',packedCbmPerPiece:'Thể tích đã đóng túi (CBM/chiếc)',volumeHint:'Nhập thể tích một sản phẩm đã đóng túi. Không tự ước tính khi thiếu dữ liệu.',boxLengthCm:'Chiều dài thùng (cm)',boxWidthCm:'Chiều rộng thùng (cm)',boxHeightCm:'Chiều cao thùng (cm)',boxVolume:'Thể tích thùng',boxFit:'Số lượng ước tính mỗi thùng',missingVolume:'Nhập số lượng mỗi thùng khi chưa có thể tích đóng gói.',volumeEstimate:'Ước tính theo thể tích; cách đóng gói thực tế có thể khác.'}
};
packagingText.ko.invalidVolume='포장 부피는 0보다 크고 100 이하인 CBM으로 입력하세요.';
packagingText.en.invalidVolume='Enter a packed volume greater than 0 and at most 100 CBM.';
packagingText.vi.invalidVolume='Nhập thể tích lớn hơn 0 và không quá 100 CBM.';
