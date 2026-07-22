export type AtTrainingOverlapState = {
  ownerBucketKeysByWorkerDate: Map<string, Set<string>>;
  ambiguousWorkerDateKeys: Set<string>;
  ambiguousBucketKeys: Set<string>;
};

export const createAtTrainingOverlapState = (): AtTrainingOverlapState => ({
  ownerBucketKeysByWorkerDate: new Map(),
  ambiguousWorkerDateKeys: new Set(),
  ambiguousBucketKeys: new Set(),
});

const WORKER_DATE_KEY_SEPARATOR = "::";

export const toAtTrainingWorkerDateKey = (workDate: string, workerId: number) =>
  `${workDate}${WORKER_DATE_KEY_SEPARATOR}${workerId}`;

export const parseAtTrainingWorkerDateKey = (workerDateKey: string) => {
  const separatorIndex = workerDateKey.lastIndexOf(WORKER_DATE_KEY_SEPARATOR);
  if (separatorIndex <= 0) return null;
  const workDate = workerDateKey.slice(0, separatorIndex);
  const workerId = Number(workerDateKey.slice(separatorIndex + WORKER_DATE_KEY_SEPARATOR.length));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate) || !Number.isInteger(workerId) || workerId <= 0) {
    return null;
  }
  return { workDate, workerId };
};

export const registerAtTrainingWorkerDayClaim = ({
  state,
  workerDateKey,
  bucketKey,
}: {
  state: AtTrainingOverlapState;
  workerDateKey: string;
  bucketKey: string;
}) => {
  const owners = state.ownerBucketKeysByWorkerDate.get(workerDateKey) ?? new Set<string>();
  owners.add(bucketKey);
  state.ownerBucketKeysByWorkerDate.set(workerDateKey, owners);
  if (owners.size <= 1) return;

  state.ambiguousWorkerDateKeys.add(workerDateKey);
  owners.forEach((ownerBucketKey) => state.ambiguousBucketKeys.add(ownerBucketKey));
};
