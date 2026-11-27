// scene2-saruman-tag.js: Saruman's tag and click on the map from above (scene2.js), as the side view has them
// (scene-saruman.js sarTag, sarAt, sarOpen). While he gazes into a lit stone a tag beside his pedestal on Orthanc's top
// counts the calls under each engine's mark ("Saruman · 5 [Codex] · 5 [Grok]", ai-marks.js), its square in the stone's
// colour; it moves over his head while a worker's name is beside the pedestal. Its tooltip says what runs in words and
// how much of each plan's week is used. Clicking him, his pedestal or the tag opens the Fleet view, as in the side
// view; a worker or a landed eagle under the pointer comes first (scene2-tags.js). Loaded after scene2-tags.js, so its
// listeners on the canvas run after that file's. The figure and the stone are scene2-saruman.js (m2eSar).

m2Stage.insertAdjacentHTML('beforeend', '<div class="sc-tags m2e-seer"></div>');
const m2eSarTags = m2Stage.querySelector('.m2e-seer');

// The tag this frame: built again when its words change, placed beside the pedestal or over his head.
function m2eSarTag(tick) {
  const S = m2eSar;
  const now = S.now;
  const show = now && S.top && S.mode === 'gaze' && now.codex + now.grok > 0;
  if (!show) { if (S.tag) m2eSarTags.innerHTML = S.tag = ''; return; }
  const text = [esc('Saruman'), now.codex && `${now.codex} ${aiMark('codex')}`, now.grok && `${now.grok} ${aiMark('grok')}`].filter(Boolean).join(' · ');
  const title = `The palantír: ${[now.codex && `${now.codex} Codex`, now.grok && `${now.grok} Grok`].filter(Boolean).join(' and ')} call${now.codex + now.grok > 1 ? 's' : ''} running on ${(m2.snap ?? snap).servedBy}`
    + `\nCodex ${now.use.codex}% and Grok ${now.use.grok}% of the week used. Click for the Fleet view.`;
  const html = `<button class="sc-name" type="button" data-seer title="${esc(title)}"><i></i>${text}</button>`;
  if (html !== S.tag || S.tagScale !== m2.scale) {
    m2eSarTags.innerHTML = S.tag = html;
    S.tagScale = m2.scale;
    const el = m2eSarTags.firstChild;
    [S.tagW, S.tagH] = [el.offsetWidth / m2.scale, el.offsetHeight / m2.scale];
  }
  const el = m2eSarTags.firstChild;
  if (S.look && el.style.getPropertyValue('--c') !== S.look.glow) el.style.setProperty('--c', S.look.glow);
  const [w, h] = [S.tagW, S.tagH];
  const K = M2E_SAR_K;
  const side = [S.stone.x + 3 * K, S.feet - 4 * K];
  const over = [Math.min(Math.max(S.x, w / 2 + 1), m2.W - w / 2 - 1), S.feet - 19 * K];
  // Whether a worker's name sits where the tag would go beside the pedestal, looked at once a second.
  if (tick % 10 === 0 || S.taken === undefined) {
    S.taken = [...m2.tags.values()].some((o) => {
      if (!o.style.left) return false;
      const [x, y, ow, oh] = [(parseFloat(o.style.left) / 100) * m2.W, (parseFloat(o.style.top) / 100) * m2.H, o.sw || 30, o.sh || 6];
      return x - ow / 2 < side[0] + w && x + ow / 2 > side[0] && y - oh < side[1] + h / 2 && y > side[1] - h / 2;
    }) || side[0] + w > m2.W - 1;
  }
  el.className = S.taken ? 'sc-name' : 'sc-name sc-road';
  const [tx, ty] = S.taken ? over : side;
  el.style.left = `${(tx / m2.W) * 100}%`;
  el.style.top = `${(ty / m2.H) * 100}%`;
}
m2.layers.light.push((g, tick) => m2eSarTag(tick));

// Whether a pointer event falls on him or his pedestal (his figure, from the back of his walk to the stone, and from
// his hat to his feet), in map units.
function m2eSarAt(e) {
  const S = m2eSar;
  if (!S.top || !S.stone) return false;
  const { x, y } = m2At(e);
  const K = M2E_SAR_K;
  return x >= Math.min(S.x, S.home ?? S.x) - 4 * K && x <= S.stone.x + 2.5 * K && y >= S.feet - 17 * K && y <= S.feet + 1;
}
const m2eSarOpen = () => {
  history.pushState(null, '', '#fleet');
  applyView(true);
};
m2eSarTags.addEventListener('click', (e) => { if (e.target.closest('[data-seer]')) m2eSarOpen(); });
m2View.addEventListener('click', (e) => { if (!m2Hit(e) && !m2EagleUnder(e) && m2eSarAt(e)) m2eSarOpen(); });
m2View.addEventListener('mousemove', (e) => { if (m2eSarAt(e)) m2View.style.cursor = 'pointer'; });
