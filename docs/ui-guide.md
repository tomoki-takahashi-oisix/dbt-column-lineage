# UI guide

A tour of every operation in the dbt-column-lineage web UI: the lineage canvas (`/cl`), the CTE page (`/cte`), and edit / design mode.

**Color language**: blue = analysis (lineage fetched from your dbt project), violet = design (things you draw yourself in edit mode).

- [Pages](#pages)
- [Choosing what to visualize](#choosing-what-to-visualize)
- [Exploring the lineage graph (`/cl`)](#exploring-the-lineage-graph-cl)
- [The CTE page (`/cte`)](#the-cte-page-cte)
- [Edit / design mode](#edit--design-mode)
- [Looker mode (optional)](#looker-mode-optional)
- [Deep links](#deep-links)
- [Design snapshot JSON — generating designs programmatically](#design-snapshot-json--generating-designs-programmatically)

## Pages

| Page | What it shows |
|------|---------------|
| `/cl` | Column-level (or table-level) lineage across models, as an interactive graph |
| `/cte` | A single model broken down into its CTEs, side by side with the compiled SQL |

Switch pages with the dropdown at the top-left of the header.

## Choosing what to visualize

Click the wide button in the header (it shows the current selection, e.g. `analytics | fct_orders`) to open the search dialog:

1. **Table / Column** — pick the view mode. *Table* shows model-to-model lineage; *Column* traces individual columns through models.
2. **Schema** — pick a schema.
3. **Sources** — pick one or more models. On `/cl` you can select several; `/cte` takes exactly one.
4. **Columns** (column mode only) — for each selected source (switch between them with the pills at the top right), pick the columns to trace.
5. Press **Search**. The button stays disabled until the selection is complete (schema + source, plus at least one column in column mode).

Defaults: column mode traces lineage to unlimited depth; table mode starts at depth 1 to keep wide graphs manageable — grow it from the nodes' **+** buttons instead.

## Exploring the lineage graph (`/cl`)

### Node anatomy

Each model is a node whose header color encodes its materialization (see the legend at the top right: table / view / incremental / snapshot / seed).

Header controls (hover the node):

- **⋮ menu**
  - **Copy table name** — copies the model name to the clipboard.
  - **Open in dbt docs** — opens the model's page in your dbt docs site, in a new tab. Only present when the server has `DBT_DOCS_BASE_URL` set.
  - **Edit (design)** — only in edit mode; converts the node into an editable design node (see below).
- **✕ (Hide node)** — removes the node and its edges from the canvas. The node you originally searched for has no ✕.

In **table mode** the table name is clickable and opens that model on the `/cte` page in a new tab. In **column mode**, each *column name* is clickable instead and opens `/cte` pre-focused on that column.

### Growing and pruning the graph

Lineage is explored incrementally from the **+** handles on each node:

- **Left +** — fetch and append upstream parents (where the data comes from).
- **Right +** — fetch and append downstream children (where the data goes).
- Once expanded, the handle turns into **−**, which collapses that branch again.
- A flat end-cap instead of a +/− means you've reached the end of the lineage in that direction.

In column mode the handles sit on each column row, so you expand per column, not per table. To trace additional columns of a table that's already on the canvas, click the **chevron (⌄)** at the bottom of the node — it lists the remaining columns (with their descriptions) and clicking one adds it to the graph.

The two checkboxes at the top left change what **+** fetches:

- **Max depth for left (+) button** — instead of one level, fetch all the way to the upstream ends.
- **Max depth for right (+) button** — same, downstream (shown in table mode only).

### Canvas basics

- **Pan** by dragging empty canvas, **zoom** with the mouse wheel; the bottom-left controls offer zoom in/out, **fit view**, and an interactivity lock.
- **Drag a node** to reposition it. Dragged nodes keep their position — automatic re-layout won't move them anymore.
- **Camera button** (bottom right) — copies the whole canvas to the clipboard as a PNG image, handy for pasting into docs or chat.
- The thin bar on the right edge expands into a debug **sidebar** (zoom/pan transform and node coordinates).
- An amber **"Lineage was truncated"** banner means the server stopped traversal because it exceeded the `MAX_LINEAGE_SECONDS` budget — the graph is partial. It does *not* appear for the intentional depth-1 default of table mode.

## The CTE page (`/cte`)

Reach it from the page switcher, or by clicking a table name (table mode) / column name (column mode) on `/cl`.

The page splits in two:

- **Left: compiled SQL** of the model (read-only, syntax highlighted).
- **Right: tabs**
  - **Description** — the model's description, rendered as markdown.
  - **Columns** — name / type / description of every column.
  - **Lineage** — the model's internal CTE graph. Clicking a CTE node scrolls the SQL editor to that CTE's definition. When you arrived with a column selected, highlights show the selected column (amber), the columns it feeds in the next step (emerald), and the next tables (indigo). Source names inside a CTE node are clickable and open their own `/cte` page.

## Edit / design mode

Edit mode turns the lineage canvas into a lightweight design (DFD) editor: sketch planned tables next to real ones, annotate, and share the result. Toggle it with the **pencil button** at the bottom right — a violet **EDIT MODE** badge appears at the bottom while it's on. Entering edit mode switches the view to column mode automatically.

### Toolbar (top center)

- **+ Table** — add a planned table at the center of the view: set its name, add/rename/remove columns, mark primary keys with the **PK** toggle (multiple PKs = composite key), and pick a materialization type. Select the node to reveal its delete (trash) button.
- **+ Note** — add a sticky note for free-text annotations. Resize the text area as needed.
- **Share** — copies a URL that reproduces the whole canvas (nodes, edges, positions, and view mode). The design is compressed into the URL itself, so very large designs are warned about (>2 KB) or blocked (>8 KB) — use Export then.
- **Export** — downloads the design as `lineage-design.json` (no size limit; also nice for keeping designs in Git).
- **Import** — loads a previously exported JSON file and replaces the current canvas with it.

### Drawing connections

Drag from a violet **column dot** on one node to a column dot on another to draw an edge. Hand-drawn edges render as dashed violet lines, so they're distinguishable from analyzed lineage. They connect real columns and designed columns alike.

### Editing existing models

Use **⋮ → Edit (design)** on a regular (analyzed) table node to convert it into an editable node — its existing edges are preserved, and you can then rename columns, add planned ones, or mark keys. This is the way to sketch "how this model should change".

### Restoring a design

Opening a **Share** URL (or importing a JSON) restores the snapshot exactly as it was — including manual node positions and the view mode — without re-querying the lineage API. From there you can keep editing, or expand real lineage around the design as usual.

## Looker mode (optional)

When the frontend is built with `NEXT_PUBLIC_USE_LOOKER=true` (and the Looker analysis JSON exists — see the README), the search dialog on `/cl` gains **dbt / looker** tabs:

- **looker** replaces the schema/source pickers with a dashboard picker (grouped by folder).
- The resulting graph shows **dashboard nodes** whose elements link back to Looker (click the dashboard title or an element to open it), wired to the dbt tables they consume.

## Deep links

`/cl` accepts query parameters, so a lineage view can be bookmarked or generated (the `dbt-column-lineage run-params` CLI command does exactly this from your git diff):

| Param | Meaning |
|-------|---------|
| `schema` | schema name |
| `sources` | comma-separated model names |
| `activeSource` | which source the column picker focuses |
| `selectedColumns` | JSON object `{"model": ["col", …]}` |
| `showColumn` | `true` = column mode, `false` = table mode |
| `depth` | traversal depth (`-1` = unlimited) |
| `design` | a compressed design snapshot (from **Share**) — when present, everything else is ignored and the snapshot is restored as-is |

`/cte` accepts `schema`, `sources`, `activeSource`, and `selectedColumns` for a single model.

## Design snapshot JSON — generating designs programmatically

The `?design=` restore path is fully self-contained: it does not call the lineage API and does not depend on the local dbt project's state. That means a design can be authored **without the UI at all** — by a script, a CI job, or an LLM agent — and delivered as a URL. A typical use: an automated dbt PR includes a design link so reviewers can open the proposed model layout locally with `dbt-column-lineage run`.

### Snapshot format

The value of `?design=` (and the content of an Export/Import file) is this JSON, version 1:

```json
{
  "v": 1,
  "view": { "showColumn": true, "rankdir": "RL", "sourceMode": "dbt" },
  "nodes": [
    {
      "id": "design-stg_payments",
      "type": "editableTableNode",
      "position": { "x": 0, "y": 0 },
      "data": {
        "name": "stg_payments",
        "columns": ["payment_id", "order_id", "amount"],
        "pks": ["payment_id"],
        "materialized": "view",
        "custom": true,
        "manual": true
      }
    },
    {
      "id": "design-fct_payments",
      "type": "editableTableNode",
      "position": { "x": 400, "y": 40 },
      "data": {
        "name": "fct_payments",
        "columns": ["order_id", "total_amount"],
        "pks": ["order_id"],
        "materialized": "incremental",
        "custom": true,
        "manual": true
      }
    },
    {
      "id": "note-1",
      "type": "noteNode",
      "position": { "x": 400, "y": -100 },
      "data": { "text": "Proposed in PR #123", "custom": true, "manual": true }
    }
  ],
  "edges": [
    {
      "id": "e1",
      "source": "design-fct_payments",
      "target": "design-stg_payments",
      "sourceHandle": "order_id__source",
      "targetHandle": "order_id__target",
      "data": { "custom": true },
      "style": { "stroke": "#7c3aed", "strokeDasharray": "6 4" }
    }
  ]
}
```

Rules:

- **`view`** — use `{"showColumn": true, "rankdir": "RL", "sourceMode": "dbt"}` for hand-authored designs. The view settings must match the handles your edges reference, so don't change them unless you know why.
- **Node types** — author with `editableTableNode` (a planned/designed table) and `noteNode` (annotation). `tableNode` / `dashboardNode` also round-trip (they appear when you export an analyzed graph) but aren't meant to be written by hand.
- **`editableTableNode.data`** — `name` (string), `columns` (string array), optional `pks` (subset of `columns`; multiple = composite key), optional `materialized` (`table` | `view` | `incremental` | `snapshot` | `seed`, default `table`). Always set `custom: true, manual: true`.
- **`position` is required** and is frozen on restore — there is no auto-layout for snapshots. A simple recipe: upstream models on the left, ~400 px per dependency layer in `x`, ~200–250 px between tables in `y`.
- **Edges point downstream → upstream**, matching how analyzed lineage edges are stored: `source` is the *consuming* model's node id with `sourceHandle: "<column>__source"`, `target` is the upstream model's node id with `targetHandle: "<column>__target"`. Column names in handle ids must exactly match entries in `data.columns`. Include the `style` shown above to get the dashed-violet "designed edge" look.
- A malformed snapshot fails safe: the page shows *"Invalid or corrupted design URL"* and renders nothing.

### Building the URL

The `design` parameter is the JSON compressed with [lz-string](https://github.com/pieroxy/lz-string)'s `compressToEncodedURIComponent`:

```bash
# Node
node -e "console.log(require('lz-string').compressToEncodedURIComponent(require('fs').readFileSync('design.json','utf8')))"

# Python (pip install lzstring — output is compatible with the JS library)
python3 -c "import lzstring,sys; print(lzstring.LZString().compressToEncodedURIComponent(open('design.json').read()))"
```

Then launch the packaged app and open the link (the pip-installed app serves the UI and API on one port, default 5000):

```bash
dbt-column-lineage run   # http://127.0.0.1:5000
# open http://127.0.0.1:5000/cl?design=<encoded>
```

A small design (a few tables) encodes to well under 1 KB. Keep URLs under ~8 KB; beyond that, ship the JSON file itself and load it via **Edit mode → Import** instead.

Since the page renders without any interaction, a headless browser can also screenshot the result — e.g. to attach a static preview image to a PR alongside the link.
