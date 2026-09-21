/**
 * ui/simulationView.js
 * Manages the Power Distribution Simulation section (Section 3).
 *
 * Responsibilities:
 *  - Prepare priority queue and summary stats on tab switch
 *  - Step through energy allocation one consumer at a time
 *  - Update queue UI, allocation table, and live energy stats
 *  - Highlight the active consumer's path on the SVG during allocation
 */

import dijkstra          from '../algorithms/dijkstra.js';
import { PriorityQueue }  from '../models/PriorityQueue.js';
import { NODE_TYPES }     from '../constants.js';
import { runForceLayout, renderGraph } from './graphRenderer.js';
import { showToast } from './toast.js';

/** @type {import('../models/Graph.js').Graph} */
let _graph;

// Simulation state
let _simState = null;  // { queue, totalEnergy, remaining, index, results }
let _simTimer = null;

/**
 * Refresh and prepare the Simulation section (called on tab switch).
 */
export function refreshSimGraph() {
  if (!_graph) return;
  const nodes  = _graph.getNodes();
  const conns  = _graph.getConnections();
  const source = _graph.getSourceNode();

  const noMsg   = document.getElementById('pd-no-grid-msg');
  const content = document.getElementById('pd-content');

  if (nodes.length === 0) {
    if (noMsg)   noMsg.style.display   = 'block';
    if (content) content.style.display = 'none';
    const svg = document.getElementById('pd-graph-svg');
    if (svg) svg.innerHTML = '';
    return;
  }

  if (noMsg)   noMsg.style.display   = 'none';
  if (content) content.style.display = 'block';

  // Draw current graph
  runForceLayout(nodes, conns, { width: 900, height: 500 });
  renderGraph('pd-graph-svg', nodes, conns, []);

  // If simulation is not actively running, prepare the queue preview
  if (!_simState || _simState.index === 0) {
    prepareQueuePreview(source);
  }
}

/**
 * Prepare queue preview and summary displays before simulation runs.
 * @param {Object|null} source
 */
function prepareQueuePreview(source) {
  const nodes = _graph.getNodes();
  const energyInput = document.getElementById('total-energy-input');

  let availableEnergy = 100;
  if (source && typeof source.availableEnergy === 'number') {
    availableEnergy = source.availableEnergy;
    if (energyInput) energyInput.value = availableEnergy;
  } else if (energyInput && parseFloat(energyInput.value) > 0) {
    availableEnergy = parseFloat(energyInput.value);
  }

  const loads = nodes.filter(n => n.type === NODE_TYPES.LOAD);
  const totalDemand = loads.reduce((sum, l) => sum + (l.demand || 0), 0);

  let queue = [];
  if (source) {
    const { distances, predecessors } = dijkstra(_graph, source.id);
    queue = PriorityQueue.build(loads, distances, predecessors);
  } else {
    // Unreachable if no source
    queue = loads.map(l => ({ ...l, reachable: false, dist: Infinity, path: null }));
  }

  renderQueueUI(queue);
  updateStats(0, totalDemand, availableEnergy);
  setRemainingDisplay(availableEnergy);

  // Clear allocation table preview
  const tbody = document.getElementById('pd-results-body');
  if (tbody && (!_simState || _simState.results.length === 0)) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem;">Click "Start Simulation" or "Step" to begin energy allocation.</td></tr>`;
  }
}

/**
 * Initialise the Simulation view.
 * @param {import('../models/Graph.js').Graph} graph
 */
export function initSimulationView(graph) {
  _graph = graph;

  const startBtn = document.getElementById('start-sim-btn');
  const stepBtn  = document.getElementById('step-sim-btn');
  const resetBtn = document.getElementById('reset-sim-btn');

  if (startBtn) startBtn.addEventListener('click', startSimulation);
  if (stepBtn)  stepBtn.addEventListener('click',  stepSimulation);
  if (resetBtn) resetBtn.addEventListener('click', resetSimulation);
}

// ── Simulation Control ───────────────────────────────────────────────────────

function initSimState() {
  const nodes  = _graph.getNodes();
  const source = _graph.getSourceNode();

  const noMsg   = document.getElementById('pd-no-grid-msg');
  const content = document.getElementById('pd-content');

  if (nodes.length === 0) {
    if (noMsg)   noMsg.style.display   = 'block';
    if (content) content.style.display = 'none';
    showToast('Add nodes in Grid Builder first.', 'error');
    return false;
  }

  if (!source) {
    showToast('Grid must contain a Power Source to distribute energy.', 'error');
    return false;
  }

  if (noMsg)   noMsg.style.display   = 'none';
  if (content) content.style.display = 'block';

  const energyInput = document.getElementById('total-energy-input');
  const inputVal    = energyInput ? parseFloat(energyInput.value) : NaN;
  const totalEnergy = (!isNaN(inputVal) && inputVal >= 0) ? inputVal : source.availableEnergy;

  const { distances, predecessors } = dijkstra(_graph, source.id);
  const loads = nodes.filter(n => n.type === NODE_TYPES.LOAD);

  if (loads.length === 0) {
    showToast('No Load nodes to supply energy to.', 'info');
    return false;
  }

  const queue = PriorityQueue.build(loads, distances, predecessors);

  _simState = {
    queue,
    totalEnergy,
    remaining: totalEnergy,
    index: 0,
    results: [],
  };

  // Reset UI
  renderQueueUI(queue);
  const tbody = document.getElementById('pd-results-body');
  if (tbody) tbody.innerHTML = '';

  const totalDemand = queue.reduce((s, i) => s + (i.demand || 0), 0);
  updateStats(0, totalDemand, totalEnergy);
  setRemainingDisplay(totalEnergy);

  // Draw clean graph
  runForceLayout(_graph.getNodes(), _graph.getConnections(), { width: 900, height: 500 });
  renderGraph('pd-graph-svg', _graph.getNodes(), _graph.getConnections(), []);

  return true;
}

function startSimulation() {
  if (!_simState || _simState.index >= _simState.queue.length) {
    if (!initSimState()) return;
  }

  if (_simTimer) {
    clearInterval(_simTimer);
    _simTimer = null;
  }

  _simTimer = setInterval(() => {
    const hasMore = processNextItem();
    if (!hasMore) {
      clearInterval(_simTimer);
      _simTimer = null;
      showToast('Simulation complete! All consumer allocations finished.', 'success');
    }
  }, 800);

  showToast('Power distribution simulation started.', 'info');
}

function stepSimulation() {
  if (!_simState || _simState.index >= _simState.queue.length) {
    if (!initSimState()) return;
  }
  const hasMore = processNextItem();
  if (!hasMore) {
    if (_simTimer) { clearInterval(_simTimer); _simTimer = null; }
    showToast('Simulation complete!', 'success');
  }
}

function resetSimulation() {
  if (_simTimer) { clearInterval(_simTimer); _simTimer = null; }
  _simState = null;
  initSimState();
  showToast('Simulation reset to initial state.', 'info');
}

// ── Core Step ────────────────────────────────────────────────────────────────

/**
 * Process one item from the queue and update the UI.
 * @returns {boolean} true if there are more items to process
 */
function processNextItem() {
  if (!_simState || _simState.index >= _simState.queue.length) return false;

  const item = _simState.queue[_simState.index];

  // Highlight active queue item
  document.querySelectorAll('.queue-item').forEach(el => el.classList.remove('active'));
  const qEl = document.getElementById(`queue-item-${item.id}`);
  if (qEl) qEl.classList.add('active');

  // Allocate energy
  let allocated = 0;
  let status    = 'Not Supplied';
  if (item.reachable && _simState.remaining > 0) {
    allocated = Math.min(item.demand, _simState.remaining);
    _simState.remaining -= allocated;
    status = (allocated === item.demand) ? 'Fully Supplied' : 'Partially Supplied';
  }

  const resultItem = { ...item, allocated, status };
  _simState.results.push(resultItem);

  // Mark queue item as processed
  if (qEl) {
    qEl.classList.remove('active');
    qEl.classList.add('processed');
    const cls = status === 'Fully Supplied' ? 'fully-supplied'
              : status === 'Partially Supplied' ? 'partially-supplied'
              : 'not-supplied';
    qEl.classList.add(cls);
  }

  // Append row to results table
  appendResultRow(resultItem);

  // Update stats
  const supplied    = _simState.totalEnergy - _simState.remaining;
  const totalDemand = _simState.queue.reduce((s, i) => s + i.demand, 0);
  updateStats(supplied, totalDemand, _simState.remaining);
  setRemainingDisplay(_simState.remaining);

  // Highlight path on SVG from source to this load
  if (item.reachable && item.path && allocated > 0) {
    const edges = [];
    for (let i = 0; i < item.path.length - 1; i++) {
      edges.push({ sourceId: item.path[i], destId: item.path[i + 1] });
    }
    renderGraph('pd-graph-svg', _graph.getNodes(), _graph.getConnections(), edges);
  }

  _simState.index++;
  return _simState.index < _simState.queue.length;
}

// ── UI Helpers ───────────────────────────────────────────────────────────────

function renderQueueUI(queue) {
  const list = document.getElementById('priority-queue-list');
  if (!list) return;
  list.innerHTML = '';

  if (queue.length === 0) {
    list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:1.5rem;">No Load consumers found in the grid.</div>`;
    return;
  }

  for (const item of queue) {
    const div = document.createElement('div');
    div.className = 'queue-item';
    div.id = `queue-item-${item.id}`;
    div.innerHTML = `
      <div class="priority-badge" title="Priority ${item.priority}">${item.priority}</div>
      <div class="queue-details">
        <strong>${escHtml(item.name)} <small style="color:var(--text-muted)">(${item.id})</small></strong><br>
        <span>Demand: <strong>${item.demand} MW</strong> | ${item.reachable ? `Dist: <strong>${item.dist}</strong>` : '<span style="color:var(--danger)">Unreachable</span>'}</span>
      </div>`;
    list.appendChild(div);
  }
}

function appendResultRow(item) {
  const tbody = document.getElementById('pd-results-body');
  if (!tbody) return;

  // Clear placeholder if present
  if (_simState && _simState.results.length === 1) {
    tbody.innerHTML = '';
  }

  const statusClass = item.status === 'Fully Supplied'   ? 'status-full'
                    : item.status === 'Partially Supplied' ? 'status-partial'
                    : 'status-none';
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><strong>${escHtml(item.name)}</strong> <small style="color:var(--text-muted)">(${item.id})</small></td>
    <td><strong>${item.priority}</strong></td>
    <td>${item.demand} MW</td>
    <td style="color:var(--primary);font-weight:600;">${item.allocated} MW</td>
    <td><span class="status-badge ${statusClass}">${item.status}</span></td>`;
  tbody.appendChild(tr);
}

function updateStats(supplied, demand, remaining) {
  const s = document.getElementById('total-supplied-display');
  const d = document.getElementById('total-demand-display');
  const r = document.getElementById('total-remaining-display');
  if (s) s.textContent = `${supplied} MW`;
  if (d) d.textContent = `${demand} MW`;
  if (r) r.textContent = `${remaining} MW`;
}

function setRemainingDisplay(value) {
  const el = document.getElementById('remaining-energy-display');
  if (el) el.textContent = value;
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
