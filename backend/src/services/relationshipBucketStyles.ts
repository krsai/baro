export type RelationshipBucketStyleState = {
  id: number;
  salesBucketOverrides: Array<{ id: number }>;
  timeBucketOverrides: Array<{ id: number }>;
};

export const partitionRelationshipBucketStyles = (
  styles: RelationshipBucketStyleState[]
) => ({
  salesDefaultStyles: styles.filter(
    (style) => style.salesBucketOverrides.length === 0
  ),
  timeDefaultStyles: styles.filter(
    (style) => style.timeBucketOverrides.length === 0
  ),
});
