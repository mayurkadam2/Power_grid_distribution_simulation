/**
 * algorithms/allocation.js
 * Energy allocation algorithm — distributes available power to loads.
 * Pure function — no DOM, no side effects.
 *
 * Algorithm:
 *  For each load in priority-queue order (highest priority first):
 *    - Skip unreachable loads (status: Not Supplied).
 *    - If no energy remains, status: Not Supplied.
 *    - Otherwise allocate min(demand, remaining).
 *    - Status: Fully Supplied | Partially Supplied based on allocation vs demand.
 */

/**
 * @param {number} totalEnergy  - MW available from the power source
 * @param {Array}  queue        - Sorted array from PriorityQueue.build()
 * @returns {{ results: Array, remaining: number }}
 */
export function allocateEnergy(totalEnergy, queue) {
  let remaining = totalEnergy;
  const results = [];

  for (const item of queue) {
    if (!item.reachable || remaining <= 0) {
      results.push({ ...item, allocated: 0, status: 'Not Supplied' });
      continue;
    }

    const allocated = Math.min(item.demand, remaining);
    remaining -= allocated;

    const status = allocated === item.demand ? 'Fully Supplied' : 'Partially Supplied';
    results.push({ ...item, allocated, status });
  }

  return { results, remaining };
}
