/**
 * main.js
 * Application entry point.
 *
 * Responsibilities:
 *  - Instantiate the single shared Graph model (single source of truth)
 *  - Wire tab navigation (switching active sections with live updates)
 *  - Load persisted grid from localStorage on startup
 *  - Initialize views: Grid Builder, Shortest Path, Simulation
 *  - Propagate live changes to all tabs immediately without requiring manual save
 */

import { Graph }           from './models/Graph.js';
import { loadGrid, saveGrid } from './storage/storage.js';
import { initBuilderView } from './ui/builderView.js';
import { initPathView, refreshPathGraph }   from './ui/pathView.js';
import { initSimulationView, refreshSimGraph } from './ui/simulationView.js';

// Global flag to signal that the application initialized via ES Modules
window.__powerGridInitialized = true;

document.addEventListener('DOMContentLoaded', () => {
  // 1. Single shared graph instance — all tabs share this exact instance
  const graph = new Graph();

  // 2. Load persisted data on startup
  const saved = loadGrid();
  if (saved && Array.isArray(saved.nodes) && saved.nodes.length > 0) {
    try {
      graph.loadFromData(saved);
    } catch (e) {
      console.warn('Could not restore saved grid:', e);
    }
  }

  // 3. Callback fired whenever the grid structure changes in Grid Builder
  const onGridChange = () => {
    // Auto-save to localStorage so state is always preserved
    saveGrid(graph.serialize());

    // Live update: refresh active visualization if current tab is visible
    refreshActiveView(graph);
  };

  // 4. Initialise views with the shared graph instance
  initBuilderView(graph, onGridChange);
  initPathView(graph);
  initSimulationView(graph);

  // 5. Wire up tab navigation
  setupNavigation(graph);

  // 6. Initial render of whichever tab is active
  refreshActiveView(graph);
});

// ── Navigation ────────────────────────────────────────────────────────────────

/**
 * Wire up tab navigation.
 * Uses the data-section attribute on each .nav-tab button to know which
 * section element to show.
 *
 * @param {Graph} graph
 */
function setupNavigation(graph) {
  const tabs     = document.querySelectorAll('.nav-tab');
  const sections = document.querySelectorAll('.section');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetId = tab.getAttribute('data-section'); // e.g. "section-shortest-path"
      if (!targetId) return;

      // Deactivate all tabs and sections
      tabs.forEach(t     => t.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));

      // Activate clicked tab and target section
      tab.classList.add('active');
      const target = document.getElementById(targetId);
      if (target) target.classList.add('active');

      // Live update: when entering a tab, render the latest nodes & connections immediately
      if (targetId === 'section-shortest-path') {
        refreshPathGraph(true); // auto-calculate & show latest graph with paths
      } else if (targetId === 'section-power-dist') {
        refreshSimGraph();      // prepare queue preview and render latest graph
      }
    });
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Redraw the graph in whichever section is currently visible.
 * @param {Graph} graph
 */
function refreshActiveView(graph) {
  if (document.getElementById('section-shortest-path')?.classList.contains('active')) {
    refreshPathGraph(true);
  } else if (document.getElementById('section-power-dist')?.classList.contains('active')) {
    refreshSimGraph();
  }
}
