// Internal work values are independent of the customer's request and saved bills.
export const workFieldLimits:Record<string,number>={shipper:2000,consignee:2000,notify:2000,origin:1000,destination:1000,placeOfReceipt:1000,placeOfDelivery:1000,cargo:4000,marks:2000,quantity:30,unit:40,weightKg:30,cbm:30,cbmFormula:200,chargeableWeightKg:30,freightTerms:200,incoterms:80,remark:4000,plannedDate:10,routeDateORIGIN_DOOR:10,routeDateORIGIN_TERMINAL:10,routeDateDESTINATION_TERMINAL:10,routeDateDESTINATION_DOOR:10};
export function shippingWorkData(data:any){return {...data,...data.workDetails};}
