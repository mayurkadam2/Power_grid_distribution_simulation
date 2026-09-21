/**
 * models/Graph.js
 * The single source of truth for all grid data.
 * Manages nodes and connections with full validation.
 * Pure model layer — no DOM access.
 */

import { NODE_TYPES, PRIORITY_MIN, PRIORITY_MAX } from '../constants.js';

export class Graph {
  constructor() {
    /** @type {Array<Object>} */
    this.nodes = [];
    /** @type {Array<{sourceId: string, destId: string, weight: number}>} */
    this.connections = [];
    // Auto-increment counters per type for ID generation
    this._counters = { source: 1, station: 1, substation: 1, load: 1 };
  }

  // ─── ID Generation ────────────────────────────────────────────────────────

  /** @param {string} type @returns {string} */
  _nextId(type) {
    const prefixes = {
      [NODE_TYPES.SOURCE]:     'S',
      [NODE_TYPES.STATION]:    'P',
      [NODE_TYPES.SUBSTATION]: 'SS',
      [NODE_TYPES.LOAD]:       'L',
    };
    return `${prefixes[type]}${this._counters[type]++}`;
  }

  /** Sync counters after loading external data so IDs don't collide. */
  _syncCounters() {
    this._counters = { source: 1, station: 1, substation: 1, load: 1 };
    for (const node of this.nodes) {
      const m = node.id.match(/^([A-Z]+)(\d+)$/);
      if (!m) continue;
      const num = parseInt(m[2], 10) + 1;
      if (num > this._counters[node.type]) this._counters[node.type] = num;
    }
  }

  // ─── Node Management ──────────────────────────────────────────────────────

  /**
   * Add a node to the grid with full validation.
   * @param {string} type  - One of NODE_TYPES values
   * @param {string} name  - Human-readable label
   * @param {Object} extra - Type-specific fields (availableEnergy | demand, priority, category)
   * @returns {Object} The created node
   * @throws {Error} On validation failure
   */
  addNode(type, name, extra = {}) {
    if (!Object.values(NODE_TYPES).includes(type)) {
      throw new Error(`Unknown node type "${type}".`);
    }
    if (!name || !name.trim()) {
      throw new Error('Node name cannot be empty.');
    }
    if (type === NODE_TYPES.SOURCE) {
      if (this.nodes.some(n => n.type === NODE_TYPES.SOURCE)) {
        throw new Error('Only one Power Source is allowed per grid.');
      }
      const energy = parseFloat(extra.availableEnergy);
      if (isNaN(energy) || energy <= 0) {
        throw new Error('Power Source available energy must be greater than 0.');
      }
    }
    if (type === NODE_TYPES.LOAD) {
      const demand   = parseFloat(extra.demand);
      const priority = parseInt(extra.priority, 10);
      if (isNaN(demand) || demand <= 0) {
        throw new Error('Load demand must be greater than 0.');
      }
      if (isNaN(priority) || priority < PRIORITY_MIN || priority > PRIORITY_MAX) {
        throw new Error(`Load priority must be an integer between ${PRIORITY_MIN} and ${PRIORITY_MAX}.`);
      }
    }

    const id   = this._nextId(type);
    const node = { id, type, name: name.trim() };

    // Set numeric properties properly
    if (type === NODE_TYPES.SOURCE) {
      node.availableEnergy = parseFloat(extra.availableEnergy);
    } else if (type === NODE_TYPES.LOAD) {
      node.category = (extra.category || 'General').trim();
      node.demand   = parseFloat(extra.demand);
      node.priority = parseInt(extra.priority, 10);
    }

    this.nodes.push(node);
    return node;
  }

  /**
   * Add a connection (undirected edge) with full validation.
   * @param {string} sourceId
   * @param {string} destId
   * @param {number|string} weight - Must be > 0
   * @returns {Object} The created connection
   * @throws {Error} On validation failure
   */
  addConnection(sourceId, destId, weight) {
    const w = parseFloat(weight);
    if (!sourceId || !destId) throw new Error('Both source and destination IDs are required.');
    if (sourceId === destId)  throw new Error('Self-loops are not allowed.');
    if (isNaN(w) || w <= 0)   throw new Error('Connection weight must be a positive number.');

    const src  = this.nodes.find(n => n.id === sourceId);
    const dest = this.nodes.find(n => n.id === destId);
    if (!src)  throw new Error(`Node "${sourceId}" does not exist.`);
    if (!dest) throw new Error(`Node "${destId}" does not exist.`);

    // Topology rules
    if (src.type === NODE_TYPES.LOAD && dest.type !== NODE_TYPES.SUBSTATION) {
      throw new Error('Loads can only connect to Substations.');
    }
    if (dest.type === NODE_TYPES.LOAD && src.type !== NODE_TYPES.SUBSTATION) {
      throw new Error('Loads can only connect to Substations.');
    }

    // Duplicate check (undirected)
    const dup = this.connections.some(c =>
      (c.sourceId === sourceId && c.destId === destId) ||
      (c.sourceId === destId   && c.destId === sourceId)
    );
    if (dup) throw new Error(`Connection between "${sourceId}" and "${destId}" already exists.`);

    const conn = { sourceId, destId, weight: w };
    this.connections.push(conn);
    return conn;
  }

  /**
   * Update a connection with full validation.
   * @param {number} index
   * @param {string} sourceId
   * @param {string} destId
   * @param {number|string} weight
   * @returns {Object}
   */
  updateConnection(index, sourceId, destId, weight) {
    if (index < 0 || index >= this.connections.length) {
      throw new Error('Connection index not found.');
    }
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

    // Check duplicates with other connections
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

  /**
   * Update a node field with validation.
   * @param {string} id
   * @param {string} field
   * @param {*} value
   */
  updateNode(id, field, value) {
    const node = this.nodes.find(n => n.id === id);
    if (!node) throw new Error(`Node "${id}" not found.`);

    if (field === 'name') {
      const trimmed = String(value).trim();
      if (!trimmed) throw new Error('Node name cannot be empty.');
      node.name = trimmed;
    } else if (field === 'availableEnergy') {
      const val = parseFloat(value);
      if (isNaN(val) || val <= 0) throw new Error('Available energy must be greater than 0.');
      node.availableEnergy = val;
    } else if (field === 'demand') {
      const val = parseFloat(value);
      if (isNaN(val) || val <= 0) throw new Error('Demand must be greater than 0.');
      node.demand = val;
    } else if (field === 'priority') {
      const val = parseInt(value, 10);
      if (isNaN(val) || val < PRIORITY_MIN || val > PRIORITY_MAX) {
        throw new Error(`Priority must be an integer between ${PRIORITY_MIN} and ${PRIORITY_MAX}.`);
      }
      node.priority = val;
    } else if (field === 'category') {
      node.category = String(value).trim() || 'General';
    } else {
      node[field] = value;
    }
  }

  /**
   * Delete a node and all its connections.
   * @param {string} id
   */
  deleteNode(id) {
    const idx = this.nodes.findIndex(n => n.id === id);
    if (idx === -1) throw new Error(`Node "${id}" not found.`);
    this.nodes.splice(idx, 1);
    this.connections = this.connections.filter(c => c.sourceId !== id && c.destId !== id);
  }

  /**
   * Delete a connection by its index.
   * @param {number} index
   */
  deleteConnection(index) {
    if (index < 0 || index >= this.connections.length) throw new Error('Connection not found.');
    this.connections.splice(index, 1);
  }

  // ─── Bulk Load / Serialise ────────────────────────────────────────────────

  /**
   * Replace all data from a plain object (localStorage / JSON import).
   * @param {{nodes: Array, connections: Array}} data
   */
  loadFromData(data) {
    this.nodes       = (data && Array.isArray(data.nodes))       ? [...data.nodes]       : [];
    this.connections = (data && Array.isArray(data.connections)) ? [...data.connections] : [];
    this._syncCounters();
  }

  /** @returns {{nodes: Array, connections: Array}} Plain-object snapshot for serialisation. */
  serialize() {
    return { nodes: JSON.parse(JSON.stringify(this.nodes)), connections: JSON.parse(JSON.stringify(this.connections)) };
  }

  // ─── Accessors ────────────────────────────────────────────────────────────

  getNodes()       { return this.nodes; }
  getConnections() { return this.connections; }
  getSourceNode()  { return this.nodes.find(n => n.type === NODE_TYPES.SOURCE) || null; }

  clear() {
    this.nodes = [];
    this.connections = [];
    this._counters = { source: 1, station: 1, substation: 1, load: 1 };
  }
}
