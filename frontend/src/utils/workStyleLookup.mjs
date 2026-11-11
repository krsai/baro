export function buildWorkStyleLookupOptions(assignments,overview){
 const byAssignment=new Map(overview.flatMap(group=>(group.assignmentIds||[]).map(id=>[String(id),group])));
 const represented=new Set();
 const selectable=assignments.map(option=>{const group=byAssignment.get(String(option.id));if(group)represented.add(group);return {...option,lookupOverview:group||null,isAssigned:true};});
 return [...selectable,...overview.filter(group=>!represented.has(group)).map(group=>({id:`work-style:${group.workOrderId}:${group.styleId}`,label:group.styleName||group.styleCode,styleCode:group.styleCode,orderNo:group.orderNo,lookupOverview:group,lookupReadOnly:true,isAssigned:group.isAssigned,factoryName:(group.factoryNames||[]).join(', ')}))];
}
export function workStyleProgressText(option,format,unknown){
 const group=option.lookupOverview;
 if(!group)return unknown;
 return `${group.producedQuantity==null?unknown:format(group.producedQuantity)} / ${format(group.orderedQuantity)}`;
}
export const workStyleLookupText={
 ko:{status:'배정 상태',assigned:'배정',unassigned:'미배정',progress:'누적 완성 / 주문 수량',factory:'배정 공장',assignFirst:'배정 후 선택',checkAssignment:'배정·CT 확인 필요',unknown:'확인 필요'},
 en:{status:'Assignment',assigned:'Assigned',unassigned:'Unassigned',progress:'Completed / ordered',factory:'Assigned factory',assignFirst:'Assign before selecting',checkAssignment:'Check assignment / CT',unknown:'Needs review'},
 vi:{status:'Phân công',assigned:'Đã phân công',unassigned:'Chưa phân công',progress:'Hoàn thành / đặt hàng',factory:'Nhà máy được phân công',assignFirst:'Phân công trước khi chọn',checkAssignment:'Kiểm tra phân công / CT',unknown:'Cần kiểm tra'}
};
