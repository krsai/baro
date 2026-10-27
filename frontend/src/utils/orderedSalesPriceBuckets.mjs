// Each order selects its own style-total tier. Never add separate orders together.
export function orderedSalesPriceBuckets(orderQuantities = [], quantities = []) {
  const buckets = [...new Set(quantities.map(Number).filter(value => Number.isSafeInteger(value) && value > 0))].sort((a,b)=>a-b);
  if (!buckets.length) return new Set();
  return new Set(orderQuantities.filter(value => Number.isSafeInteger(value) && value > 0).map(quantity => {
    let selected = buckets[0];
    for (const bucket of buckets) if (quantity >= bucket) selected = bucket;
    return selected;
  }));
}
