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
