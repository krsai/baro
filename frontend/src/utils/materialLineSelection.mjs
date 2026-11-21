export function materialLineSelection(line,row){
 const data=row?.data||{},details={...line.details};
 for(const key of ['length','width','height']){delete details[key];if(data.details?.[key])details[key]=data.details[key];}
 return {materialSelectionRequired:false,materialItemId:row?.id||null,materialItemSnapshot:row?{id:row.id,baseId:row.baseId,industryId:row.industryId,unitId:row.unitId,...data}:null,itemOwnerOrgId:data.itemOwnerOrgId||null,itemOwnerSnapshot:data.itemOwnerSnapshot||null,itemCustomerId:data.itemCustomerId||null,itemTypeId:data.itemTypeId||null,itemAttributeSnapshot:data.itemAttributeSnapshot||null,unitId:row?.unitId||'',unit:data.unit||null,details};
}
