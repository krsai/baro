import {materialItemActions} from './materialTerminology.js';
export const materialVariantManagementText={
 ko:{...materialItemActions.ko,duplicate:'같은 소유자·타입·색상의 자재 품목이 이미 있습니다.',changed:'자재 품목이 변경되었습니다. 목록을 다시 조회해 주세요.'},
 en:{...materialItemActions.en,duplicate:'A material item with this owner, type and color already exists.',changed:'The material item changed. Reload the list.'},
 vi:{...materialItemActions.vi,duplicate:'Đã có mặt hàng vật tư với chủ sở hữu, loại và màu này.',changed:'Mặt hàng vật tư đã thay đổi. Tải lại danh sách.'},
};
export const variantManagementError=(error,t)=>error?.message==='VARIANT_IN_USE'?t.inUse:error?.message==='VARIANT_DUPLICATE'?t.duplicate:['VARIANT_CHANGED','ACCOUNTING_INDUSTRY_CHANGED','VARIANT_NOT_FOUND'].includes(error?.message)?t.changed:t.failed;
