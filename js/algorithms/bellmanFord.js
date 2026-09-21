/**
 * algorithms/bellmanFord.js
 * Bellman-Ford single-source shortest-path algorithm.
 * Handles undirected graphs by processing each edge in both directions.
 * Pure function — no DOM, no side effects.
 *
 * Algorithm Steps:
 *  1. Initialise all distances to Infinity, source to 0.
 *  2. Repeat |V|−1 times:
 *     a. For every edge (u, v, w) — both directions (undirected):
 *        - Relax: if dist[u] + w < dist[v], update dist[v] and pred[v].
 *  3. Check for negative-weight cycles (should not occur for power grids).
 *  4. Return { distances, predecessors }.
 *
 * Complexity: O(V · E)
 */

/**
 * @param {import('../models/Graph.js').Graph} graph
 * @param {string} sourceId
 * @returns {{ distances: Object<string,number>, predecessors: Object<string,string|null> }}
 */
export default function bellmanFord(graph, sourceId) {
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

  const V = nodes.length;

  // Step 2 — relax all edges |V|−1 times
  for (let i = 0; i < V - 1; i++) {
    for (const edge of connections) {
      const { sourceId: u, destId: v, weight: w } = edge;

      // Forward direction
      if (distances[u] !== Infinity && distances[u] + w < distances[v]) {
        distances[v]    = distances[u] + w;
        predecessors[v] = u;
      }
      // Reverse direction (undirected)
      if (distances[v] !== Infinity && distances[v] + w < distances[u]) {
        distances[u]    = distances[v] + w;
        predecessors[u] = v;
      }
    }
  }

  // Step 3 — negative-cycle detection (both directions)
  for (const edge of connections) {
    const { sourceId: u, destId: v, weight: w } = edge;
    if (distances[u] !== Infinity && distances[u] + w < distances[v]) {
      throw new Error('Graph contains a negative-weight cycle.');
    }
    if (distances[v] !== Infinity && distances[v] + w < distances[u]) {
      throw new Error('Graph contains a negative-weight cycle.');
    }
  }

  return { distances, predecessors };
}
