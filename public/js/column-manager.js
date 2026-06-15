/* PressPilot V2 — column-manager.js

   GENERIC column persistence (width / visibility / order) stored in
   localStorage and optionally synced to /api/views via the views module.

   Usage:
   ──────
     import { createColumnManager } from './column-manager.js';

     const cm = createColumnManager('articles', [
       { key:'check',       label:'',           width:36,  pinned:true,  hideable:false },
       { key:'magazine',    label:'Magazine',   width:100 },
       { key:'titre',       label:'Titre',      width:195 },
       // … more columns
     ]);

     // Apply saved widths to <colgroup> cols after table render:
     cm.applyWidths(tableEl);   // sets col[data-col] widths

     // Get/set state (for saving into a view):
     const state = cm.getState();   // { columns: { widths:{}, hidden:[], order:[] } }
     cm.applyState(state.columns);  // restores from saved view

   Column resize:
     cm.attachResizeHandles(theadEl, () => renderTable());

   Sticky header + pinned first column are handled by CSS classes (tables.css):
     • thead th  → sticky top via .table-wrap context
     • .col-pin  → sticky left on th + td

   API exposed (for Features A/B agents):
   ──────────────────────────────────────
     createColumnManager(moduleKey, defaultColumns)
       → { applyWidths, getState, applyState, attachResizeHandles,
            isHidden, getOrder, setHidden, setWidth }
*/

const LS_KEY = (mod) => `pp_cols_v1_${mod}`;

export function createColumnManager(moduleKey, defaultColumns) {
  // Saved state shape: { widths: { colKey: px }, hidden: [colKey, ...], order: [colKey, ...] }
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(LS_KEY(moduleKey)) || '{}');
  } catch { saved = {}; }

  const widths = { ...saved.widths };
  const hidden = new Set(saved.hidden || []);
  // order not yet used for reordering, reserved for Features A/B
  const order  = saved.order || defaultColumns.map(c => c.key);

  function persist() {
    localStorage.setItem(LS_KEY(moduleKey), JSON.stringify({
      widths: { ...widths },
      hidden: [...hidden],
      order
    }));
  }

  /* Apply saved widths to all col[data-col] elements inside tableEl */
  function applyWidths(tableEl) {
    if (!tableEl) return;
    tableEl.querySelectorAll('col[data-col]').forEach(col => {
      const key = col.dataset.col;
      const w   = widths[key];
      if (w) col.style.width = w + 'px';
    });
  }

  /* Get state snapshot (used by views.js to persist to /api/views) */
  function getState() {
    return {
      columns: {
        widths: { ...widths },
        hidden: [...hidden],
        order: [...order],
      }
    };
  }

  /* Restore state (called when a saved view is applied) */
  function applyState(colState) {
    if (!colState) return;
    if (colState.widths) Object.assign(widths, colState.widths);
    if (colState.hidden) { hidden.clear(); colState.hidden.forEach(k => hidden.add(k)); }
    persist();
  }

  /* Returns true if column should be hidden */
  function isHidden(key) { return hidden.has(key); }

  /* Get ordered keys (order not enforced in DOM yet — TODO Features A/B) */
  function getOrder() { return [...order]; }

  /* Hide/show a column key */
  function setHidden(key, hide) {
    if (hide) hidden.add(key); else hidden.delete(key);
    persist();
  }

  /* Manually set a width (for external use) */
  function setWidth(key, px) {
    widths[key] = px;
    persist();
  }

  /**
   * attachResizeHandles(theadEl, onResizeEnd)
   *
   * Injects a .col-resizer handle into every th[data-col] inside theadEl.
   * On drag: updates col width inline + persists.
   * onResizeEnd() callback lets the caller re-render or re-apply if needed.
   *
   * @param {HTMLElement} theadEl
   * @param {Function}    onResizeEnd  called once drag ends
   */
  function attachResizeHandles(theadEl, onResizeEnd) {
    if (!theadEl) return;
    theadEl.querySelectorAll('th[data-col]').forEach(th => {
      // Remove existing resizer if re-attaching
      th.querySelectorAll('.col-resizer').forEach(r => r.remove());

      const handle = document.createElement('div');
      handle.className = 'col-resizer';
      th.style.position = 'relative';
      th.appendChild(handle);

      let startX, startW, col;

      handle.addEventListener('mousedown', e => {
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        // Find corresponding <col>
        const table = th.closest('table');
        col = table ? table.querySelector(`col[data-col="${th.dataset.col}"]`) : null;
        startW = col ? col.offsetWidth : th.offsetWidth;
        handle.classList.add('resizing');

        const onMove = e2 => {
          const dx = e2.clientX - startX;
          const newW = Math.max(40, startW + dx);
          if (col) col.style.width = newW + 'px';
        };
        const onUp = e2 => {
          const dx = e2.clientX - startX;
          const newW = Math.max(40, startW + dx);
          widths[th.dataset.col] = newW;
          persist();
          handle.classList.remove('resizing');
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          if (onResizeEnd) onResizeEnd();
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
    });
  }

  return { applyWidths, getState, applyState, isHidden, getOrder, setHidden, setWidth, attachResizeHandles };
}
