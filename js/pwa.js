// Install support: service worker + subtle Install button (Chrome/Edge/Android) + one-time iOS hint.
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
const standalone = matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone;
const btn = document.getElementById('installBtn');
let deferred = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; if (btn && !standalone) btn.hidden = false; });
btn && (btn.onclick = async () => { if (!deferred) return; btn.hidden = true; deferred.prompt(); try { await deferred.userChoice } catch (_) {} deferred = null; });
addEventListener('appinstalled', () => { if (btn) btn.hidden = true; });
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
if (ios && !standalone && !localStorage.getItem('bc_ios_hint')) {
  const show = () => {
    const gd = document.getElementById('guide'); if (gd && !gd.hidden) return setTimeout(show, 2000);
    const h = document.createElement('div'); h.id = 'iosHint'; h.setAttribute('role', 'status');
    h.innerHTML = 'Install Burn City: tap <b>Share</b> <span aria-hidden="true">⎋</span> then <b>Add to Home Screen</b> <button aria-label="Dismiss">✕</button>';
    h.querySelector('button').onclick = () => h.remove();
    document.body.appendChild(h); localStorage.setItem('bc_ios_hint', '1');
    setTimeout(() => h.remove(), 12000);
  };
  setTimeout(show, 4000);
}
