export const validateDailyWorkLogRoster = ({ workerIds, records, reviews }: {
  workerIds: number[]; records: { workerId?: number | null }[];
  reviews: { workerId: number; noWork: boolean }[];
}) => {
  const expected = new Set(workerIds);
  const worked = new Set(records.map(row => row.workerId));
  const reviewed = new Set<number>();
  for (const review of reviews) {
    if (!expected.has(review.workerId) || reviewed.has(review.workerId) || typeof review.noWork !== 'boolean') return 'WORK_LOG_ROSTER_INVALID';
    if (review.noWork === worked.has(review.workerId)) return 'WORK_LOG_ROSTER_WORK_CONFLICT';
    reviewed.add(review.workerId);
  }
  if (reviews.length !== expected.size || [...worked].some(id => !id || !expected.has(id))) return 'WORK_LOG_ROSTER_INCOMPLETE';
  return null;
};
