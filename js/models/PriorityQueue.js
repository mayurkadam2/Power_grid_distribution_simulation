/**
 * models/PriorityQueue.js
 * Builds and sorts the energy-allocation queue from load nodes.
 * Pure data utility — no DOM access.
 */

export class PriorityQueue {
  /**
   * Build a sorted allocation queue from load nodes.
   * Sort order: priority DESC → distance ASC → id ASC (tie-break)
   *
   * @param {Array}  loadNodes    - All nodes with type === 'load'
   * @param {Object} distances    - Map nodeId → shortest distance from source
   * @param {Object} predecessors - Map nodeId → previous nodeId (for path reconstruction)
   * @returns {Array} Sorted array of queue items enriched with {reachable, dist, path}
   */
  static build(loadNodes, distances, predecessors) {
    const items = loadNodes.map(load => {
      const dist      = distances[load.id];
      const reachable = dist !== undefined && dist !== Infinity;
      const path      = reachable ? PriorityQueue._reconstructPath(predecessors, load.id) : null;
      return { ...load, reachable, dist: reachable ? dist : Infinity, path };
    });

    items.sort((a, b) => {
      // Unreachable loads go to the bottom
      if (a.reachable !== b.reachable) return a.reachable ? -1 : 1;
      // Highest priority first
      if (b.priority !== a.priority) return b.priority - a.priority;
      // Shorter distance first (for same priority)
      if (a.dist !== b.dist) return a.dist - b.dist;
      // Alphabetical ID as final tie-breaker
      return a.id.localeCompare(b.id);
    });

    return items;
  }

  /**
   * Walk back through predecessors to reconstruct the full path.
   * @param {Object} predecessors
   * @param {string} targetId
   * @returns {string[]|null} Ordered node IDs from source → target, or null if unreachable
   */
  static _reconstructPath(predecessors, targetId) {
    const path = [];
    let current = targetId;
    const visited = new Set();
    while (current !== null && current !== undefined) {
      if (visited.has(current)) return null; // cycle guard
      visited.add(current);
      path.unshift(current);
      current = predecessors[current];
    }
    return path.length > 0 ? path : null;
  }
}
