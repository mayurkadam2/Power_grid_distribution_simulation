/**
 * constants.js
 * Global application constants — node types, priority bounds, SVG colors.
 * Import these everywhere instead of repeating magic strings.
 */

/** Frozen enum of valid node type strings (match HTML option values exactly). */
export const NODE_TYPES = Object.freeze({
  SOURCE:     'source',
  STATION:    'station',
  SUBSTATION: 'substation',
  LOAD:       'load',
});

/** Priority range for Load nodes (0 = lowest, 9 = highest). */
export const PRIORITY_MIN = 0;
export const PRIORITY_MAX = 9;

/** Node colors used in SVG rendering. */
export const NODE_COLORS = Object.freeze({
  source:     '#ff6b35',
  station:    '#4ecdc4',
  substation: '#a78bfa',
  load:       '#f472b6',
});

/** Node radii used in SVG rendering. */
export const NODE_RADII = Object.freeze({
  source:     22,
  station:    18,
  substation: 16,
  load:       14,
});

/** Color for highlighted (shortest-path) edges. */
export const PATH_COLOR    = '#10b981';
/** Default edge color. */
export const DEFAULT_EDGE_COLOR = 'rgba(100,100,255,0.3)';

/** localStorage key for the saved grid. */
export const STORAGE_KEY = 'powerGridData';
