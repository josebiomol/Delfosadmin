export const toast = {
  show(message, type = 'success') {
    const el = document.getElementById('toast');
    if (!el) { console.log(`[toast:${type}]`, message); return; }
    el.textContent = message;
    el.className = `toast show toast-${type}`;
    clearTimeout(this._timer);
    this._timer = setTimeout(() => { el.classList.remove('show'); }, 3500);
  },
};
