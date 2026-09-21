/**
 * algorithms/dijkstra.js
 * Dijkstra's single-source shortest-path algorithm.
 * Pure function — no DOM, no side effects.
 *
 * Algorithm Steps:
 *  1. Initialise all distances to Infinity, source to 0.
 *  2. Push source into a min-priority queue.
 *  3. While the queue is non-empty:
 *     a. Extract the node with the smallest tentative distance (u).
 *     b. For each neighbour v connected to u:
 *        - Compute alt = dist[u] + weight(u, v).
 *        - If alt < dist[v], relax: dist[v] = alt, pred[v] = u, push v.
 *  4. Return { distances, predecessors }.
 *
 * Complexity: O((V + E) log V) with a binary heap priority queue.
 */

/**
 * @param {import('../models/Graph.js').Graph} graph
 * @param {string} sourceId
 * @returns {{ distances: Object<string,number>, predecessors: Object<string,string|null> }}
 */
export default function dijkstra(graph, sourceId) {
  const nodes       = graph.getNodes();
  const connections = graph.getConnections();

  // Step 1 — initialise
  const distances    = {};
  const predecessors = {};
  for (const n of nodes) {
    distances[n.id]    = Infinity;
    predecessors[n.id] = null;
  }
  distances[sourceId] = 0;

  // Simple min-priority queue backed by an array (sufficient for ≤ hundreds of nodes)
  const pq = [{ id: sourceId, dist: 0 }];

  // Step 3 — main loop
  while (pq.length > 0) {
    // Extract minimum
    pq.sort((a, b) => a.dist - b.dist);
    const { id: u } = pq.shift();

    // Build neighbour list from undirected connections
    const neighbours = connections
      .filter(c => c.sourceId === u || c.destId === u)
      .map(c => ({ id: c.sourceId === u ? c.destId : c.sourceId, weight: c.weight }));

    for (const { id: v, weight } of neighbours) {
      const alt = distances[u] + weight;
      if (alt < distances[v]) {
        distances[v]    = alt;
        predecessors[v] = u;
        pq.push({ id: v, dist: alt });
      }
    }
  }

  return { distances, predecessors };
}
