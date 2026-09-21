// --- Global State ---
let nodes = [];       // Array of node objects
let connections = [];  // Array of connection objects
let simState = null;  // Simulation state
let simTimer = null;  // Animation timer

// State for ID generation and graph rendering
let typeCounters = { source: 1, station: 1, substation: 1, load: 1 };
let nodePositions = new Map(); // Store x,y coordinates for nodes
let isDragging = false;
let draggedNode = null;
let svgBounds = { width: 900, height: 500 };

document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupEventListeners();
    updateDynamicFields();
    
    // Auto-load data if available
    const saved = loadGrid();
    if (saved) {
        nodes = saved.nodes || [];
        connections = saved.connections || [];
        updateCountersFromNodes();
        renderNodeTable();
        renderConnTable();
        updateConnectionSelects();
    } else {
        updateIdPreview();
    }
});

// --- 1. Tab Navigation ---
function setupNavigation() {
    const tabs = [
        document.getElementById('nav-grid-builder'),
        document.getElementById('nav-shortest-path'),
        document.getElementById('nav-power-dist')
    ];
    
    tabs.forEach(tab => {
        if (!tab) return;
        tab.addEventListener('click', (e) => {
            // Remove active class from all tabs and sections
            tabs.forEach(t => t.classList.remove('active'));
            document.querySelectorAll('section').forEach(s => {
                if (s.id.startsWith('section-')) s.classList.remove('active');
            });
            
            // Add active class to clicked tab and corresponding section
            tab.classList.add('active');
            const targetId = tab.getAttribute('data-section');
            const section = document.getElementById(targetId);
            if (section) section.classList.add('active');
            
            // Load grid for visualization if switching to those tabs
            if (targetId === 'section-shortest-path' || targetId === 'section-power-dist') {
                loadGridForVisualization(targetId);
            }
        });
    });
}

// --- 15. Event Listeners Setup ---
function setupEventListeners() {
    // Grid Builder
    const typeSelect = document.getElementById('node-type-select');
    if (typeSelect) {
        typeSelect.addEventListener('change', () => {
            updateDynamicFields();
            updateIdPreview();
        });
    }

    const addNodeBtn = document.getElementById('add-node-btn');
    if (addNodeBtn) addNodeBtn.addEventListener('click', addNode);

    const addConnBtn = document.getElementById('add-conn-btn');
    if (addConnBtn) addConnBtn.addEventListener('click', addConnection);

    const saveGridBtn = document.getElementById('save-grid-btn');
    if (saveGridBtn) saveGridBtn.addEventListener('click', saveGridAction);

    const exportGridBtn = document.getElementById('export-grid-btn');
    if (exportGridBtn) exportGridBtn.addEventListener('click', exportGrid);

    const importGridBtn = document.getElementById('import-grid-btn');
    const importGridInput = document.getElementById('import-grid-input');
    if (importGridBtn && importGridInput) {
        importGridBtn.addEventListener('click', () => importGridInput.click());
        importGridInput.addEventListener('change', importGrid);
    }

    const loadSampleBtn = document.getElementById('load-sample-btn');
    if (loadSampleBtn) loadSampleBtn.addEventListener('click', loadSampleGrid);

    // Shortest Path
    const runAlgoBtn = document.getElementById('run-algorithm-btn');
    if (runAlgoBtn) runAlgoBtn.addEventListener('click', runAlgorithm);

    // Power Distribution
    const startSimBtn = document.getElementById('start-sim-btn');
    if (startSimBtn) startSimBtn.addEventListener('click', startSimulation);

    const stepSimBtn = document.getElementById('step-sim-btn');
    if (stepSimBtn) stepSimBtn.addEventListener('click', stepSimulation);

    const resetSimBtn = document.getElementById('reset-sim-btn');
    if (resetSimBtn) resetSimBtn.addEventListener('click', resetSimulation);
}

// --- 2. Dynamic Fields & 3. Node ID Generation ---
function updateDynamicFields() {
    const type = document.getElementById('node-type-select')?.value;
    const dynamicFields = document.getElementById('dynamic-fields');
    if (!dynamicFields) return;
    
    dynamicFields.innerHTML = '';
    
    if (type === 'source') {
        dynamicFields.innerHTML = `
            <div class="form-group">
                <label class="form-label" for="node-energy-input">Available Energy (MW)</label>
                <input class="form-input" type="number" id="node-energy-input" min="1" placeholder="e.g., 150">
            </div>
        `;
    } else if (type === 'station') {
        dynamicFields.innerHTML = `<p style="color: var(--text-secondary); font-size: 0.85rem; padding: 8px 0;">Power stations relay energy. No additional properties.</p>`;
    } else if (type === 'substation') {
        dynamicFields.innerHTML = `<p style="color: var(--text-secondary); font-size: 0.85rem; padding: 8px 0;">Substations distribute energy. No additional properties.</p>`;
    } else if (type === 'load') {
        dynamicFields.innerHTML = `
            <div class="form-group">
                <label class="form-label" for="node-category-input">Category</label>
                <input class="form-input" type="text" id="node-category-input" placeholder="e.g., Residential, Hospital">
            </div>
            <div class="form-group">
                <label class="form-label" for="node-demand-input">Demand (MW)</label>
                <input class="form-input" type="number" id="node-demand-input" min="1" placeholder="e.g., 30">
            </div>
            <div class="form-group">
                <label class="form-label" for="node-priority-input">Priority (0-9)</label>
                <input class="form-input" type="number" id="node-priority-input" min="0" max="9" placeholder="0-9, 9 is highest">
            </div>
        `;
    }
}

function getNextId(type) {
    const prefix = type === 'source' ? 'S' : 
                   type === 'station' ? 'P' : 
                   type === 'substation' ? 'SS' : 'L';
    return `${prefix}${typeCounters[type]}`;
}

function updateIdPreview() {
    const type = document.getElementById('node-type-select')?.value;
    if (type) {
        // Just for display if we had an element, but requirements didn't specify a specific ID for the preview element.
        // E.g. document.getElementById('node-id-preview').textContent = getNextId(type);
    }
}

function updateCountersFromNodes() {
    typeCounters = { source: 1, station: 1, substation: 1, load: 1 };
    nodes.forEach(n => {
        const match = n.id.match(/^([A-Z]+)(\d+)$/);
        if (match) {
            const prefix = match[1];
            const num = parseInt(match[2], 10);
            let typeKey = prefix === 'S' ? 'source' : prefix === 'P' ? 'station' : prefix === 'SS' ? 'substation' : 'load';
            if (num >= typeCounters[typeKey]) typeCounters[typeKey] = num + 1;
        }
    });
}

// --- 4. Add Node Validation ---
function addNode() {
    const type = document.getElementById('node-type-select').value;
    const name = document.getElementById('node-name-input').value.trim();
    
    if (!name) return showToast('Node name cannot be empty', 'error');
    
    let newNode = { id: getNextId(type), name, type };
    
    if (type === 'source') {
        if (nodes.some(n => n.type === 'source')) {
            return showToast('Only one power source is allowed.', 'error');
        }
        const energy = parseFloat(document.getElementById('node-energy-input').value);
        if (isNaN(energy) || energy <= 0) return showToast('Available energy must be > 0', 'error');
        newNode.availableEnergy = energy;
    } else if (type === 'load') {
        const category = document.getElementById('node-category-input').value.trim();
        const demand = parseFloat(document.getElementById('node-demand-input').value);
        const priority = parseInt(document.getElementById('node-priority-input').value, 10);
        
        if (!category) return showToast('Category cannot be empty', 'error');
        if (isNaN(demand) || demand <= 0) return showToast('Demand must be > 0', 'error');
        if (isNaN(priority) || priority < 0 || priority > 9) return showToast('Priority must be an integer between 0 and 9', 'error');
        
        newNode.category = category;
        newNode.demand = demand;
        newNode.priority = priority;
    }
    
    nodes.push(newNode);
    typeCounters[type]++;
    
    document.getElementById('node-name-input').value = '';
    updateDynamicFields();
    updateIdPreview();
    
    renderNodeTable();
    updateConnectionSelects();
    showToast(`Added ${type} node: ${newNode.id}`, 'success');
}

// --- 5. Add Connection Validation ---
function addConnection() {
    const sourceId = document.getElementById('conn-source-input').value;
    const destId = document.getElementById('conn-dest-input').value;
    const weight = parseFloat(document.getElementById('conn-weight-input').value);
    
    if (!sourceId || !destId) return showToast('Please select both source and destination', 'error');
    if (sourceId === destId) return showToast('Cannot connect a node to itself', 'error');
    if (isNaN(weight) || weight <= 0) return showToast('Connection weight must be > 0', 'error');
    
    const sourceNode = nodes.find(n => n.id === sourceId);
    const destNode = nodes.find(n => n.id === destId);
    
    if (!sourceNode || !destNode) return showToast('Selected nodes not found', 'error');
    
    // Duplicate check
    const isDuplicate = connections.some(c => 
        (c.sourceId === sourceId && c.destId === destId) || 
        (c.sourceId === destId && c.destId === sourceId)
    );
    if (isDuplicate) return showToast('This connection already exists', 'error');
    
    // Business rules
    const isSource1 = sourceNode.type === 'source';
    const isSource2 = destNode.type === 'source';
    if (isSource1 && isSource2) return showToast('Cannot connect two power sources', 'error');
    
    const isLoad1 = sourceNode.type === 'load';
    const isLoad2 = destNode.type === 'load';
    if (isLoad1 && isLoad2) return showToast('Loads cannot connect directly to other loads', 'error');
    
    if (isLoad1 && destNode.type !== 'substation') return showToast('Loads must connect to a substation', 'error');
    if (isLoad2 && sourceNode.type !== 'substation') return showToast('Loads must connect to a substation', 'error');
    
    connections.push({ sourceId, destId, weight });
    document.getElementById('conn-weight-input').value = '';
    
    renderConnTable();
    showToast(`Added connection: ${sourceId} <-> ${destId}`, 'success');
}

// --- 6. Node Table Rendering ---
function renderNodeTable() {
    const tbody = document.getElementById('node-table-body');
    const emptyState = document.getElementById('nodes-empty');
    const countDisplay = document.getElementById('node-count');
    
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (nodes.length === 0) {
        if (emptyState) emptyState.style.display = 'table-row';
    } else {
        if (emptyState) emptyState.style.display = 'none';
        
        nodes.forEach((node, index) => {
            const tr = document.createElement('tr');
            
            let detailsHtml = '';
            if (node.type === 'source') {
                detailsHtml = `Energy: <input type="number" class="editable-input" value="${node.availableEnergy}" onchange="updateNodeData('${node.id}', 'availableEnergy', this.value)"> MW`;
            } else if (node.type === 'load') {
                detailsHtml = `
                    Cat: <input type="text" class="editable-input" style="width: 70px" value="${node.category}" onchange="updateNodeData('${node.id}', 'category', this.value)"><br>
                    Dem: <input type="number" class="editable-input" style="width: 50px" value="${node.demand}" onchange="updateNodeData('${node.id}', 'demand', this.value)"> MW<br>
                    Pri: <input type="number" class="editable-input" style="width: 40px" value="${node.priority}" min="0" max="9" onchange="updateNodeData('${node.id}', 'priority', this.value)">
                `;
            } else {
                detailsHtml = `<span class="text-muted">N/A</span>`;
            }
            
            tr.innerHTML = `
                <td>${node.id}</td>
                <td><span class="type-badge ${node.type}">${node.type}</span></td>
                <td><input type="text" class="editable-input" value="${node.name}" onchange="updateNodeData('${node.id}', 'name', this.value)"></td>
                <td>${detailsHtml}</td>
                <td>
                    <button class="btn-small btn-danger" onclick="deleteNode('${node.id}')">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    if (countDisplay) countDisplay.textContent = `(${nodes.length})`;
}

window.updateNodeData = function(id, field, value) {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    
    if (field === 'demand' || field === 'availableEnergy') {
        node[field] = parseFloat(value) || 0;
    } else if (field === 'priority') {
        node[field] = parseInt(value, 10) || 0;
    } else {
        node[field] = value;
    }
}

window.deleteNode = function(id) {
    nodes = nodes.filter(n => n.id !== id);
    connections = connections.filter(c => c.sourceId !== id && c.destId !== id);
    
    renderNodeTable();
    renderConnTable();
    updateConnectionSelects();
    showToast(`Deleted node ${id} and related connections`, 'info');
}

// Helper to update connection dropdowns
function updateConnectionSelects() {
    const sourceSelect = document.getElementById('conn-source-input');
    const destSelect = document.getElementById('conn-dest-input');
    
    if (!sourceSelect || !destSelect) return;
    
    const options = nodes.map(n => `<option value="${n.id}">${n.id} - ${n.name}</option>`).join('');
    
    const sValue = sourceSelect.value;
    const dValue = destSelect.value;
    
    sourceSelect.innerHTML = '<option value="" disabled selected>Select Source Node...</option>' + options;
    destSelect.innerHTML = '<option value="" disabled selected>Select Dest Node...</option>' + options;
    
    if (nodes.some(n => n.id === sValue)) sourceSelect.value = sValue;
    if (nodes.some(n => n.id === dValue)) destSelect.value = dValue;
}

// --- 7. Connection Table Rendering ---
function renderConnTable() {
    const tbody = document.getElementById('conn-table-body');
    const emptyState = document.getElementById('conns-empty');
    const countDisplay = document.getElementById('conn-count');
    
    if (!tbody) return;
    tbody.innerHTML = '';
    
    if (connections.length === 0) {
        if (emptyState) emptyState.style.display = 'table-row';
    } else {
        if (emptyState) emptyState.style.display = 'none';
        
        connections.forEach((conn, index) => {
            const tr = document.createElement('tr');
            
            const options = nodes.map(n => `<option value="${n.id}">${n.id}</option>`).join('');
            
            tr.innerHTML = `
                <td>
                    <select class="editable-input" onchange="updateConnData(${index}, 'sourceId', this.value)">
                        ${options.replace(`value="${conn.sourceId}"`, `value="${conn.sourceId}" selected`)}
                    </select>
                </td>
                <td>
                    <select class="editable-input" onchange="updateConnData(${index}, 'destId', this.value)">
                        ${options.replace(`value="${conn.destId}"`, `value="${conn.destId}" selected`)}
                    </select>
                </td>
                <td>
                    <input type="number" class="editable-input" style="width: 60px" value="${conn.weight}" min="1" onchange="updateConnData(${index}, 'weight', this.value)">
                </td>
                <td>
                    <button class="btn-small btn-danger" onclick="deleteConnection(${index})">Delete</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    if (countDisplay) countDisplay.textContent = `(${connections.length})`;
}

window.updateConnData = function(index, field, value) {
    if (field === 'weight') {
        connections[index][field] = parseFloat(value) || 1;
    } else {
        // basic validation could go here
        connections[index][field] = value;
    }
}

window.deleteConnection = function(index) {
    connections.splice(index, 1);
    renderConnTable();
    showToast('Connection deleted', 'info');
}

// --- 8. Save/Load/Export/Import ---
function saveGridAction() {
    saveGrid();
    showToast('Grid saved to local storage', 'success');
}

function saveGrid() {
    localStorage.setItem('powerGridData', JSON.stringify({ nodes, connections }));
}

function loadGrid() {
    const data = localStorage.getItem('powerGridData');
    if (data) {
        try {
            return JSON.parse(data);
        } catch (e) {
            console.error('Failed to parse grid data', e);
        }
    }
    return null;
}

function exportGrid() {
    const dataStr = JSON.stringify({ nodes, connections }, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'power-grid.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Grid exported successfully', 'success');
}

function importGrid(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (data.nodes && Array.isArray(data.nodes) && data.connections && Array.isArray(data.connections)) {
                nodes = data.nodes;
                connections = data.connections;
                updateCountersFromNodes();
                nodePositions.clear(); // Reset layout cache
                
                renderNodeTable();
                renderConnTable();
                updateConnectionSelects();
                saveGrid(); // Auto save
                
                showToast('Grid imported successfully', 'success');
            } else {
                showToast('Invalid grid file format', 'error');
            }
        } catch (err) {
            showToast('Error parsing file', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
}

// --- 9. Sample Grid ---
function loadSampleGrid() {
    nodes = [
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
    ];
    
    connections = [
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
    ];
    
    updateCountersFromNodes();
    nodePositions.clear();
    
    renderNodeTable();
    renderConnTable();
    updateConnectionSelects();
    saveGrid();
    showToast('Sample grid loaded successfully', 'success');
}

// --- 10. Graph Visualization (SVG) ---
function runForceLayout() {
    if (nodes.length === 0) return;
    
    // Initialize random positions for nodes without a position
    nodes.forEach(n => {
        if (!nodePositions.has(n.id)) {
            nodePositions.set(n.id, {
                x: 50 + Math.random() * (svgBounds.width - 100),
                y: 50 + Math.random() * (svgBounds.height - 100),
                vx: 0, vy: 0
            });
        }
    });

    const k = 80; // optimal distance
    const iterations = 200;
    
    for (let i = 0; i < iterations; i++) {
        const temperature = (iterations - i) / iterations * 10;
        
        // Repulsive forces
        for (let j = 0; j < nodes.length; j++) {
            for (let m = j + 1; m < nodes.length; m++) {
                const u = nodes[j].id;
                const v = nodes[m].id;
                const posU = nodePositions.get(u);
                const posV = nodePositions.get(v);
                
                let dx = posU.x - posV.x;
                let dy = posU.y - posV.y;
                let dist = Math.sqrt(dx*dx + dy*dy) || 1;
                
                const force = (k * k) / dist;
                const fx = (dx / dist) * force;
                const fy = (dy / dist) * force;
                
                posU.vx += fx; posU.vy += fy;
                posV.vx -= fx; posV.vy -= fy;
            }
        }
        
        // Attractive forces
        connections.forEach(edge => {
            const posU = nodePositions.get(edge.sourceId);
            const posV = nodePositions.get(edge.destId);
            if (!posU || !posV) return;
            
            let dx = posU.x - posV.x;
            let dy = posU.y - posV.y;
            let dist = Math.sqrt(dx*dx + dy*dy) || 1;
            
            const force = (dist * dist) / k; // Hooke's law variant
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            
            posU.vx -= fx; posU.vy -= fy;
            posV.vx += fx; posV.vy += fy;
        });
        
        // Apply forces & bound
        nodes.forEach(n => {
            const pos = nodePositions.get(n.id);
            const disp = Math.sqrt(pos.vx*pos.vx + pos.vy*pos.vy) || 1;
            
            pos.x += (pos.vx / disp) * Math.min(disp, temperature);
            pos.y += (pos.vy / disp) * Math.min(disp, temperature);
            
            // Keep in bounds
            pos.x = Math.max(30, Math.min(svgBounds.width - 30, pos.x));
            pos.y = Math.max(30, Math.min(svgBounds.height - 30, pos.y));
            
            // Damping
            pos.vx = 0;
            pos.vy = 0;
        });
    }
}

let currentSvgId = null;
let currentHighlightedEdges = [];

function renderGraph(svgId, highlightedEdges = []) {
    const svg = document.getElementById(svgId);
    if (!svg) return;
    
    currentSvgId = svgId;
    currentHighlightedEdges = highlightedEdges;
    let svgElement = svg;
    svg.innerHTML = ''; // Clear
    svg.setAttribute('viewBox', `0 0 ${svgBounds.width} ${svgBounds.height}`);
    
    // SVG Filter for glow
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
    `;
    svg.appendChild(defs);
    
    // Draw edges
    connections.forEach(edge => {
        const posU = nodePositions.get(edge.sourceId);
        const posV = nodePositions.get(edge.destId);
        if (!posU || !posV) return;
        
        const isHighlighted = highlightedEdges.some(e => 
            (e.sourceId === edge.sourceId && e.destId === edge.destId) ||
            (e.sourceId === edge.destId && e.destId === edge.sourceId)
        );
        
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', posU.x);
        line.setAttribute('y1', posU.y);
        line.setAttribute('x2', posV.x);
        line.setAttribute('y2', posV.y);
        
        if (isHighlighted) {
            line.setAttribute('stroke', '#10b981');
            line.setAttribute('stroke-width', '3');
            line.setAttribute('class', 'highlight-edge energy-flow-line');
            line.setAttribute('filter', 'url(#glow)');
        } else {
            line.setAttribute('stroke', 'rgba(100,100,255,0.3)');
            line.setAttribute('stroke-width', '1.5');
        }
        svg.appendChild(line);
        
        // Edge weight
        const mx = (posU.x + posV.x) / 2;
        const my = (posU.y + posV.y) / 2;
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', mx);
        text.setAttribute('y', my - 5);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('fill', 'var(--text-muted, #888)');
        text.setAttribute('font-size', '10px');
        text.textContent = edge.weight;
        svg.appendChild(text);
    });
    
    // Node attributes
    const nodeConfig = {
        source: { r: 22, fill: '#ff6b35' },
        station: { r: 18, fill: '#4ecdc4' },
        substation: { r: 16, fill: '#a78bfa' },
        load: { r: 14, fill: '#f472b6' }
    };
    
    // Draw nodes
    nodes.forEach(node => {
        const pos = nodePositions.get(node.id);
        if (!pos) return;
        
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'graph-node');
        g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);
        
        // Node Dragging Setup
        g.style.cursor = 'grab';
        g.addEventListener('mousedown', (e) => {
            isDragging = true;
            draggedNode = node.id;
            svg.style.cursor = 'grabbing';
            g.style.cursor = 'grabbing';
        });
        
        const conf = nodeConfig[node.type] || nodeConfig.load;
        
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('r', conf.r);
        circle.setAttribute('fill', conf.fill);
        circle.setAttribute('filter', 'url(#glow)');
        g.appendChild(circle);
        
        const idText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        idText.setAttribute('text-anchor', 'middle');
        idText.setAttribute('dy', '0.3em'); // center vertically
        idText.setAttribute('fill', '#fff');
        idText.setAttribute('font-size', '10px');
        idText.setAttribute('font-weight', 'bold');
        idText.style.pointerEvents = 'none';
        idText.textContent = node.id;
        g.appendChild(idText);
        
        const nameText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        nameText.setAttribute('text-anchor', 'middle');
        nameText.setAttribute('y', conf.r + 15);
        nameText.setAttribute('fill', '#e8e8f0');
        nameText.setAttribute('font-size', '12px');
        nameText.style.pointerEvents = 'none';
        nameText.textContent = node.name;
        g.appendChild(nameText);
        
        svg.appendChild(g);
    });
    
    // Document level drag handlers
    if (!window.dragSetup) {
        window.dragSetup = true;
        document.addEventListener('mousemove', (e) => {
            if (isDragging && draggedNode && currentSvgId) {
                const activeSvg = document.getElementById(currentSvgId);
                if (!activeSvg) return;
                const pt = activeSvg.createSVGPoint();
                pt.x = e.clientX;
                pt.y = e.clientY;
                const svgP = pt.matrixTransform(activeSvg.getScreenCTM().inverse());
                
                const pos = nodePositions.get(draggedNode);
                if (pos) {
                    pos.x = Math.max(30, Math.min(svgBounds.width - 30, svgP.x));
                    pos.y = Math.max(30, Math.min(svgBounds.height - 30, svgP.y));
                    renderGraph(currentSvgId, currentHighlightedEdges);
                }
            }
        });
        
        document.addEventListener('mouseup', () => {
            isDragging = false;
            draggedNode = null;
        });
    }
}

// --- 11. Graph Algorithms ---

// Build adjacency list { u: [{node: v, weight}, ...] }
function buildAdjList() {
    const adj = {};
    nodes.forEach(n => adj[n.id] = []);
    connections.forEach(c => {
        adj[c.sourceId].push({ node: c.destId, weight: c.weight });
        adj[c.destId].push({ node: c.sourceId, weight: c.weight });
    });
    return adj;
}

// Dijkstra's Algorithm
function dijkstra(sourceId) {
    const adj = buildAdjList();
    const distances = {};
    const predecessors = {};
    const pq = []; // Simple array acting as priority queue
    
    // Initialize distances to Infinity
    nodes.forEach(n => {
        distances[n.id] = Infinity;
        predecessors[n.id] = null;
    });
    
    distances[sourceId] = 0;
    pq.push({ id: sourceId, dist: 0 });
    
    while (pq.length > 0) {
        // Extract min
        pq.sort((a, b) => a.dist - b.dist);
        const u = pq.shift().id;
        
        // Relaxation loop
        adj[u].forEach(neighbor => {
            const v = neighbor.node;
            const w = neighbor.weight;
            if (distances[u] + w < distances[v]) {
                distances[v] = distances[u] + w;
                predecessors[v] = u;
                pq.push({ id: v, dist: distances[v] });
            }
        });
    }
    
    return { distances, predecessors };
}

// Bellman-Ford Algorithm
function bellmanFord(sourceId) {
    const distances = {};
    const predecessors = {};
    
    // Initialize distances
    nodes.forEach(n => {
        distances[n.id] = Infinity;
        predecessors[n.id] = null;
    });
    distances[sourceId] = 0;
    
    // Repeat |V|-1 times
    for (let i = 0; i < nodes.length - 1; i++) {
        connections.forEach(edge => {
            // Undirected graph, so check both directions
            const u = edge.sourceId, v = edge.destId, w = edge.weight;
            
            if (distances[u] + w < distances[v]) {
                distances[v] = distances[u] + w;
                predecessors[v] = u;
            }
            if (distances[v] + w < distances[u]) {
                distances[u] = distances[v] + w;
                predecessors[u] = v;
            }
        });
    }
    
    return { distances, predecessors };
}

// Floyd-Warshall Algorithm
function floydWarshall(sourceId) {
    const dist = {};
    const next = {};
    
    // Initialize matrices
    nodes.forEach(u => {
        dist[u.id] = {};
        next[u.id] = {};
        nodes.forEach(v => {
            dist[u.id][v.id] = u.id === v.id ? 0 : Infinity;
            next[u.id][v.id] = null;
        });
    });
    
    // Populate direct edges
    connections.forEach(c => {
        dist[c.sourceId][c.destId] = c.weight;
        dist[c.destId][c.sourceId] = c.weight; // Undirected
        next[c.sourceId][c.destId] = c.destId;
        next[c.destId][c.sourceId] = c.sourceId;
    });
    
    // Triple nested loop
    nodes.forEach(k => {
        nodes.forEach(i => {
            nodes.forEach(j => {
                if (dist[i.id][k.id] + dist[k.id][j.id] < dist[i.id][j.id]) {
                    dist[i.id][j.id] = dist[i.id][k.id] + dist[k.id][j.id];
                    next[i.id][j.id] = next[i.id][k.id];
                }
            });
        });
    });
    
    // Extract source row to match expected format
    const distances = {};
    const predecessors = {};
    
    nodes.forEach(n => {
        distances[n.id] = dist[sourceId][n.id];
        
        // Reconstruct predecessor by walking back
        // For Floyd-Warshall, next[u][v] gives the next node from u to v.
        // We want predecessor, which is the node just before v on path from source.
        if (distances[n.id] !== Infinity && n.id !== sourceId) {
            let curr = sourceId;
            let prev = null;
            // Guard against infinite loop in case of bad path
            let steps = 0;
            while (curr !== n.id && steps < nodes.length) {
                prev = curr;
                curr = next[curr][n.id];
                steps++;
            }
            predecessors[n.id] = prev;
        } else {
            predecessors[n.id] = null;
        }
    });
    
    return { distances, predecessors };
}

// Path reconstruction
function reconstructPath(predecessors, targetId) {
    const path = [];
    let curr = targetId;
    
    while (curr !== null) {
        path.unshift(curr);
        curr = predecessors[curr];
    }
    
    // If path only has target and target is not source (which would have no predecessor), it's unreachable
    // Except if it's the source itself.
    if (path.length <= 1 && predecessors[targetId] === null && targetId !== getSourceNode()?.id) {
        return null; // Unreachable
    }
    
    return path;
}

// Get the power source node
function getSourceNode() {
    return nodes.find(n => n.type === 'source');
}

// --- 12. Shortest Path Section Logic ---

function loadGridForVisualization(sectionId) {
    const saved = loadGrid();
    if (saved) {
        nodes = saved.nodes || [];
        connections = saved.connections || [];
    }
    
    const isSP = sectionId === 'section-shortest-path';
    const noMsgId = isSP ? 'sp-no-grid-msg' : 'pd-no-grid-msg';
    const contentId = isSP ? 'sp-content' : 'pd-content';
    const svgId = isSP ? 'sp-graph-svg' : 'pd-graph-svg';
    
    const noMsg = document.getElementById(noMsgId);
    const content = document.getElementById(contentId);
    
    if (nodes.length === 0) {
        if (noMsg) noMsg.style.display = 'block';
        if (content) content.style.display = 'none';
    } else {
        if (noMsg) noMsg.style.display = 'none';
        if (content) content.style.display = 'block';
        runForceLayout();
        renderGraph(svgId);
    }
}

function runAlgorithm() {
    const algo = document.getElementById('algorithm-select').value;
    const sourceNode = getSourceNode();
    
    if (!sourceNode) return showToast('No power source found in the grid.', 'error');
    
    let results;
    if (algo === 'dijkstra') results = dijkstra(sourceNode.id);
    else if (algo === 'bellman-ford') results = bellmanFord(sourceNode.id);
    else if (algo === 'floyd-warshall') results = floydWarshall(sourceNode.id);
    
    const { distances, predecessors } = results;
    const loadNodes = nodes.filter(n => n.type === 'load');
    
    const tbody = document.getElementById('sp-results-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    let highlightedEdges = [];
    
    loadNodes.forEach(load => {
        const dist = distances[load.id];
        const path = reconstructPath(predecessors, load.id);
        const tr = document.createElement('tr');
        
        if (path) {
            const pathStr = path.join(' → ');
            tr.innerHTML = `
                <td><span class="type-badge load">Load</span> ${load.name} (${load.id})</td>
                <td>${load.priority}</td>
                <td>${load.demand} MW</td>
                <td>${pathStr}</td>
                <td>${dist}</td>
            `;
            
            // Add edges to highlighted
            for (let i = 0; i < path.length - 1; i++) {
                highlightedEdges.push({ sourceId: path[i], destId: path[i+1] });
            }
        } else {
            tr.classList.add('text-muted');
            tr.innerHTML = `
                <td><span class="type-badge load">Load</span> ${load.name} (${load.id})</td>
                <td>${load.priority}</td>
                <td>${load.demand} MW</td>
                <td>Unreachable</td>
                <td>∞</td>
            `;
        }
        tbody.appendChild(tr);
    });
    
    renderGraph('sp-graph-svg', highlightedEdges);
    showToast(`Ran ${algo.replace('-', ' ')} algorithm successfully`, 'success');
}

// --- 13. Power Distribution Section Logic ---

function buildPriorityQueue(distances, predecessors) {
    const loadNodes = nodes.filter(n => n.type === 'load');
    const queue = loadNodes.map(load => {
        const path = reconstructPath(predecessors, load.id);
        const reachable = path !== null;
        const dist = distances[load.id];
        return { ...load, reachable, dist, path };
    });
    
    // Sort: priority DESC, distance ASC, ID ASC (for tie-breaking)
    queue.sort((a, b) => {
        if (!a.reachable && b.reachable) return 1;
        if (a.reachable && !b.reachable) return -1;
        
        if (b.priority !== a.priority) return b.priority - a.priority;
        if (a.dist !== b.dist) return a.dist - b.dist;
        return a.id.localeCompare(b.id);
    });
    
    return queue;
}

function allocateEnergy(totalEnergy, queue) {
    let remaining = totalEnergy;
    let results = [];
    
    for (let item of queue) {
        if (!item.reachable) {
            results.push({ ...item, allocated: 0, status: 'Not Supplied' });
            continue;
        }
        if (remaining <= 0) {
            results.push({ ...item, allocated: 0, status: 'Not Supplied' });
            continue;
        }
        
        let alloc = Math.min(item.demand, remaining);
        remaining -= alloc;
        let status = alloc === item.demand ? 'Fully Supplied' : 'Partially Supplied';
        results.push({ ...item, allocated: alloc, status });
    }
    
    return { results, remaining };
}

function renderPriorityQueue(queue) {
    const list = document.getElementById('priority-queue-list');
    if (!list) return;
    list.innerHTML = '';
    
    queue.forEach(item => {
        const div = document.createElement('div');
        div.className = `queue-item`;
        div.id = `queue-item-${item.id}`;
        
        const distText = item.reachable ? `Dist: ${item.dist}` : 'Unreachable';
        
        div.innerHTML = `
            <div class="priority-badge">${item.priority}</div>
            <div class="queue-details">
                <strong>${item.name}</strong><br>
                <span>Dem: ${item.demand}MW | ${distText}</span>
            </div>
        `;
        list.appendChild(div);
    });
}

function initSimulation() {
    const sourceNode = getSourceNode();
    if (!sourceNode) {
        showToast('No source node found!', 'error');
        return false;
    }
    
    // Use Dijkstra for distribution routing
    const { distances, predecessors } = dijkstra(sourceNode.id);
    const queue = buildPriorityQueue(distances, predecessors);
    
    // Use user-entered energy value from the input field, fallback to source's available energy
    const inputEnergy = document.getElementById('total-energy-input');
    const totalEnergy = inputEnergy ? parseFloat(inputEnergy.value) || sourceNode.availableEnergy : sourceNode.availableEnergy;
    const totalDemand = queue.reduce((sum, item) => sum + item.demand, 0);
    
    simState = {
        queue,
        totalEnergy,
        remainingEnergy: totalEnergy,
        currentIndex: 0,
        results: [],
        totalDemand
    };
    
    document.getElementById('total-demand-display').textContent = `${totalDemand} MW`;
    document.getElementById('total-supplied-display').textContent = `0 MW`;
    document.getElementById('total-remaining-display').textContent = `${totalEnergy} MW`;
    document.getElementById('remaining-energy-display').textContent = `${totalEnergy}`;
    
    renderPriorityQueue(queue);
    
    const tbody = document.getElementById('pd-results-body');
    if (tbody) tbody.innerHTML = '';
    
    renderGraph('pd-graph-svg', []);
    return true;
}

function startSimulation() {
    if (!simState && !initSimulation()) return;
    
    if (simTimer) clearInterval(simTimer);
    
    simTimer = setInterval(() => {
        if (!stepSimulation()) {
            clearInterval(simTimer);
            simTimer = null;
        }
    }, 800);
    
    showToast('Simulation started', 'info');
}

function stepSimulation() {
    if (!simState && !initSimulation()) return false;
    
    if (simState.currentIndex >= simState.queue.length) {
        showToast('Simulation complete', 'success');
        return false;
    }
    
    // Clear previous active
    document.querySelectorAll('.queue-item').forEach(el => el.classList.remove('active'));
    
    const item = simState.queue[simState.currentIndex];
    const qEl = document.getElementById(`queue-item-${item.id}`);
    if (qEl) qEl.classList.add('active');
    
    // Allocate
    let allocated = 0;
    let status = 'Not Supplied';
    
    if (item.reachable && simState.remainingEnergy > 0) {
        allocated = Math.min(item.demand, simState.remainingEnergy);
        simState.remainingEnergy -= allocated;
        status = allocated === item.demand ? 'Fully Supplied' : 'Partially Supplied';
    }
    
    const resultItem = { ...item, allocated, status };
    simState.results.push(resultItem);
    
    // Mark processed
    if (qEl) {
        qEl.classList.add('processed');
        if (status === 'Fully Supplied') qEl.classList.add('fully-supplied');
        else if (status === 'Partially Supplied') qEl.classList.add('partially-supplied');
        else qEl.classList.add('not-supplied');
    }
    
    // Update Results Table
    const tbody = document.getElementById('pd-results-body');
    if (tbody) {
        const tr = document.createElement('tr');
        const statusClass = status === 'Fully Supplied' ? 'status-full' : 
                            status === 'Partially Supplied' ? 'status-partial' : 'status-none';
        
        tr.innerHTML = `
            <td>${item.name} (${item.id})</td>
            <td>${item.priority}</td>
            <td>${item.demand}</td>
            <td>${allocated}</td>
            <td><span class="status-badge ${statusClass}">${status}</span></td>
        `;
        tbody.appendChild(tr);
    }
    
    // Update Stats
    const totalSupplied = simState.totalEnergy - simState.remainingEnergy;
    document.getElementById('total-supplied-display').textContent = `${totalSupplied} MW`;
    document.getElementById('total-remaining-display').textContent = `${simState.remainingEnergy} MW`;
    document.getElementById('remaining-energy-display').textContent = `${simState.remainingEnergy}`;
    
    // Highlight Path on SVG
    if (item.reachable && allocated > 0 && item.path) {
        let highlightedEdges = [];
        for (let i = 0; i < item.path.length - 1; i++) {
            highlightedEdges.push({ sourceId: item.path[i], destId: item.path[i+1] });
        }
        renderGraph('pd-graph-svg', highlightedEdges);
    }
    
    simState.currentIndex++;
    return true; // continue
}

function resetSimulation() {
    if (simTimer) {
        clearInterval(simTimer);
        simTimer = null;
    }
    simState = null;
    initSimulation();
    showToast('Simulation reset', 'info');
}

// --- 14. Toast Notifications ---
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('toast-exit');
        toast.addEventListener('animationend', () => {
            toast.remove();
        });
        // Fallback removal
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}
