// Keep timing inputs intact: the list uses the same PT/ST/AT and reliability
// calculation as the detail page. Omit editable metadata and BOM payloads.
export const toStyleListResponse = (style: any) => ({
  id: style.id, ownerOrgId: style.ownerOrgId, customerOrgId: style.customerOrgId,
  name: style.name, styleCode: style.styleCode, customer: style.customer,
  customerNameKo: style.customerNameKo, customerNameVi: style.customerNameVi,
  registrationDate: style.registrationDate, createdAt: style.createdAt,
  canDelete: style.canDelete, hasWorkRecords: style.hasWorkRecords,
  workRecordCount: style.workRecordCount, deleteBlockedReason: style.deleteBlockedReason,
  timeBucketQuantities: style.timeBucketQuantities,
  processes: style.processes.map((process: any) => ({
    pt: process.pt, ct: process.ct, stManual: process.stManual,
    stBuckets: process.stBuckets?.map((bucket: any) => ({
      bucketQuantity: bucket.bucketQuantity, bucketStSeconds: bucket.bucketStSeconds,
    })),
    timeRefQuantity: process.timeRefQuantity, timesPerPiece: process.timesPerPiece,
    processComposition: process.processComposition,
    atParams: process.atParams, atV2Observations: process.atV2Observations,
    atSharedPrediction: process.atSharedPrediction,
    atStFallbackApproved: process.atStFallbackApproved,
  })),
});
