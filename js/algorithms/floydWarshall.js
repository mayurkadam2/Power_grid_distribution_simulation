/**
 * algorithms/floydWarshall.js
 * Floyd-Warshall all-pairs shortest-path algorithm.
 * Handles undirected graphs by initialising both directions.
 * Returns results in the same { distances, predecessors } format as Dijkstra.
 * Pure function — no DOM, no side effects.
 *
 * Algorithm Steps:
 *  1. Build an N×N distance matrix. dist[i][i]=0, dist[i][j]=weight if edge exists, else Infinity.
 *     Because the graph is undirected, set dist[u][v] = dist[v][u] = weight.
 *  2. Also build a "next" matrix for path reconstruction.
 *  3. For each intermediate node k (triple nested loop):
 *     - If dist[i][k] + dist[k][j] < dist[i][j], update dist and next.
 *  4. Extract the source row to produce the expected output format.
 *
 * Complexity: O(V³)
 */

/**
 * @param {import('../models/Graph.js').Graph} graph
 * @param {string} sourceId
 * @returns {{ distances: Object<string,number>, predecessors: Object<string,string|null> }}
 */
export default function floydWarshall(graph, sourceId) {
  const nodes       = graph.getNodes();
  const connections = graph.getConnections();
  const ids         = nodes.map(n => n.id);

  // Step 1 & 2 — initialise distance and next-hop matrices
  const dist = {};
  const next = {};
  for (const i of ids) {
    dist[i] = {};
    next[i] = {};
    for (const j of ids) {
      dist[i][j] = i === j ? 0 : Infinity;
      next[i][j] = null;
    }
  }

  // Populate direct edges (undirected — both directions)
  for (const c of connections) {
    const { sourceId: u, destId: v, weight: w } = c;
    if (w < dist[u][v]) { dist[u][v] = w; next[u][v] = v; }
    if (w < dist[v][u]) { dist[v][u] = w; next[v][u] = u; }
  }

  // Step 3 — main triple-loop
  for (const k of ids) {
    for (const i of ids) {
      for (const j of ids) {
        if (dist[i][k] !== Infinity && dist[k][j] !== Infinity) {
          const through = dist[i][k] + dist[k][j];
          if (through < dist[i][j]) {
            dist[i][j] = through;
            next[i][j] = next[i][k];
          }
        }
      }
    }
  }

  // Step 4 — extract source row into { distances, predecessors } format
  const distances    = {};
  const predecessors = {};

  for (const id of ids) {
    distances[id]    = dist[sourceId][id];
    predecessors[id] = null;

    if (id !== sourceId && dist[sourceId][id] !== Infinity) {
      // Walk the next-hop chain to find the node just before the target
      let curr = sourceId;
      let steps = 0;
      while (curr !== null && curr !== id && steps < ids.length) {
        const hop = next[curr][id];
        if (hop === id) { predecessors[id] = curr; break; }
        curr = hop;
        steps++;
      }
    }
  }

  return { distances, predecessors };
}
