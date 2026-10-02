// Injected into the page before the game loads. Playwright's input never moves the system cursor,
// so a recording would show no pointer at all; this draws one that follows the bot's mouse.
(() => {
  if (window.__botCursor) return; window.__botCursor = true;
  const install = () => {
    const style = document.createElement('style');
    style.textContent = `
      #bot-cursor{position:fixed;left:0;top:0;width:26px;height:26px;pointer-events:none;z-index:2147483647;transform:translate(-100px,-100px);will-change:transform}
      #bot-cursor svg{width:26px;height:26px;filter:drop-shadow(0 2px 2px rgba(0,0,0,.35));transition:transform .08s}
      #bot-cursor.down svg{transform:scale(.86)}
      .bot-ripple{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;border:3px solid rgba(255,255,255,.9);pointer-events:none;z-index:2147483646;animation:bot-ripple .45s ease-out forwards}
      @keyframes bot-ripple{from{transform:scale(.3);opacity:.9}to{transform:scale(1.25);opacity:0}}`;
    document.head.append(style);
    const cursor = document.createElement('div'); cursor.id = 'bot-cursor';
    cursor.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.4-7.6L20.5 11z" fill="#fff" stroke="#2b2b2b" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    document.body.append(cursor);
    addEventListener('mousemove', e => { cursor.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`; }, { capture: true, passive: true });
    addEventListener('mousedown', e => {
      cursor.classList.add('down');
      const ripple = document.createElement('div'); ripple.className = 'bot-ripple'; ripple.style.left = e.clientX + 'px'; ripple.style.top = e.clientY + 'px';
      document.body.append(ripple); setTimeout(() => ripple.remove(), 500);
    }, { capture: true, passive: true });
    addEventListener('mouseup', () => cursor.classList.remove('down'), { capture: true, passive: true });
  };
  if (document.body) install(); else addEventListener('DOMContentLoaded', install);
})();
