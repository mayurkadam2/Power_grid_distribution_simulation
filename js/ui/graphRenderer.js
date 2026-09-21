/**
 * ui/graphRenderer.js
 * Shared SVG graph drawing used by both pathView and simulationView.
 * Runs a force-directed layout and renders nodes + edges into an SVG element.
 */

import { NODE_COLORS, NODE_RADII, PATH_COLOR, DEFAULT_EDGE_COLOR } from '../constants.js';

/** Cached positions: nodeId → { x, y } — persists across re-renders */
const nodePositions = new Map();

// Active drag state
let _dragging = false;
let _draggedId = null;
let _activeSvgId = null;
let _activeHighlights = [];
let _activeNodes = [];
let _activeConns = [];

// Attach document-level drag listeners once
let _listenersAttached = false;

function attachDragListeners() {
  if (_listenersAttached) return;
  _listenersAttached = true;

  document.addEventListener('mousemove', e => {
    if (!_dragging || !_draggedId || !_activeSvgId) return;
    const svg = document.getElementById(_activeSvgId);
    if (!svg) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    const pos  = nodePositions.get(_draggedId);
    if (pos) {
      pos.x = Math.max(30, Math.min(870, svgP.x));
      pos.y = Math.max(30, Math.min(470, svgP.y));
      renderGraph(_activeSvgId, _activeNodes, _activeConns, _activeHighlights);
    }
  });

  document.addEventListener('mouseup', () => {
    _dragging   = false;
    _draggedId  = null;
  });
}

/**
 * Run a force-directed layout. Initialises positions for new nodes only,
 * preserving manually-dragged positions.
 *
 * @param {Array}  nodes
 * @param {Array}  connections
 * @param {{ width: number, height: number }} bounds
 */
export function runForceLayout(nodes, connections, bounds) {
  const W = bounds.width  || 900;
  const H = bounds.height || 500;
  const PAD = 60;

  // Clean up positions for nodes that no longer exist
  const activeIds = new Set(nodes.map(n => n.id));
  for (const id of nodePositions.keys()) {
    if (!activeIds.has(id)) nodePositions.delete(id);
  }

  // Seed positions for new nodes
  for (const n of nodes) {
    if (!nodePositions.has(n.id)) {
      nodePositions.set(n.id, {
        x: PAD + Math.random() * (W - 2 * PAD),
        y: PAD + Math.random() * (H - 2 * PAD),
        vx: 0, vy: 0,
      });
    }
  }

  const k = 80; // optimal spring distance

  for (let iter = 0; iter < 180; iter++) {
    const temp = ((180 - iter) / 180) * 8;

    // Repulsive forces between every pair of nodes
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const pA = nodePositions.get(nodes[a].id);
        const pB = nodePositions.get(nodes[b].id);
        if (!pA || !pB) continue;
        let dx = pA.x - pB.x;
        let dy = pA.y - pB.y;
        let d  = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (k * k) / d;
        pA.vx += (dx / d) * f;  pA.vy += (dy / d) * f;
        pB.vx -= (dx / d) * f;  pB.vy -= (dy / d) * f;
      }
    }

    // Attractive forces along connections
    for (const c of connections) {
      const pA = nodePositions.get(c.sourceId);
      const pB = nodePositions.get(c.destId);
      if (!pA || !pB) continue;
      let dx = pA.x - pB.x;
      let dy = pA.y - pB.y;
      let d  = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d * d) / k;
      pA.vx -= (dx / d) * f;  pA.vy -= (dy / d) * f;
      pB.vx += (dx / d) * f;  pB.vy += (dy / d) * f;
    }

    // Apply forces and bound within SVG area
    for (const n of nodes) {
      const p   = nodePositions.get(n.id);
      if (!p) continue;
      const mag = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
      p.x += (p.vx / mag) * Math.min(mag, temp);
      p.y += (p.vy / mag) * Math.min(mag, temp);
      p.x  = Math.max(PAD, Math.min(W - PAD, p.x));
      p.y  = Math.max(PAD, Math.min(H - PAD, p.y));
      p.vx = 0;
      p.vy = 0;
    }
  }
}

/**
 * Render the graph into an SVG element.
 *
 * @param {string} svgId
 * @param {Array}  nodes
 * @param {Array}  connections
 * @param {Array}  highlightedEdges - Array of {sourceId, destId} to draw with glow
 */
export function renderGraph(svgId, nodes, connections, highlightedEdges = []) {
  const svg = document.getElementById(svgId);
  if (!svg) return;

  _activeSvgId      = svgId;
  _activeHighlights = highlightedEdges;
  _activeNodes      = nodes;
  _activeConns      = connections;

  const W = 900, H = 500;
  svg.innerHTML = '';
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  if (!nodes || nodes.length === 0) return;

  attachDragListeners();

  // ── Defs: glow filter ────────────────────────────────────────────────────
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <filter id="${svgId}-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>`;
  svg.appendChild(defs);

  // ── Edges ────────────────────────────────────────────────────────────────
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

    // Weight label at midpoint
    const mx = (pA.x + pB.x) / 2;
    const my = (pA.y + pB.y) / 2;
    const wtLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    wtLabel.setAttribute('x', mx);
    wtLabel.setAttribute('y', my - 6);
    wtLabel.setAttribute('text-anchor', 'middle');
    wtLabel.setAttribute('fill', '#9999bb');
    wtLabel.setAttribute('font-size', '11px');
    wtLabel.setAttribute('font-family', 'inherit');
    wtLabel.textContent = conn.weight;
    svg.appendChild(wtLabel);
  }

  // ── Nodes ────────────────────────────────────────────────────────────────
  for (const node of nodes) {
    const pos = nodePositions.get(node.id);
    if (!pos) continue;

    const r    = NODE_RADII[node.type]   || 14;
    const fill = NODE_COLORS[node.type]  || '#888';

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `translate(${pos.x},${pos.y})`);
    g.style.cursor = 'grab';

    // Drag start
    g.addEventListener('mousedown', e => {
      e.preventDefault();
      _dragging  = true;
      _draggedId = node.id;
    });

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('r', r);
    circle.setAttribute('fill', fill);
    circle.setAttribute('filter', `url(#${svgId}-glow)`);
    circle.setAttribute('stroke', 'rgba(255,255,255,0.2)');
    circle.setAttribute('stroke-width', '1.5');
    g.appendChild(circle);

    // ID inside circle
    const idLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    idLabel.setAttribute('text-anchor', 'middle');
    idLabel.setAttribute('dy', '0.35em');
    idLabel.setAttribute('fill', '#ffffff');
    idLabel.setAttribute('font-size', `${Math.max(9, r - 5)}px`);
    idLabel.setAttribute('font-weight', 'bold');
    idLabel.setAttribute('font-family', 'inherit');
    idLabel.style.pointerEvents = 'none';
    idLabel.textContent = node.id;
    g.appendChild(idLabel);

    // Name below circle
    const nameLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    nameLabel.setAttribute('text-anchor', 'middle');
    nameLabel.setAttribute('y', r + 15);
    nameLabel.setAttribute('fill', '#e8e8f0');
    nameLabel.setAttribute('font-size', '11px');
    nameLabel.setAttribute('font-weight', '500');
    nameLabel.setAttribute('font-family', 'inherit');
    nameLabel.style.pointerEvents = 'none';
    nameLabel.textContent = node.name;
    g.appendChild(nameLabel);

    svg.appendChild(g);
  }
}

/** Remove cached position for a specific deleted node. */
export function removeNodePosition(id) {
  nodePositions.delete(id);
}

/** Clear all cached positions (call on import or sample load). */
export function clearPositionCache() {
  nodePositions.clear();
}
