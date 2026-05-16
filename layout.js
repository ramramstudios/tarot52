/* ===================================================
   layout.js — Tarot 52 two-pane shell
   1. Fetches sidebar-spread.html and chat.html
   2. Injects them into their slots
   3. Boots their respective scripts
   4. Wires up the drag handle for sidebar resize
   =================================================== */

const LS_KEY = 'tarot52.sidebarWidth';
const MIN_PX = 280;
const MAX_RATIO = 0.7; // sidebar can take up to 70% of viewport width

async function injectComponent(slotEl, url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  const html = await res.text();
  slotEl.innerHTML = html;
}

function clampWidth(px) {
  const max = Math.floor(window.innerWidth * MAX_RATIO);
  return Math.max(MIN_PX, Math.min(px, max));
}

function applySidebarWidth(layoutEl, px) {
  layoutEl.style.setProperty('--sidebar-width', `${px}px`);
}

function initResize(layoutEl, handleEl) {
  // Restore saved width
  const saved = parseInt(localStorage.getItem(LS_KEY) || '', 10);
  if (Number.isFinite(saved)) {
    applySidebarWidth(layoutEl, clampWidth(saved));
  }

  let dragging = false;

  const onPointerMove = (e) => {
    if (!dragging) return;
    const rect = layoutEl.getBoundingClientRect();
    const px = clampWidth(e.clientX - rect.left);
    applySidebarWidth(layoutEl, px);
  };

  const stopDrag = () => {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('resizing');
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', stopDrag);
    // Persist final width
    const styles = getComputedStyle(layoutEl);
    const w = parseInt(styles.getPropertyValue('--sidebar-width'), 10);
    if (Number.isFinite(w)) localStorage.setItem(LS_KEY, String(w));
  };

  handleEl.addEventListener('pointerdown', (e) => {
    dragging = true;
    document.body.classList.add('resizing');
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', stopDrag);
    e.preventDefault();
  });

  // Keyboard nudge: arrows resize by 16px steps
  handleEl.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 64 : 16;
    const cur = parseInt(getComputedStyle(layoutEl).getPropertyValue('--sidebar-width'), 10) || MIN_PX;
    if (e.key === 'ArrowLeft')  { applySidebarWidth(layoutEl, clampWidth(cur - step)); e.preventDefault(); }
    if (e.key === 'ArrowRight') { applySidebarWidth(layoutEl, clampWidth(cur + step)); e.preventDefault(); }
  });

  // Re-clamp on window resize so a too-wide sidebar shrinks gracefully.
  window.addEventListener('resize', () => {
    const cur = parseInt(getComputedStyle(layoutEl).getPropertyValue('--sidebar-width'), 10);
    if (Number.isFinite(cur)) applySidebarWidth(layoutEl, clampWidth(cur));
  });
}

async function init() {
  const layoutEl   = document.getElementById('layout');
  const sidebarSlot = document.getElementById('sidebarSlot');
  const chatSlot    = document.getElementById('chatSlot');
  const handleEl    = document.getElementById('resizeHandle');

  if (!layoutEl || !sidebarSlot || !chatSlot || !handleEl) {
    console.error('[layout] missing required slots');
    return;
  }

  try {
    await Promise.all([
      injectComponent(sidebarSlot, 'sidebar-spread.html'),
      injectComponent(chatSlot,    'chat.html'),
    ]);
  } catch (err) {
    console.error('[layout] component load failed', err);
    sidebarSlot.innerHTML = `<p style="padding:1rem;color:#aaa">Failed to load sidebar.</p>`;
    chatSlot.innerHTML    = `<p style="padding:1rem;color:#aaa">Failed to load chat.</p>`;
    return;
  }

  // Boot each component now that markup is in the DOM.
  // Spread first: this lays out the 52 cards while the sidebar is still
  // visible/non-collapsed. bootChat then flips to chat-fullscreen, but the
  // cards have real dimensions cached so they re-appear correctly on expand.
  const spreadRoot = sidebarSlot.querySelector('.sidebar-spread-root');
  const chatRoot   = chatSlot.querySelector('.chat-root');
  if (spreadRoot && window.bootSidebarSpread) {
    spreadRoot.dataset.booted = '1';
    window.bootSidebarSpread(spreadRoot);
  }
  if (chatRoot && window.bootChat) {
    chatRoot.dataset.booted = '1';
    window.bootChat(chatRoot);
  }

  initResize(layoutEl, handleEl);
}

window.addEventListener('DOMContentLoaded', init);
