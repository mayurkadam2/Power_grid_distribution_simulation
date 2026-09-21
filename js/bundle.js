/**
 * js/bundle.js
 * Standalone distribution bundle for the Power Grid Simulator.
 * Contains all models, algorithms, and UI views in a self-contained IIFE.
 * Enables the application to work seamlessly when opened directly via file://
 * (where browser CORS restrictions block standard ES module script tags).
 */

(function() {
  'use strict';

  // Prevent double initialization if ES Modules already ran
  if (window.__powerGridInitialized) return;
  window.__powerGridInitialized = true;

  // ── 1. Constants ────────────────────────────────────────────────────────────
  const NODE_TYPES = Object.freeze({
    SOURCE:     'source',
    STATION:    'station',
    SUBSTATION: 'substation',
    LOAD:       'load',
  });

  const PRIORITY_MIN = 0;
  const PRIORITY_MAX = 9;

  const NODE_COLORS = Object.freeze({
    source:     '#ff6b35',
    station:    '#4ecdc4',
    substation: '#a78bfa',
    load:       '#f472b6',
  });

  const NODE_RADII = Object.freeze({
    source:     22,
    station:    18,
    substation: 16,
    load:       14,
  });

  const PATH_COLOR = '#10b981';
  const DEFAULT_EDGE_COLOR = 'rgba(100,100,255,0.3)';
  const STORAGE_KEY = 'powerGridData';

  const DEFAULT_SAMPLE_GRID = Object.freeze({
    nodes: [
      { id: 'S1', type: 'source', name: 'Main Power Plant', availableEnergy: 150 },
      { id: 'P1', type: 'station', name: 'North Station' },
      { id: 'P2', type: 'station', name: 'South Station' },
      { id: 'SS1', type: 'substation', name: 'Downtown Sub' },
      { id: 'SS2', type: 'substation', name: 'Industrial Sub' },
      { id: 'L1', type: 'load', name: 'City Hospital', category: 'Hospital', demand: 30, priority: 9 },
      { id: 'L2', type: 'load', name: 'Steel Factory', category: 'Industry', demand: 45, priority: 5 },
      { id: 'L3', type: 'load', name: 'Residential Area A', category: 'Residential', demand: 20, priority: 3 },
      { id: 'L4', type: 'load', name: 'Data Center', category: 'Commercial', demand: 35, priority: 7 },
      { id: 'L5', type: 'load', name: 'School District', category: 'Education', demand: 15, priority: 6 }
    ],
    connections: [
      { sourceId: 'S1', destId: 'P1', weight: 3 },
      { sourceId: 'S1', destId: 'P2', weight: 5 },
      { sourceId: 'P1', destId: 'SS1', weight: 2 },
      { sourceId: 'P1', destId: 'SS2', weight: 4 },
      { sourceId: 'P2', destId: 'SS2', weight: 2 },
      { sourceId: 'P2', destId: 'SS1', weight: 6 },
      { sourceId: 'SS1', destId: 'L1', weight: 1 },
      { sourceId: 'SS1', destId: 'L3', weight: 3 },
      { sourceId: 'SS2', destId: 'L2', weight: 2 },
      { sourceId: 'SS2', destId: 'L4', weight: 1 },
      { sourceId: 'SS1', destId: 'L5', weight: 2 }
    ]
  });

  // ── 2. Storage ──────────────────────────────────────────────────────────────
  function saveGrid(data) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error('Storage save error:', e);
      return false;
    }
  }

  function loadGrid() {
    try {
      const d = localStorage.getItem(STORAGE_KEY);
      return d ? JSON.parse(d) : null;
    } catch (e) {
      console.error('Storage load error:', e);
      return null;
    }
  }

  // ── 3. Toast ────────────────────────────────────────────────────────────────
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-exit');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
      setTimeout(() => toast.remove(), 500);
    }, 3000);
  }

  // ── 4. Graph Model ──────────────────────────────────────────────────────────
  class Graph {
    constructor() {
      this.nodes = [];
      this.connections = [];
      this._counters = { source: 1, station: 1, substation: 1, load: 1 };
    }

    _nextId(type) {
      const prefixes = { source: 'S', station: 'P', substation: 'SS', load: 'L' };
      return `${prefixes[type]}${this._counters[type]++}`;
    }

    _syncCounters() {
      this._counters = { source: 1, station: 1, substation: 1, load: 1 };
      for (const node of this.nodes) {
        const m = node.id.match(/^([A-Z]+)(\d+)$/);
        if (!m) continue;
        const num = parseInt(m[2], 10) + 1;
        if (num > this._counters[node.type]) this._counters[node.type] = num;
      }
    }

    addNode(type, name, extra = {}) {
      if (!Object.values(NODE_TYPES).includes(type)) throw new Error(`Unknown node type "${type}".`);
      if (!name || !name.trim()) throw new Error('Node name cannot be empty.');

      if (type === NODE_TYPES.SOURCE) {
        if (this.nodes.some(n => n.type === NODE_TYPES.SOURCE)) {
          throw new Error('Only one Power Source is allowed per grid.');
        }
        const energy = parseFloat(extra.availableEnergy);
        if (isNaN(energy) || energy <= 0) throw new Error('Power Source available energy must be > 0.');
      }

      if (type === NODE_TYPES.LOAD) {
        const demand = parseFloat(extra.demand);
        const priority = parseInt(extra.priority, 10);
        if (isNaN(demand) || demand <= 0) throw new Error('Load demand must be > 0.');
        if (isNaN(priority) || priority < PRIORITY_MIN || priority > PRIORITY_MAX) {
          throw new Error(`Load priority must be an integer between ${PRIORITY_MIN} and ${PRIORITY_MAX}.`);
        }
      }

      const id = this._nextId(type);
      const node = { id, type, name: name.trim() };
      if (type === NODE_TYPES.SOURCE) node.availableEnergy = parseFloat(extra.availableEnergy);
      if (type === NODE_TYPES.LOAD) {
        node.category = (extra.category || 'General').trim();
        node.demand   = parseFloat(extra.demand);
        node.priority = parseInt(extra.priority, 10);
      }
      this.nodes.push(node);
      return node;
    }

    addConnection(sourceId, destId, weight) {
      const w = parseFloat(weight);
      if (!sourceId || !destId) throw new Error('Both source and destination IDs are required.');
      if (sourceId === destId)  throw new Error('Self-loops are not allowed.');
      if (isNaN(w) || w <= 0)   throw new Error('Connection weight must be a positive number.');

      const src  = this.nodes.find(n => n.id === sourceId);
      const dest = this.nodes.find(n => n.id === destId);
      if (!src)  throw new Error(`Node "${sourceId}" does not exist.`);
      if (!dest) throw new Error(`Node "${destId}" does not exist.`);

      if (src.type === NODE_TYPES.LOAD && dest.type !== NODE_TYPES.SUBSTATION) {
        throw new Error('Loads can only connect to Substations.');
      }
      if (dest.type === NODE_TYPES.LOAD && src.type !== NODE_TYPES.SUBSTATION) {
        throw new Error('Loads can only connect to Substations.');
      }

      const dup = this.connections.some(c =>
        (c.sourceId === sourceId && c.destId === destId) ||
        (c.sourceId === destId   && c.destId === sourceId)
      );
      if (dup) throw new Error(`Connection between "${sourceId}" and "${destId}" already exists.`);

      const conn = { sourceId, destId, weight: w };
      this.connections.push(conn);
      return conn;
    }

    updateConnection(index, sourceId, destId, weight) {
      if (index < 0 || index >= this.connections.length) throw new Error('Connection not found.');
      const w = parseFloat(weight);
      if (!sourceId || !destId) throw new Error('Both source and destination IDs are required.');
      if (sourceId === destId)  throw new Error('Self-loops are not allowed.');
      if (isNaN(w) || w <= 0)   throw new Error('Connection weight must be a positive number.');

      const src  = this.nodes.find(n => n.id === sourceId);
      const dest = this.nodes.find(n => n.id === destId);
      if (!src)  throw new Error(`Node "${sourceId}" does not exist.`);
      if (!dest) throw new Error(`Node "${destId}" does not exist.`);

      if (src.type === NODE_TYPES.LOAD && dest.type !== NODE_TYPES.SUBSTATION) {
        throw new Error('Loads can only connect to Substations.');
      }
      if (dest.type === NODE_TYPES.LOAD && src.type !== NODE_TYPES.SUBSTATION) {
        throw new Error('Loads can only connect to Substations.');
      }

      const dup = this.connections.some((c, i) =>
        i !== index && (
          (c.sourceId === sourceId && c.destId === destId) ||
          (c.sourceId === destId   && c.destId === sourceId)
        )
      );
      if (dup) throw new Error(`Connection between "${sourceId}" and "${destId}" already exists.`);

      this.connections[index] = { sourceId, destId, weight: w };
      return this.connections[index];
    }

    updateNode(id, field, value) {
      const node = this.nodes.find(n => n.id === id);
      if (!node) throw new Error(`Node "${id}" not found.`);
      if (field === 'name') {
        const trimmed = String(value).trim();
        if (!trimmed) throw new Error('Node name cannot be empty.');
        node.name = trimmed;
      } else if (field === 'availableEnergy') {
        const val = parseFloat(value);
        if (isNaN(val) || val <= 0) throw new Error('Available energy must be > 0.');
        node.availableEnergy = val;
      } else if (field === 'demand') {
        const val = parseFloat(value);
        if (isNaN(val) || val <= 0) throw new Error('Demand must be > 0.');
        node.demand = val;
      } else if (field === 'priority') {
        const val = parseInt(value, 10);
        if (isNaN(val) || val < PRIORITY_MIN || val > PRIORITY_MAX) {
          throw new Error(`Priority must be between ${PRIORITY_MIN} and ${PRIORITY_MAX}.`);
        }
        node.priority = val;
      } else if (field === 'category') {
        node.category = String(value).trim() || 'General';
      }
    }

    deleteNode(id) {
      const idx = this.nodes.findIndex(n => n.id === id);
      if (idx === -1) throw new Error(`Node "${id}" not found.`);
      this.nodes.splice(idx, 1);
      this.connections = this.connections.filter(c => c.sourceId !== id && c.destId !== id);
    }

    deleteConnection(index) {
      if (index < 0 || index >= this.connections.length) throw new Error('Connection not found.');
      this.connections.splice(index, 1);
    }

    loadFromData(data) {
      this.nodes       = (data && Array.isArray(data.nodes))       ? [...data.nodes]       : [];
      this.connections = (data && Array.isArray(data.connections)) ? [...data.connections] : [];
      this._syncCounters();
    }

    serialize() {
      return { nodes: JSON.parse(JSON.stringify(this.nodes)), connections: JSON.parse(JSON.stringify(this.connections)) };
    }

    getNodes()       { return this.nodes; }
    getConnections() { return this.connections; }
    getSourceNode()  { return this.nodes.find(n => n.type === NODE_TYPES.SOURCE) || null; }
  }

  // ── 5. Priority Queue ───────────────────────────────────────────────────────
  class PriorityQueue {
    static build(loadNodes, distances, predecessors) {
      const items = loadNodes.map(load => {
        const dist      = distances[load.id];
        const reachable = dist !== undefined && dist !== Infinity;
        const path      = reachable ? PriorityQueue._reconstructPath(predecessors, load.id) : null;
        return { ...load, reachable, dist: reachable ? dist : Infinity, path };
      });

      items.sort((a, b) => {
        if (a.reachable !== b.reachable) return a.reachable ? -1 : 1;
        if (b.priority !== a.priority) return b.priority - a.priority;
        if (a.dist !== b.dist) return a.dist - b.dist;
        return a.id.localeCompare(b.id);
      });

      return items;
    }

    static _reconstructPath(predecessors, targetId) {
      const path = [];
      let current = targetId;
      const visited = new Set();
      while (current !== null && current !== undefined) {
        if (visited.has(current)) return null;
        visited.add(current);
        path.unshift(current);
        current = predecessors[current];
      }
      return path.length > 0 ? path : null;
    }
  }

  // ── 6. Algorithms ───────────────────────────────────────────────────────────
  function dijkstra(graph, sourceId) {
    const nodes = graph.getNodes();
    const connections = graph.getConnections();
    const distances = {};
    const predecessors = {};
    for (const n of nodes) {
      distances[n.id] = Infinity;
      predecessors[n.id] = null;
    }
    distances[sourceId] = 0;
    const pq = [{ id: sourceId, dist: 0 }];

    while (pq.length > 0) {
      pq.sort((a, b) => a.dist - b.dist);
      const { id: u } = pq.shift();
      const neighbours = connections
        .filter(c => c.sourceId === u || c.destId === u)
        .map(c => ({ id: c.sourceId === u ? c.destId : c.sourceId, weight: c.weight }));

      for (const { id: v, weight } of neighbours) {
        const alt = distances[u] + weight;
        if (alt < distances[v]) {
          distances[v] = alt;
          predecessors[v] = u;
          pq.push({ id: v, dist: alt });
        }
      }
    }
    return { distances, predecessors };
  }

  function bellmanFord(graph, sourceId) {
    const nodes = graph.getNodes();
    const connections = graph.getConnections();
    const distances = {};
    const predecessors = {};
    for (const n of nodes) {
      distances[n.id] = Infinity;
      predecessors[n.id] = null;
    }
    distances[sourceId] = 0;
    const V = nodes.length;

    for (let i = 0; i < V - 1; i++) {
      for (const edge of connections) {
        const { sourceId: u, destId: v, weight: w } = edge;
        if (distances[u] !== Infinity && distances[u] + w < distances[v]) {
          distances[v] = distances[u] + w;
          predecessors[v] = u;
        }
        if (distances[v] !== Infinity && distances[v] + w < distances[u]) {
          distances[u] = distances[v] + w;
          predecessors[u] = v;
        }
      }
    }
    return { distances, predecessors };
  }

  function floydWarshall(graph, sourceId) {
    const nodes = graph.getNodes();
    const connections = graph.getConnections();
    const ids = nodes.map(n => n.id);
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

    for (const c of connections) {
      const { sourceId: u, destId: v, weight: w } = c;
      if (w < dist[u][v]) { dist[u][v] = w; next[u][v] = v; }
      if (w < dist[v][u]) { dist[v][u] = w; next[v][u] = u; }
    }

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

    const distances = {};
    const predecessors = {};
    for (const id of ids) {
      distances[id] = dist[sourceId] ? dist[sourceId][id] : Infinity;
      predecessors[id] = null;
      if (id !== sourceId && dist[sourceId] && dist[sourceId][id] !== Infinity) {
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

  // ── 7. Graph Renderer ───────────────────────────────────────────────────────
  const nodePositions = new Map();
  let _dragging = false;
  let _draggedId = null;
  let _activeSvgId = null;
  let _activeHighlights = [];
  let _activeNodes = [];
  let _activeConns = [];
  let _listenersAttached = false;

  function attachDragListeners() {
    if (_listenersAttached) return;
    _listenersAttached = true;
    document.addEventListener('mousemove', e => {
      if (!_dragging || !_draggedId || !_activeSvgId) return;
      const svg = document.getElementById(_activeSvgId);
      if (!svg) return;
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
      const pos = nodePositions.get(_draggedId);
      if (pos) {
        pos.x = Math.max(30, Math.min(870, svgP.x));
        pos.y = Math.max(30, Math.min(470, svgP.y));
        renderGraph(_activeSvgId, _activeNodes, _activeConns, _activeHighlights);
      }
    });
    document.addEventListener('mouseup', () => {
      _dragging = false;
      _draggedId = null;
    });
  }

  function runForceLayout(nodes, connections, bounds) {
    const W = bounds.width || 900;
    const H = bounds.height || 500;
    const PAD = 60;
    const activeIds = new Set(nodes.map(n => n.id));
    for (const id of nodePositions.keys()) {
      if (!activeIds.has(id)) nodePositions.delete(id);
    }
    for (const n of nodes) {
      if (!nodePositions.has(n.id)) {
        nodePositions.set(n.id, {
          x: PAD + Math.random() * (W - 2 * PAD),
          y: PAD + Math.random() * (H - 2 * PAD),
          vx: 0, vy: 0,
        });
      }
    }

    const k = 80;
    for (let iter = 0; iter < 180; iter++) {
      const temp = ((180 - iter) / 180) * 8;
      for (let a = 0; a < nodes.length; a++) {
        for (let b = a + 1; b < nodes.length; b++) {
          const pA = nodePositions.get(nodes[a].id);
          const pB = nodePositions.get(nodes[b].id);
          if (!pA || !pB) continue;
          let dx = pA.x - pB.x; let dy = pA.y - pB.y;
          let d = Math.sqrt(dx * dx + dy * dy) || 1;
          const f = (k * k) / d;
          pA.vx += (dx / d) * f; pA.vy += (dy / d) * f;
          pB.vx -= (dx / d) * f; pB.vy -= (dy / d) * f;
        }
      }
      for (const c of connections) {
        const pA = nodePositions.get(c.sourceId);
        const pB = nodePositions.get(c.destId);
        if (!pA || !pB) continue;
        let dx = pA.x - pB.x; let dy = pA.y - pB.y;
        let d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d * d) / k;
        pA.vx -= (dx / d) * f; pA.vy -= (dy / d) * f;
        pB.vx += (dx / d) * f; pB.vy += (dy / d) * f;
      }
      for (const n of nodes) {
        const p = nodePositions.get(n.id);
        if (!p) continue;
        const mag = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
        p.x += (p.vx / mag) * Math.min(mag, temp);
        p.y += (p.vy / mag) * Math.min(mag, temp);
        p.x = Math.max(PAD, Math.min(W - PAD, p.x));
        p.y = Math.max(PAD, Math.min(H - PAD, p.y));
        p.vx = 0; p.vy = 0;
      }
    }
  }

  function renderGraph(svgId, nodes, connections, highlightedEdges = []) {
    const svg = document.getElementById(svgId);
    if (!svg) return;
    _activeSvgId = svgId;
    _activeHighlights = highlightedEdges;
    _activeNodes = nodes;
    _activeConns = connections;

    const W = 900, H = 500;
    svg.innerHTML = '';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    if (!nodes || nodes.length === 0) return;

    attachDragListeners();

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <filter id="${svgId}-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feComposite in="SourceGraphic" in2="blur" operator="over"/>
      </filter>`;
    svg.appendChild(defs);

    for (const conn of connections) {
      const pA = nodePositions.get(conn.sourceId);
      const pB = nodePositions.get(conn.destId);
      if (!pA || !pB) continue;

      const isHighlighted = highlightedEdges.some(e =>
        (e.sourceId === conn.sourceId && e.destId === conn.destId) ||
        (e.sourceId === conn.destId   && e.destId === conn.sourceId)
      );

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', pA.x); line.setAttribute('y1', pA.y);
      line.setAttribute('x2', pB.x); line.setAttribute('y2', pB.y);
      if (isHighlighted) {
        line.setAttribute('stroke', PATH_COLOR);
        line.setAttribute('stroke-width', '3.5');
        line.setAttribute('class', 'highlight-edge energy-flow-line');
        line.setAttribute('filter', `url(#${svgId}-glow)`);
      } else {
        line.setAttribute('stroke', DEFAULT_EDGE_COLOR);
        line.setAttribute('stroke-width', '1.5');
      }
      svg.appendChild(line);

      const mx = (pA.x + pB.x) / 2;
      const my = (pA.y + pB.y) / 2;
      const wtLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      wtLabel.setAttribute('x', mx);
      wtLabel.setAttribute('y', my - 6);
      wtLabel.setAttribute('text-anchor', 'middle');
      wtLabel.setAttribute('fill', '#9999bb');
      wtLabel.setAttribute('font-size', '11px');
      wtLabel.textContent = conn.weight;
      svg.appendChild(wtLabel);
    }

    for (const node of nodes) {
      const pos = nodePositions.get(node.id);
      if (!pos) continue;

      const r = NODE_RADII[node.type] || 14;
      const fill = NODE_COLORS[node.type] || '#888';

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.setAttribute('transform', `translate(${pos.x},${pos.y})`);
      g.style.cursor = 'grab';

      g.addEventListener('mousedown', e => {
        e.preventDefault();
        _dragging = true;
        _draggedId = node.id;
      });

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', r);
      circle.setAttribute('fill', fill);
      circle.setAttribute('filter', `url(#${svgId}-glow)`);
      circle.setAttribute('stroke', 'rgba(255,255,255,0.2)');
      circle.setAttribute('stroke-width', '1.5');
      g.appendChild(circle);

      const idLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      idLabel.setAttribute('text-anchor', 'middle');
      idLabel.setAttribute('dy', '0.35em');
      idLabel.setAttribute('fill', '#ffffff');
      idLabel.setAttribute('font-size', `${Math.max(9, r - 5)}px`);
      idLabel.setAttribute('font-weight', 'bold');
      idLabel.style.pointerEvents = 'none';
      idLabel.textContent = node.id;
      g.appendChild(idLabel);

      const nameLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      nameLabel.setAttribute('text-anchor', 'middle');
      nameLabel.setAttribute('y', r + 15);
      nameLabel.setAttribute('fill', '#e8e8f0');
      nameLabel.setAttribute('font-size', '11px');
      nameLabel.setAttribute('font-weight', '500');
      nameLabel.style.pointerEvents = 'none';
      nameLabel.textContent = node.name;
      g.appendChild(nameLabel);

      svg.appendChild(g);
    }
  }

  function removeNodePosition(id) {
    nodePositions.delete(id);
  }

  function clearPositionCache() {
    nodePositions.clear();
  }

  function escHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── 8. Views Initialization & Logic ─────────────────────────────────────────
  function initAll(graph) {
    // ── Grid Builder View ──
    const typeSelect = document.getElementById('node-type-select');
    if (typeSelect) {
      typeSelect.addEventListener('change', updateDynamicFields);
      updateDynamicFields();
    }

    function updateDynamicFields() {
      const type = document.getElementById('node-type-select')?.value;
      const container = document.getElementById('dynamic-fields');
      if (!container) return;
      if (type === NODE_TYPES.SOURCE) {
        container.innerHTML = `
          <div class="form-group">
            <label class="form-label" for="node-energy-input">Available Energy (MW)</label>
            <input class="form-input" type="number" id="node-energy-input" min="1" placeholder="e.g. 150">
          </div>`;
      } else if (type === NODE_TYPES.LOAD) {
        container.innerHTML = `
          <div class="form-group">
            <label class="form-label" for="node-category-input">Category</label>
            <input class="form-input" type="text" id="node-category-input" placeholder="e.g. Hospital">
          </div>
          <div class="form-group">
            <label class="form-label" for="node-demand-input">Demand (MW)</label>
            <input class="form-input" type="number" id="node-demand-input" min="1" placeholder="e.g. 30">
          </div>
          <div class="form-group">
            <label class="form-label" for="node-priority-input">Priority (0–9)</label>
            <input class="form-input" type="number" id="node-priority-input" min="0" max="9" placeholder="9 = highest">
          </div>`;
      } else {
        container.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;padding:6px 0 12px 0;">Power stations & substations relay energy.</p>`;
      }
    }

    function onGridChange() {
      saveGrid(graph.serialize());
      refreshActiveView(graph);
    }

    const addNodeBtn = document.getElementById('add-node-btn');
    if (addNodeBtn) {
      addNodeBtn.addEventListener('click', () => {
        try {
          const type = document.getElementById('node-type-select')?.value;
          const name = document.getElementById('node-name-input')?.value?.trim();
          let extra = {};
          if (type === NODE_TYPES.SOURCE) {
            extra = { availableEnergy: document.getElementById('node-energy-input')?.value };
          } else if (type === NODE_TYPES.LOAD) {
            extra = {
              category: document.getElementById('node-category-input')?.value?.trim() || 'General',
              demand: document.getElementById('node-demand-input')?.value,
              priority: document.getElementById('node-priority-input')?.value
            };
          }
          const n = graph.addNode(type, name, extra);
          document.getElementById('node-name-input').value = '';
          updateDynamicFields();
          renderNodeTable();
          renderConnTable();
          updateConnectionDropdowns();
          onGridChange();
          showToast(`Node ${n.id} added.`, 'success');
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    }

    const addConnBtn = document.getElementById('add-conn-btn');
    if (addConnBtn) {
      addConnBtn.addEventListener('click', () => {
        try {
          const srcId  = document.getElementById('conn-source-input')?.value;
          const dstId  = document.getElementById('conn-dest-input')?.value;
          const weight = document.getElementById('conn-weight-input')?.value;
          graph.addConnection(srcId, dstId, weight);
          document.getElementById('conn-weight-input').value = '';
          renderConnTable();
          onGridChange();
          showToast(`Connection ${srcId} ↔ ${dstId} added.`, 'success');
        } catch (e) {
          showToast(e.message, 'error');
        }
      });
    }

    const saveBtn = document.getElementById('save-grid-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        saveGrid(graph.serialize());
        showToast('Grid saved to local storage.', 'success');
      });
    }

    const exportBtn = document.getElementById('export-grid-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const json = JSON.stringify(graph.serialize(), null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = 'power-grid.json';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
        showToast('Grid exported successfully.', 'success');
      });
    }

    const importBtn   = document.getElementById('import-grid-btn');
    const importInput = document.getElementById('import-grid-input');
    if (importBtn && importInput) {
      importBtn.addEventListener('click', () => importInput.click());
      importInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          try {
            const data = JSON.parse(ev.target.result);
            graph.loadFromData(data);
            clearPositionCache();
            renderNodeTable();
            renderConnTable();
            updateConnectionDropdowns();
            onGridChange();
            showToast('Grid imported successfully.', 'success');
          } catch (err) {
            showToast(`Import failed: ${err.message}`, 'error');
          }
        };
        reader.readAsText(file);
        e.target.value = '';
      });
    }

    const sampleBtn = document.getElementById('load-sample-btn');
    if (sampleBtn) {
      sampleBtn.addEventListener('click', () => {
        const applySample = (data) => {
          graph.loadFromData(data);
          clearPositionCache();
          saveGrid(graph.serialize());
          renderNodeTable();
          renderConnTable();
          updateConnectionDropdowns();
          onGridChange();
          showToast('Sample grid loaded successfully!', 'success');
        };
        fetch('./data/sample-grid.json')
          .then(r => r.json())
          .then(applySample)
          .catch(() => applySample(DEFAULT_SAMPLE_GRID));
      });
    }

    function renderNodeTable() {
      const tbody = document.getElementById('node-table-body');
      const emptyState = document.getElementById('nodes-empty');
      const countEl = document.getElementById('node-count');
      if (!tbody) return;
      const nodes = graph.getNodes();
      tbody.innerHTML = '';
      if (countEl) countEl.textContent = `${nodes.length} node${nodes.length === 1 ? '' : 's'}`;
      if (emptyState) emptyState.style.display = nodes.length === 0 ? 'block' : 'none';

      for (const node of nodes) {
        const tr = document.createElement('tr');
        let detailsHtml = '<span style="color:var(--text-muted)">—</span>';
        if (node.type === NODE_TYPES.SOURCE) {
          detailsHtml = `Energy: <input class="editable-input" type="number" value="${node.availableEnergy}" data-id="${node.id}" data-field="availableEnergy" style="width:75px" min="1"> MW`;
        } else if (node.type === NODE_TYPES.LOAD) {
          detailsHtml = `
            <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
              <span>Cat: <input class="editable-input" type="text" value="${escHtml(node.category || 'General')}" data-id="${node.id}" data-field="category" style="width:85px"></span>
              <span>Dem: <input class="editable-input" type="number" value="${node.demand}" data-id="${node.id}" data-field="demand" style="width:60px" min="1"> MW</span>
              <span>Pri: <input class="editable-input" type="number" value="${node.priority}" min="0" max="9" data-id="${node.id}" data-field="priority" style="width:45px"></span>
            </div>`;
        }

        tr.innerHTML = `
          <td><strong>${node.id}</strong></td>
          <td><span class="type-badge ${node.type}">${node.type}</span></td>
          <td><input class="editable-input" type="text" value="${escHtml(node.name)}" data-id="${node.id}" data-field="name" style="width:100%;max-width:180px;"></td>
          <td>${detailsHtml}</td>
          <td><button class="btn-small btn-danger" data-delete-node="${node.id}">Delete</button></td>`;
        tbody.appendChild(tr);
      }

      tbody.querySelectorAll('.editable-input').forEach(input => {
        input.addEventListener('change', e => {
          try {
            graph.updateNode(e.target.dataset.id, e.target.dataset.field, e.target.value);
            if (e.target.dataset.field === 'name') {
              updateConnectionDropdowns();
              renderConnTable();
            }
            onGridChange();
            showToast('Node updated.', 'success');
          } catch (err) {
            showToast(err.message, 'error');
            renderNodeTable();
          }
        });
      });

      tbody.querySelectorAll('[data-delete-node]').forEach(btn => {
        btn.addEventListener('click', e => {
          const id = e.target.dataset.deleteNode;
          try {
            graph.deleteNode(id);
            removeNodePosition(id);
            renderNodeTable();
            renderConnTable();
            updateConnectionDropdowns();
            onGridChange();
            showToast(`Node ${id} deleted.`, 'info');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    }

    function renderConnTable() {
      const tbody = document.getElementById('conn-table-body');
      const emptyState = document.getElementById('conns-empty');
      const countEl = document.getElementById('conn-count');
      if (!tbody) return;
      const conns = graph.getConnections();
      const nodes = graph.getNodes();
      tbody.innerHTML = '';
      if (countEl) countEl.textContent = `${conns.length} connection${conns.length === 1 ? '' : 's'}`;
      if (emptyState) emptyState.style.display = conns.length === 0 ? 'block' : 'none';

      const nodeOpts = nodes.map(n => `<option value="${n.id}">${n.id} (${escHtml(n.name)})</option>`).join('');

      conns.forEach((conn, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <select class="editable-input" data-conn-idx="${idx}" data-field="sourceId">
              ${nodeOpts.replace(`value="${conn.sourceId}"`, `value="${conn.sourceId}" selected`)}
            </select>
          </td>
          <td>
            <select class="editable-input" data-conn-idx="${idx}" data-field="destId">
              ${nodeOpts.replace(`value="${conn.destId}"`, `value="${conn.destId}" selected`)}
            </select>
          </td>
          <td><input class="editable-input" type="number" value="${conn.weight}" min="0.1" step="0.1" data-conn-idx="${idx}" data-field="weight" style="width:75px"></td>
          <td><button class="btn-small btn-danger" data-delete-conn="${idx}">Delete</button></td>`;
        tbody.appendChild(tr);
      });

      tbody.querySelectorAll('.editable-input[data-conn-idx]').forEach(input => {
        input.addEventListener('change', e => {
          const idx = parseInt(e.target.dataset.connIdx, 10);
          const row = input.closest('tr');
          const srcSel = row.querySelector('[data-field="sourceId"]');
          const dstSel = row.querySelector('[data-field="destId"]');
          const wtInp  = row.querySelector('[data-field="weight"]');
          try {
            graph.updateConnection(idx, srcSel.value, dstSel.value, wtInp.value);
            onGridChange();
            showToast('Connection updated.', 'success');
          } catch (err) {
            showToast(err.message, 'error');
            renderConnTable();
          }
        });
      });

      tbody.querySelectorAll('[data-delete-conn]').forEach(btn => {
        btn.addEventListener('click', e => {
          const idx = parseInt(e.target.dataset.deleteConn, 10);
          try {
            graph.deleteConnection(idx);
            renderConnTable();
            onGridChange();
            showToast('Connection deleted.', 'info');
          } catch (err) {
            showToast(err.message, 'error');
          }
        });
      });
    }

    function updateConnectionDropdowns() {
      const srcSel = document.getElementById('conn-source-input');
      const dstSel = document.getElementById('conn-dest-input');
      if (!srcSel || !dstSel) return;
      const prevSrc = srcSel.value;
      const prevDst = dstSel.value;
      const opts = graph.getNodes().map(n => `<option value="${n.id}">${n.id} (${escHtml(n.name)})</option>`).join('');
      const placeholder = '<option value="" disabled selected>Select node…</option>';
      srcSel.innerHTML = placeholder + opts;
      dstSel.innerHTML = placeholder + opts;
      if (prevSrc && graph.getNodes().some(n => n.id === prevSrc)) srcSel.value = prevSrc;
      if (prevDst && graph.getNodes().some(n => n.id === prevDst)) dstSel.value = prevDst;
    }

    // ── Shortest Path View ──
    function refreshPathGraph(autoRun = false) {
      const nodes = graph.getNodes();
      const conns = graph.getConnections();
      const noMsg = document.getElementById('sp-no-grid-msg');
      const content = document.getElementById('sp-content');
      const source = graph.getSourceNode();

      if (nodes.length === 0) {
        if (noMsg) noMsg.style.display = 'block';
        if (content) content.style.display = 'none';
        const svg = document.getElementById('sp-graph-svg');
        if (svg) svg.innerHTML = '';
        const tbody = document.getElementById('sp-results-body');
        if (tbody) tbody.innerHTML = '';
        return;
      }

      if (noMsg) noMsg.style.display = 'none';
      if (content) content.style.display = 'block';

      if (source && autoRun) {
        runShortestPath(false);
      } else {
        runForceLayout(nodes, conns, { width: 900, height: 500 });
        renderGraph('sp-graph-svg', nodes, conns, []);
      }
    }

    function runShortestPath(notify = true) {
      const nodes = graph.getNodes();
      const source = graph.getSourceNode();
      const noMsg = document.getElementById('sp-no-grid-msg');
      const content = document.getElementById('sp-content');

      if (nodes.length === 0) {
        if (noMsg) noMsg.style.display = 'block';
        if (content) content.style.display = 'none';
        return;
      }

      if (!source) {
        if (notify) showToast('Grid must contain a Power Source to calculate paths.', 'error');
        runForceLayout(nodes, graph.getConnections(), { width: 900, height: 500 });
        renderGraph('sp-graph-svg', nodes, graph.getConnections(), []);
        return;
      }

      if (noMsg) noMsg.style.display = 'none';
      if (content) content.style.display = 'block';

      const algoSelect = document.getElementById('algorithm-select');
      const algo = algoSelect ? algoSelect.value : 'dijkstra';
      let result;
      try {
        if (algo === 'dijkstra') result = dijkstra(graph, source.id);
        else if (algo === 'bellman-ford') result = bellmanFord(graph, source.id);
        else if (algo === 'floyd-warshall') result = floydWarshall(graph, source.id);
        else result = dijkstra(graph, source.id);
      } catch (e) {
        showToast(`Algorithm error: ${e.message}`, 'error');
        return;
      }

      const { distances, predecessors } = result;
      const loads = nodes.filter(n => n.type === NODE_TYPES.LOAD);
      const queue = PriorityQueue.build(loads, distances, predecessors);

      const highlightedEdges = [];
      for (const item of queue) {
        if (item.reachable && item.path) {
          for (let i = 0; i < item.path.length - 1; i++) {
            highlightedEdges.push({ sourceId: item.path[i], destId: item.path[i + 1] });
          }
        }
      }

      runForceLayout(graph.getNodes(), graph.getConnections(), { width: 900, height: 500 });
      renderGraph('sp-graph-svg', graph.getNodes(), graph.getConnections(), highlightedEdges);

      const tbody = document.getElementById('sp-results-body');
      if (!tbody) return;
      tbody.innerHTML = '';

      if (loads.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem;">No Load consumers found. Add Loads in Grid Builder.</td></tr>`;
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

    const runAlgoBtn = document.getElementById('run-algorithm-btn');
    if (runAlgoBtn) {
      runAlgoBtn.addEventListener('click', () => runShortestPath(true));
    }

    // ── Simulation View ──
    let _simState = null;
    let _simTimer = null;

    function refreshSimGraph() {
      const nodes  = graph.getNodes();
      const conns  = graph.getConnections();
      const source = graph.getSourceNode();
      const noMsg   = document.getElementById('pd-no-grid-msg');
      const content = document.getElementById('pd-content');

      if (nodes.length === 0) {
        if (noMsg) noMsg.style.display = 'block';
        if (content) content.style.display = 'none';
        const svg = document.getElementById('pd-graph-svg');
        if (svg) svg.innerHTML = '';
        return;
      }

      if (noMsg) noMsg.style.display = 'none';
      if (content) content.style.display = 'block';

      runForceLayout(nodes, conns, { width: 900, height: 500 });
      renderGraph('pd-graph-svg', nodes, conns, []);

      if (!_simState || _simState.index === 0) {
        prepareQueuePreview(source);
      }
    }

    function prepareQueuePreview(source) {
      const nodes = graph.getNodes();
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
        const { distances, predecessors } = dijkstra(graph, source.id);
        queue = PriorityQueue.build(loads, distances, predecessors);
      } else {
        queue = loads.map(l => ({ ...l, reachable: false, dist: Infinity, path: null }));
      }

      renderQueueUI(queue);
      updateSimStats(0, totalDemand, availableEnergy);
      setRemainingDisplay(availableEnergy);

      const tbody = document.getElementById('pd-results-body');
      if (tbody && (!_simState || _simState.results.length === 0)) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:1.5rem;">Click "Start Simulation" or "Step" to begin energy allocation.</td></tr>`;
      }
    }

    function initSimState() {
      const nodes = graph.getNodes();
      const source = graph.getSourceNode();
      if (nodes.length === 0) {
        showToast('Add nodes in Grid Builder first.', 'error');
        return false;
      }
      if (!source) {
        showToast('Grid must contain a Power Source to distribute energy.', 'error');
        return false;
      }

      const energyInput = document.getElementById('total-energy-input');
      const inputVal = energyInput ? parseFloat(energyInput.value) : NaN;
      const totalEnergy = (!isNaN(inputVal) && inputVal >= 0) ? inputVal : source.availableEnergy;

      const { distances, predecessors } = dijkstra(graph, source.id);
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

      renderQueueUI(queue);
      const tbody = document.getElementById('pd-results-body');
      if (tbody) tbody.innerHTML = '';
      const totalDemand = queue.reduce((s, i) => s + (i.demand || 0), 0);
      updateSimStats(0, totalDemand, totalEnergy);
      setRemainingDisplay(totalEnergy);

      runForceLayout(graph.getNodes(), graph.getConnections(), { width: 900, height: 500 });
      renderGraph('pd-graph-svg', graph.getNodes(), graph.getConnections(), []);
      return true;
    }

    function processNextItem() {
      if (!_simState || _simState.index >= _simState.queue.length) return false;
      const item = _simState.queue[_simState.index];

      document.querySelectorAll('.queue-item').forEach(el => el.classList.remove('active'));
      const qEl = document.getElementById(`queue-item-${item.id}`);
      if (qEl) qEl.classList.add('active');

      let allocated = 0;
      let status = 'Not Supplied';
      if (item.reachable && _simState.remaining > 0) {
        allocated = Math.min(item.demand, _simState.remaining);
        _simState.remaining -= allocated;
        status = (allocated === item.demand) ? 'Fully Supplied' : 'Partially Supplied';
      }

      const resultItem = { ...item, allocated, status };
      _simState.results.push(resultItem);

      if (qEl) {
        qEl.classList.remove('active');
        qEl.classList.add('processed');
        const cls = status === 'Fully Supplied' ? 'fully-supplied'
                  : status === 'Partially Supplied' ? 'partially-supplied'
                  : 'not-supplied';
        qEl.classList.add(cls);
      }

      appendResultRow(resultItem);

      const supplied = _simState.totalEnergy - _simState.remaining;
      const totalDemand = _simState.queue.reduce((s, i) => s + i.demand, 0);
      updateSimStats(supplied, totalDemand, _simState.remaining);
      setRemainingDisplay(_simState.remaining);

      if (item.reachable && item.path && allocated > 0) {
        const edges = [];
        for (let i = 0; i < item.path.length - 1; i++) {
          edges.push({ sourceId: item.path[i], destId: item.path[i + 1] });
        }
        renderGraph('pd-graph-svg', graph.getNodes(), graph.getConnections(), edges);
      }

      _simState.index++;
      return _simState.index < _simState.queue.length;
    }

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
          <div class="priority-badge">${item.priority}</div>
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
      if (_simState && _simState.results.length === 1) tbody.innerHTML = '';

      const statusClass = item.status === 'Fully Supplied' ? 'status-full'
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

    function updateSimStats(supplied, demand, remaining) {
      const s = document.getElementById('total-supplied-display');
      const d = document.getElementById('total-demand-display');
      const r = document.getElementById('total-remaining-display');
      if (s) s.textContent = `${supplied} MW`;
      if (d) d.textContent = `${demand} MW`;
      if (r) r.textContent = `${remaining} MW`;
    }

    function setRemainingDisplay(val) {
      const el = document.getElementById('remaining-energy-display');
      if (el) el.textContent = val;
    }

    const startBtn = document.getElementById('start-sim-btn');
    const stepBtn  = document.getElementById('step-sim-btn');
    const resetBtn = document.getElementById('reset-sim-btn');

    if (startBtn) {
      startBtn.addEventListener('click', () => {
        if (!_simState || _simState.index >= _simState.queue.length) {
          if (!initSimState()) return;
        }
        if (_simTimer) { clearInterval(_simTimer); _simTimer = null; }
        _simTimer = setInterval(() => {
          const hasMore = processNextItem();
          if (!hasMore) {
            clearInterval(_simTimer);
            _simTimer = null;
            showToast('Simulation complete!', 'success');
          }
        }, 800);
        showToast('Power distribution simulation started.', 'info');
      });
    }

    if (stepBtn) {
      stepBtn.addEventListener('click', () => {
        if (!_simState || _simState.index >= _simState.queue.length) {
          if (!initSimState()) return;
        }
        const hasMore = processNextItem();
        if (!hasMore) {
          if (_simTimer) { clearInterval(_simTimer); _simTimer = null; }
          showToast('Simulation complete!', 'success');
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (_simTimer) { clearInterval(_simTimer); _simTimer = null; }
        _simState = null;
        initSimState();
        showToast('Simulation reset.', 'info');
      });
    }

    // ── Navigation Setup ──
    const tabs     = document.querySelectorAll('.nav-tab');
    const sections = document.querySelectorAll('.section');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = tab.getAttribute('data-section');
        if (!targetId) return;

        tabs.forEach(t => t.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));

        tab.classList.add('active');
        const target = document.getElementById(targetId);
        if (target) target.classList.add('active');

        if (targetId === 'section-shortest-path') {
          refreshPathGraph(true);
        } else if (targetId === 'section-power-dist') {
          refreshSimGraph();
        }
      });
    });

    function refreshActiveView() {
      if (document.getElementById('section-shortest-path')?.classList.contains('active')) {
        refreshPathGraph(true);
      } else if (document.getElementById('section-power-dist')?.classList.contains('active')) {
        refreshSimGraph();
      }
    }

    // Initial render of builder view
    renderNodeTable();
    renderConnTable();
    updateConnectionDropdowns();
    refreshActiveView();
  }

  // ── Bootstrap ──────────────────────────────────────────────────────────────
  function boot() {
    const graph = new Graph();
    const saved = loadGrid();
    if (saved && Array.isArray(saved.nodes) && saved.nodes.length > 0) {
      try {
        graph.loadFromData(saved);
      } catch (e) {
        console.warn('Could not restore saved grid:', e);
      }
    }
    initAll(graph);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
