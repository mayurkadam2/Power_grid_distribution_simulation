# Power Grid Simulator

A dynamic web application to model and visualize energy distribution systems, calculate shortest paths, and manage power allocation.

## Folder Structure

- `index.html`: Main HTML file.
- `css/`: Contains modular stylesheets (`variables.css`, `base.css`, `layout.css`, `components.css`).
- `js/`: Contains modular JavaScript files, starting with `main.js`.
- `data/`: Contains sample JSON data files (e.g., `sample-grid.json`).

## Setup Instructions

**IMPORTANT:** Because this project uses JavaScript ES modules (`<script type="module">`), you **cannot** simply open the `index.html` file directly in your browser using the `file://` protocol. You must serve the files using a local web server to avoid CORS errors.

### Using Python (if installed)
1. Open your terminal or command prompt.
2. Navigate to the project directory: `cd path/to/PowerStationProject`
3. Run `python -m http.server 8000` (or `python3 -m http.server 8000`).
4. Open your browser and go to `http://localhost:8000`.

### Using Node.js (with `http-server` or `serve`)
1. Run `npx http-server` or `npx serve` in the project directory.
2. Open the provided `localhost` URL in your browser.

### Using VS Code Live Server Extension
1. Open the project folder in VS Code.
2. Right-click on `index.html` and select **Open with Live Server**.
