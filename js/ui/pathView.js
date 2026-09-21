/**
 * ui/pathView.js
 * Manages the Shortest Path section (Section 2).
 *
 * Responsibilities:
 *  - Render the graph with the current live graph data
 *  - Run the selected algorithm (Dijkstra, Bellman-Ford, Floyd-Warshall)
 *  - Show a formatted results table for each load node
 *  - Highlight shortest-path edges on the SVG in glowing green
 */

import dijkstra      from '../algorithms/dijkstra.js';
import bellmanFord   from '../algorithms/bellmanFord.js';
import floydWarshall from '../algorithms/floydWarshall.js';
import { PriorityQueue } from '../models/PriorityQueue.js';
import { NODE_TYPES }    from '../constants.js';
import { runForceLayout, renderGraph } from './graphRenderer.js';
import { showToast } from './toast.js';

/** @type {import('../models/Graph.js').Graph} */
let _graph;

/**
 * Refresh the SVG and optionally auto-calculate paths.
 * @param {boolean} autoRun - If true, computes shortest paths if a source node exists
 */
export function refreshPathGraph(autoRun = false) {
  if (!_graph) return;
  const nodes  = _graph.getNodes();
  const conns  = _graph.getConnections();
  const source = _graph.getSourceNode();

  const noMsg   = document.getElementById('sp-no-grid-msg');
  const content = document.getElementById('sp-content');

  if (nodes.length === 0) {
    if (noMsg)   noMsg.style.display   = 'block';
    if (content) content.style.display = 'none';
    const svg = document.getElementById('sp-graph-svg');
    if (svg) svg.innerHTML = '';
    const tbody = document.getElementById('sp-results-body');
    if (tbody) tbody.innerHTML = '';
    return;
  }

  if (noMsg)   noMsg.style.display   = 'none';
  if (content) content.style.display = 'block';

  if (source && autoRun) {
    runAlgorithm(false); // silent calculation, updates table & highlights
  } else {
    runForceLayout(nodes, conns, { width: 900, height: 500 });
    renderGraph('sp-graph-svg', nodes, conns, []);
  }
}

/**
 * Initialise the Shortest Path view.
 * @param {import('../models/Graph.js').Graph} graph
 */
export function initPathView(graph) {
  _graph = graph;

  const runBtn = document.getElementById('run-algorithm-btn');
  if (runBtn) {
    runBtn.addEventListener('click', () => runAlgorithm(true));
  }
}

/**
 * Run the selected shortest-path algorithm and display results.
 * @param {boolean} notify - Whether to show a toast message
 */
function runAlgorithm(notify = true) {
  const nodes  = _graph.getNodes();
  const source = _graph.getSourceNode();

  const noMsg   = document.getElementById('sp-no-grid-msg');
  const content = document.getElementById('sp-content');

  if (nodes.length === 0) {
    if (noMsg)   noMsg.style.display   = 'block';
    if (content) content.style.display = 'none';
    return;
  }

  if (!source) {
    if (notify) showToast('Grid must contain a Power Source to calculate shortest paths.', 'error');
    runForceLayout(nodes, _graph.getConnections(), { width: 900, height: 500 });
    renderGraph('sp-graph-svg', nodes, _graph.getConnections(), []);
    return;
  }

  if (noMsg)   noMsg.style.display   = 'none';
  if (content) content.style.display = 'block';

  const algoSelect = document.getElementById('algorithm-select');
  const algo = algoSelect ? algoSelect.value : 'dijkstra';

  let result;
  try {
    if (algo === 'dijkstra')            result = dijkstra(_graph, source.id);
    else if (algo === 'bellman-ford')   result = bellmanFord(_graph, source.id);
    else if (algo === 'floyd-warshall') result = floydWarshall(_graph, source.id);
    else result = dijkstra(_graph, source.id);
  } catch (e) {
    showToast(`Algorithm error: ${e.message}`, 'error');
    return;
  }

  const { distances, predecessors } = result;
  const loads = nodes.filter(n => n.type === NODE_TYPES.LOAD);
  const queue = PriorityQueue.build(loads, distances, predecessors);

  // Collect all edges that form any shortest path
  const highlightedEdges = [];
  for (const item of queue) {
    if (item.reachable && item.path) {
      for (let i = 0; i < item.path.length - 1; i++) {
        highlightedEdges.push({ sourceId: item.path[i], destId: item.path[i + 1] });
      }
    }
  }

  // Draw graph with active highlights
  runForceLayout(_graph.getNodes(), _graph.getConnections(), { width: 900, height: 500 });
  renderGraph('sp-graph-svg', _graph.getNodes(), _graph.getConnections(), highlightedEdges);

  // Populate results table
  const tbody = document.getElementById('sp-results-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (loads.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem;">No Load consumers in the grid. Add Load nodes in Grid Builder.</td></tr>`;
    return;
  }

  for (const item of queue) {
    const tr = document.createElement('tr');
    if (!item.reachable) tr.style.opacity = '0.55';
    tr.innerHTML = `
      <td><span class="type-badge load">Load</span> <strong>${escHtml(item.name)}</strong> <small style="color:var(--text-muted)">(${item.id})</small></td>
      <td><strong>${item.priority}</strong></td>
      <td>${item.demand} MW</td>
      <td>${item.reachable ? `<span style="color:var(--success);font-weight:500;">${item.path.join(' → ')}</span>` : '<span style="color:var(--danger)">Unreachable</span>'}</td>
      <td><strong>${item.reachable ? item.dist : '∞'}</strong></td>`;
    tbody.appendChild(tr);
  }

  if (notify) {
    const algoName = algoSelect ? algoSelect.options[algoSelect.selectedIndex].text : algo;
    showToast(`${algoName} calculated successfully.`, 'success');
  }
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
