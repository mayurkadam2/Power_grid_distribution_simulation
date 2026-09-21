/**
 * ui/builderView.js
 * Manages the Grid Builder section (Section 1).
 *
 * Responsibilities:
 *  - Show/hide type-specific form fields
 *  - Add nodes and connections through the Graph model
 *  - Render editable node and connection tables with validation
 *  - Handle save, export, import, and load-sample actions
 */

import { NODE_TYPES } from '../constants.js';
import { showToast }  from './toast.js';
import { saveGrid, DEFAULT_SAMPLE_GRID } from '../storage/storage.js';
import { clearPositionCache, removeNodePosition } from './graphRenderer.js';

/**
 * Initialise the Grid Builder view.
 *
 * @param {import('../models/Graph.js').Graph} graph
 * @param {Function} onGridChange - Called after any structural change; triggers live graph refresh
 */
export function initBuilderView(graph, onGridChange) {
  // Populate dynamic fields on type change
  const typeSelect = document.getElementById('node-type-select');
  if (typeSelect) {
    typeSelect.addEventListener('change', updateDynamicFields);
    updateDynamicFields(); // initialise on load
  }

  // Add Node
  const addNodeBtn = document.getElementById('add-node-btn');
  if (addNodeBtn) {
    addNodeBtn.addEventListener('click', () => {
      try {
        const type = document.getElementById('node-type-select')?.value;
        const name = document.getElementById('node-name-input')?.value?.trim();
        const extra = readExtraFields(type);
        const newNode = graph.addNode(type, name, extra);
        document.getElementById('node-name-input').value = '';
        updateDynamicFields();
        renderNodeTable(graph, onGridChange);
        renderConnTable(graph, onGridChange);
        updateConnectionDropdowns(graph);
        onGridChange();
        showToast(`Node ${newNode.id} (${newNode.name}) added.`, 'success');
      } catch (e) {
        showToast(e.message, 'error');
      }
    });
  }

  // Add Connection
  const addConnBtn = document.getElementById('add-conn-btn');
  if (addConnBtn) {
    addConnBtn.addEventListener('click', () => {
      try {
        const srcId  = document.getElementById('conn-source-input')?.value;
        const dstId  = document.getElementById('conn-dest-input')?.value;
        const weight = document.getElementById('conn-weight-input')?.value;
        graph.addConnection(srcId, dstId, weight);
        document.getElementById('conn-weight-input').value = '';
        renderConnTable(graph, onGridChange);
        onGridChange();
        showToast(`Connection ${srcId} ↔ ${dstId} added.`, 'success');
      } catch (e) {
        showToast(e.message, 'error');
      }
    });
  }

  // Save Grid
  const saveBtn = document.getElementById('save-grid-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      saveGrid(graph.serialize());
      showToast('Grid saved to local storage.', 'success');
    });
  }

  // Export JSON
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

  // Import JSON
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
          if (!Array.isArray(data.nodes) || !Array.isArray(data.connections)) {
            throw new Error('Invalid file format: missing nodes or connections array.');
          }
          graph.loadFromData(data);
          clearPositionCache();
          renderNodeTable(graph, onGridChange);
          renderConnTable(graph, onGridChange);
          updateConnectionDropdowns(graph);
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

  // Load Sample Grid
  const sampleBtn = document.getElementById('load-sample-btn');
  if (sampleBtn) {
    sampleBtn.addEventListener('click', () => {
      const applySample = (data) => {
        graph.loadFromData(data);
        clearPositionCache();
        saveGrid(graph.serialize());
        renderNodeTable(graph, onGridChange);
        renderConnTable(graph, onGridChange);
        updateConnectionDropdowns(graph);
        onGridChange();
        showToast('Sample grid loaded successfully!', 'success');
      };

      // Try fetching sample JSON first; fallback to embedded sample data for file://
      fetch('./data/sample-grid.json')
        .then(r => {
          if (!r.ok) throw new Error('HTTP status ' + r.status);
          return r.json();
        })
        .then(applySample)
        .catch(() => {
          // Graceful fallback for file:// protocol or offline mode
          applySample(DEFAULT_SAMPLE_GRID);
        });
    });
  }

  // Initial render (in case data was pre-loaded)
  renderNodeTable(graph, onGridChange);
  renderConnTable(graph, onGridChange);
  updateConnectionDropdowns(graph);
}

// ── Dynamic Form Fields ──────────────────────────────────────────────────────

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
    container.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;padding:6px 0 12px 0;">
      Power stations & substations relay energy. No additional properties required.</p>`;
  }
}

/** Read type-specific extra fields from the form. */
function readExtraFields(type) {
  if (type === NODE_TYPES.SOURCE) {
    return { availableEnergy: document.getElementById('node-energy-input')?.value };
  }
  if (type === NODE_TYPES.LOAD) {
    return {
      category: document.getElementById('node-category-input')?.value?.trim() || 'General',
      demand:   document.getElementById('node-demand-input')?.value,
      priority: document.getElementById('node-priority-input')?.value,
    };
  }
  return {};
}

// ── Node Table ───────────────────────────────────────────────────────────────

function renderNodeTable(graph, onGridChange) {
  const tbody      = document.getElementById('node-table-body');
  const emptyState = document.getElementById('nodes-empty');
  const countEl    = document.getElementById('node-count');
  if (!tbody) return;

  const nodes = graph.getNodes();
  tbody.innerHTML = '';

  if (countEl) countEl.textContent = `${nodes.length} node${nodes.length === 1 ? '' : 's'}`;
  if (emptyState) emptyState.style.display = nodes.length === 0 ? 'block' : 'none';

  for (const node of nodes) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${node.id}</strong></td>
      <td><span class="type-badge ${node.type}">${node.type}</span></td>
      <td><input class="editable-input" type="text" value="${escHtml(node.name)}" data-id="${node.id}" data-field="name" style="width:100%;max-width:180px;"></td>
      <td>${buildDetailsCell(node)}</td>
      <td>
        <button class="btn-small btn-danger" data-delete-node="${node.id}">Delete</button>
      </td>`;
    tbody.appendChild(tr);
  }

  // Inline edit — name and detail fields with validation and error rollback
  tbody.querySelectorAll('.editable-input').forEach(input => {
    input.addEventListener('change', e => {
      const id    = e.target.dataset.id;
      const field = e.target.dataset.field;
      const val   = e.target.value;
      try {
        graph.updateNode(id, field, val);
        if (field === 'name') {
          updateConnectionDropdowns(graph);
          renderConnTable(graph, onGridChange);
        }
        onGridChange();
        showToast(`Node ${id} updated.`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
        renderNodeTable(graph, onGridChange); // rollback to previous valid state
      }
    });
  });

  // Delete buttons
  tbody.querySelectorAll('[data-delete-node]').forEach(btn => {
    btn.addEventListener('click', e => {
      const id = e.target.dataset.deleteNode;
      try {
        graph.deleteNode(id);
        removeNodePosition(id);
        renderNodeTable(graph, onGridChange);
        renderConnTable(graph, onGridChange);
        updateConnectionDropdowns(graph);
        onGridChange();
        showToast(`Node ${id} deleted.`, 'info');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

function buildDetailsCell(node) {
  if (node.type === NODE_TYPES.SOURCE) {
    return `Energy: <input class="editable-input" type="number" value="${node.availableEnergy}"
      data-id="${node.id}" data-field="availableEnergy" style="width:75px" min="1"> MW`;
  }
  if (node.type === NODE_TYPES.LOAD) {
    return `
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
        <span>Cat: <input class="editable-input" type="text" value="${escHtml(node.category || 'General')}"
          data-id="${node.id}" data-field="category" style="width:85px"></span>
        <span>Dem: <input class="editable-input" type="number" value="${node.demand}"
          data-id="${node.id}" data-field="demand" style="width:60px" min="1"> MW</span>
        <span>Pri: <input class="editable-input" type="number" value="${node.priority}" min="0" max="9"
          data-id="${node.id}" data-field="priority" style="width:45px"></span>
      </div>`;
  }
  return '<span style="color:var(--text-muted)">—</span>';
}

// ── Connection Table ─────────────────────────────────────────────────────────

function renderConnTable(graph, onGridChange) {
  const tbody      = document.getElementById('conn-table-body');
  const emptyState = document.getElementById('conns-empty');
  const countEl    = document.getElementById('conn-count');
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
      <td><input class="editable-input" type="number" value="${conn.weight}" min="0.1" step="0.1"
        data-conn-idx="${idx}" data-field="weight" style="width:75px"></td>
      <td>
        <button class="btn-small btn-danger" data-delete-conn="${idx}">Delete</button>
      </td>`;
    tbody.appendChild(tr);
  });

  // Inline edit connections with validation and rollback
  tbody.querySelectorAll('.editable-input[data-conn-idx]').forEach(input => {
    input.addEventListener('change', e => {
      const idx    = parseInt(e.target.dataset.connIdx, 10);
      const row    = input.closest('tr');
      const srcSel = row.querySelector('[data-field="sourceId"]');
      const dstSel = row.querySelector('[data-field="destId"]');
      const wtInp  = row.querySelector('[data-field="weight"]');
      try {
        graph.updateConnection(idx, srcSel.value, dstSel.value, wtInp.value);
        onGridChange();
        showToast(`Connection updated.`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
        renderConnTable(graph, onGridChange); // rollback to previous valid state
      }
    });
  });

  // Delete buttons
  tbody.querySelectorAll('[data-delete-conn]').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = parseInt(e.target.dataset.deleteConn, 10);
      try {
        graph.deleteConnection(idx);
        renderConnTable(graph, onGridChange);
        onGridChange();
        showToast('Connection deleted.', 'info');
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  });
}

// ── Connection Dropdowns ─────────────────────────────────────────────────────

function updateConnectionDropdowns(graph) {
  const srcSel = document.getElementById('conn-source-input');
  const dstSel = document.getElementById('conn-dest-input');
  if (!srcSel || !dstSel) return;

  const prevSrc = srcSel.value;
  const prevDst = dstSel.value;
  const opts = graph.getNodes()
    .map(n => `<option value="${n.id}">${n.id} (${escHtml(n.name)})</option>`)
    .join('');
  const placeholder = '<option value="" disabled selected>Select node…</option>';
  srcSel.innerHTML = placeholder + opts;
  dstSel.innerHTML = placeholder + opts;
  if (prevSrc && graph.getNodes().some(n => n.id === prevSrc)) srcSel.value = prevSrc;
  if (prevDst && graph.getNodes().some(n => n.id === prevDst)) dstSel.value = prevDst;
}

// ── Utility ──────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
