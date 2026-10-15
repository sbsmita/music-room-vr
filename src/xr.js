// Two entry buttons: the virtual room (immersive-vr) and the player's real room (immersive-ar).
// Each only appears when the browser reports that mode as supported.
export function setupXRButtons(renderer, { onVR, onAR } = {}) {
  const bar = document.createElement('div');
  bar.id = 'xrbar';
  bar.style.cssText = 'position:fixed;left:0;right:0;bottom:22px;display:flex;justify-content:center;gap:12px;z-index:10';
  document.body.appendChild(bar);

  const make = (label) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText =
      'padding:12px 18px;border:1px solid #f3ead8;border-radius:6px;background:rgba(20,14,10,0.55);color:#f3ead8;font:600 14px system-ui,sans-serif;cursor:pointer;opacity:0.9';
    b.onmouseenter = () => (b.style.opacity = '1');
    b.onmouseleave = () => (b.style.opacity = '0.9');
    return b;
  };

  let current = null;
  const start = async (mode, init, label, button) => {
    if (current) {
      current.end();
      return;
    }
    try {
      const session = await navigator.xr.requestSession(mode, init);
      session.addEventListener('end', () => {
        current = null;
        button.textContent = label;
      });
      renderer.xr.setReferenceSpaceType('local-floor');
      await renderer.xr.setSession(session);
      current = session;
      button.textContent = 'Exit';
      if (mode === 'immersive-ar' && onAR) onAR(session);
      if (mode === 'immersive-vr' && onVR) onVR(session);
    } catch (e) {
      console.warn('XR session failed', e);
    }
  };

  if (!('xr' in navigator)) {
    const note = make('VR not available in this browser');
    note.disabled = true;
    note.style.opacity = '0.5';
    bar.appendChild(note);
    return bar;
  }

  navigator.xr.isSessionSupported('immersive-vr').then((ok) => {
    if (!ok) return;
    const b = make('Enter VR room');
    b.onclick = () => start('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking', 'layers'] }, 'Enter VR room', b);
    bar.appendChild(b);
  });
  navigator.xr.isSessionSupported('immersive-ar').then((ok) => {
    if (!ok) return;
    const b = make('Play in my room');
    b.onclick = () =>
      start(
        'immersive-ar',
        { requiredFeatures: ['local-floor', 'hit-test'], optionalFeatures: ['hand-tracking', 'plane-detection', 'light-estimation', 'anchors'] },
        'Play in my room',
        b
      );
    bar.appendChild(b);
  });
  return bar;
}
