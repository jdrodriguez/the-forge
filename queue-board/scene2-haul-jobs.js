// scene2-haul-jobs.js: each people's linked rounds on the map from above (scene2-haul.js runs them), by the job of the
// spot a busy worker picks, as the side view's rounds go (scene-work.js's WORK, scene-farm.js, scene-hoard.js and
// scene-elves.js), with the map's own places:
// - Erebor: a dwarf mines ore at the adit, or takes it from the heap at the rails' end, carries it on his shoulder to the
//   forge and tips it in (the fire flares); digs a gem at the gem rock, holds it up glinting and carries it to the gem
//   chest, or straight into the hoard in the gate; takes a pouch from the chest once it holds six or more and carries
//   it into the hoard; takes hot metal from the forge, hammers it at the armor stand, quenches it (steam) and hangs it
//   on the stand, which fills and is cleared.
// - The Shire: a hobbit picks a basket in the garden or under the apple trees and tips it into the cart (the cart
//   fills); winds the well's crank, unhooks the bucket and pours it on its plot or into the pen's trough; brings the
//   beasts a basket from the garden or the cart and tips it in the trough, and they come to eat or drink it down.
// - Rivendell: an elf picks herbs from the healing house's bed and grinds them at its mortar; carries the scroll it wrote
//   to the rack under the pavilion, or with the rack nearly full fetches one back to its desk; fetches water from the
//   river for the herb bed; shoots three arrows at the range's target and pulls them out; gathers golden leaves under
//   a tree and carries them home.
// - Edoras: a Man carries a sack from the hall to the cart; takes a sack from the cart, or a bucket from the basin by
//   the stair, to the paddock's trough, and the horses come to it.
// Each returns the legs (scene2-haul.js), or nothing when its places are not all there, and then the spot's own job
// (scene2-jobs.js) is done at it as before.

const m2hN = (a, lo, hi) => m2mSpan(a, lo, hi);
const M2H_VEG = ['#e8902c', '#7aa83a', '#d8402c'];
// A tip into a thing: the load held out, then emptied (v1's tip), the stock changed on the fourth tick.
const m2hTip = (a, to, load, fn, n = 10) => ({ to, n, act: m2hThen('tip', 4, load, m2hSide(a, to)), fire: 4, fn, carry: null });
// Taking a load from a thing: a stoop with the hands out, the load in them at the end.
const m2hTake = (a, to, load, fn, n = 8) => ({ to, n, act: m2hThen('tip', 4, null, m2hSide(a, to)), fire: 4, fn, carry: load });
// Stooping to pick or gather into a load, a while.
const m2hPick = (a, to, n, tool, load, fx) => ({ to, n, act: m2hAlt('bend', 4, tool, m2hSide(a, to)), carry: load, fx });

const M2H_CHAINS = {
  dwarf: {
    ore(a, r, st, s) {
      const forge = m2hSpot(r, 'forge');
      if (!forge) return null;
      return [{ to: s, n: m2hN(a, 40, 70), job: M2M_JOBS.ore }, m2hPick(a, s, 6, null, 'ore'), m2hTip(a, forge, 'ore', () => m2sFlare(r))];
    },
    cart(a, r, st, s) {
      const forge = m2hSpot(r, 'forge');
      if (!forge) return null;
      return [m2hPick(a, s, m2hN(a, 24, 40), null, 'ore'), m2hTip(a, forge, 'ore', () => m2sFlare(r))];
    },
    gems(a, r, st, s) {
      const chest = m2hSpot(r, 'chest');
      const vault = m2hSpot(r, 'hoard');
      const gem = `gem${m2hN(a, 0, 3)}`;
      const to = chest && (st.gems < 12 || !vault || m2Rand(a) < 0.5) ? chest : vault;
      if (!to) return null;
      const [hx, hy] = [s.x + (s.face === 'left' ? -3 : 3), s.y - 4];
      return [
        { to: s, n: m2hN(a, 40, 60), act: m2hAlt('dig', 3, 'pick', s.face), fx: (b, t) => { if (t % 6 === 3) m2mPuff(hx, hy, ['#625e6b', '#a5a1ab'], 2, { up: 0.6, spread: 1, life: 5, floor: s.y }); } },
        { to: s, n: 10, act: () => ({ pose: 'carry', frame: 0, face: 'down', tool: gem }), fx: (b, t) => { if (t % 3 === 0) m2mGlint(b.x + 2, b.y - 14, M2M_GEMS[Number(gem[3])]); }, carry: gem },
        m2hTip(a, to, gem, () => {
          if (to === chest) m2sAdd(st, 'gems', 1);
          else m2sAdd(st, 'hoard', 1);
          m2mPuff(to.x, to.y - 3, M2M_GEMS, 6, { up: 0.6, spread: 1, life: 7, kind: 'spark' });
        }),
      ];
    },
    hoard(a, r, st, s) {
      const chest = m2hSpot(r, 'chest');
      if (!chest || st.gems < 6) return null;
      return [m2hTake(a, chest, 'pouch', () => m2sAdd(st, 'gems', -3)), m2hTip(a, s, 'pouch', () => {
        m2sAdd(st, 'hoard', 1);
        m2mPuff(s.vault?.cx ?? s.x, (s.vault?.gy ?? s.y) - 2, [M2_PAL.gold[3], '#fff3c4', M2M_GEMS[1]], 5, { up: 0.6, spread: 1, life: 6, kind: 'spark' });
      })];
    },
    armor(a, r, st, s) {
      const forge = m2hSpot(r, 'forge');
      if (!forge) return null;
      const [hx, hy] = [s.x + (s.face === 'left' ? -3 : 3), s.y - 6];
      return [
        m2hTake(a, forge, 'hot', () => m2sFlare(r)),
        { to: s, n: m2hN(a, 36, 56), job: M2M_JOBS.armor, fire: 0, carry: null },
        { to: s, n: 16, act: m2hThen('quench', 5, null, s.face), carry: 'plate',
          fx: (b, t) => { if (t === 5) m2mPuff(hx, hy, ['#ffffff', '#ecebf0', '#cfcfd6'], 7, { up: 0.6, spread: 1, fall: -0.02, life: 14, kind: 'puff', size: 0.5 }); else if (t > 5 && t % 3 === 0) m2mWisp(hx, hy); } },
        m2hTip(a, s, 'plate', () => { st.armor = st.armor >= M2S_MAX.armor ? 1 : st.armor + 1; }),
      ];
    },
  },
  hobbit: {
    garden(a, r, st, s) {
      const cart = m2hSpot(r, 'cart');
      const pen = m2hSpot(r, 'feed');
      const to = cart && (!pen || m2Rand(a) < 0.6) ? cart : pen;
      if (!to) return null;
      return [m2hPick(a, s, m2hN(a, 30, 50), 'basket', 'basket', (b, t) => { if (t % 8 === 4) m2mPuff(b.x, b.y - 2, M2H_VEG, 1, { up: 0.6, spread: 0.4, life: 5, floor: b.y }); }),
        m2hTip(a, to, 'basket', () => (to === cart ? m2sAdd(st, 'load', 2) : (st.trough.food = M2S_FEED)))];
    },
    apples(a, r, st, s) {
      const cart = m2hSpot(r, 'cart');
      if (!cart) return null;
      return [{ to: s, n: m2hN(a, 40, 60), job: M2M_JOBS.apples, carry: 'basket' }, m2hTip(a, cart, 'basket', () => m2sAdd(st, 'load', 2))];
    },
    water(a, r, st, s) {
      const pen = m2hSpot(r, 'feed');
      const draw = [
        { to: s, n: m2hN(a, 32, 48), act: (b, t) => ({ pose: 'crank', frame: Math.floor(t / 2) % 4, face: m2hSide(a, s) }) },
        m2hTake(a, s, 'bucket', null, 6),
      ];
      if (pen && m2Rand(a) < 0.5) return [...draw, { to: pen, n: 16, act: m2hAlt('pour', 4, 'bucket', m2hSide(a, pen)), fire: 6, fn: () => { st.trough.water = M2S_FEED; }, carry: null }];
      return [...draw, { to: 'home', n: m2hN(a, 24, 36), act: m2hAlt('pour', 4, 'bucket', 'right'), carry: null }];
    },
    cart(a, r, st, s) {
      const pen = m2hSpot(r, 'feed');
      const garden = m2hSpot(r, 'garden');
      if (pen && st.load >= 4 && m2Rand(a) < 0.5) return [m2hTake(a, s, 'basket', () => m2sAdd(st, 'load', -2)), m2hTip(a, pen, 'basket', () => { st.trough.food = M2S_FEED; })];
      if (!garden || m2hHeld(garden, a)) return null;
      return [m2hPick(a, garden, m2hN(a, 30, 50), 'basket', 'basket'), m2hTip(a, s, 'basket', () => m2sAdd(st, 'load', 2))];
    },
    feed(a, r, st, s) {
      const garden = m2hSpot(r, 'garden');
      const cart = m2hSpot(r, 'cart');
      if (garden && !m2hHeld(garden, a)) return [m2hPick(a, garden, m2hN(a, 30, 45), 'basket', 'basket'), m2hTip(a, s, 'basket', () => { st.trough.food = M2S_FEED; })];
      if (cart && st.load >= 2) return [m2hTake(a, cart, 'basket', () => m2sAdd(st, 'load', -2)), m2hTip(a, s, 'basket', () => { st.trough.food = M2S_FEED; })];
      return null;
    },
  },
  elf: {
    herbs(a, r, st, s) {
      const mortar = m2hSpot(r, 'mortar');
      if (!mortar) return null;
      return [m2hPick(a, s, m2hN(a, 30, 50), 'herbs', 'herbs', (b, t) => { if (t % 8 === 4) m2mPuff(b.x, b.y - 2, ['#7fc27a', '#4f9a5a'], 1, { up: 0.7, spread: 0.6, life: 5, floor: b.y }); }),
        { to: mortar, n: m2hN(a, 40, 64), act: m2hAlt('grind', 3, null, m2hSide(a, mortar)), fire: 0, carry: null,
          fx: (b, t) => { if (t % 6 === 3) m2mPuff(mortar.mid ?? b.x, b.y - 4, ['#7fc27a', '#a8d89a'], 2, { up: 0.5, spread: 0.8, life: 5 }); } }];
    },
    read(a, r, st, s) {
      if (!s.rack || m2Rand(a) < 0.3) return null;
      const side = m2hSide(a, s);
      if (st.scrolls < 7) {
        return [{ to: 'home', n: 6, act: m2hThen('tip', 3, null, 'down'), fire: 3, carry: 'scroll' },
          m2hTip(a, s, 'scroll', () => m2sAdd(st, 'scrolls', 1))];
      }
      return [m2hTake(a, s, 'scroll', () => m2sAdd(st, 'scrolls', -1)), { to: 'home', n: 6, act: m2hThen('tip', 3, 'scroll', side), fire: 3, carry: null }];
    },
    // Golden leaves gathered under a tree (scene2-rivendell-trees.js's leaf spots), carried home in the arms.
    leaves(a, r, st, s) {
      const T = s.tree;
      return [{ to: s, n: m2hN(a, 30, 50), act: m2hAlt('reach', 5, null, 'down'),
        fx: (b, t) => { if (t % 4 === 0) m2mAdd({ x: T.x - 4 + Math.random() * 8, y: T.top + 4 + Math.random() * 6, vy: 0.12, life: 30, kind: 'dot', c: Math.random() < 0.5 ? '#f0d36a' : '#c99a30', sway: 0.35, floor: s.y }); } },
        m2hPick(a, s, 8, null, 'leaves'), { to: 'home', n: 6, act: m2hThen('tip', 3, 'leaves', 'down'), fire: 3, carry: null }];
    },
    // Three arrows at the target (scene2-archery.js), then up to it to pull them out.
    archery(a, r, st, s) {
      const fetch = m2hSpot(r, 'arrows');
      if (!fetch) return null;
      const shot = { to: s, n: 11, act: m2hThen('shoot', 7, null, 'right'), fx: (b, t) => { if (t === 7) m2bowLoose(b, s.target, r.m.host); } };
      return [shot, { ...shot }, { ...shot }, { to: fetch, n: 8, act: m2hThen('tip', 4, null, 'right'), fire: 4, fn: () => { st.arrows = 0; } }];
    },
    water(a, r, st, s) {
      const herbs = m2hSpot(r, 'herbs');
      if (!herbs || m2Rand(a) < 0.4) return null;
      return [m2hPick(a, s, m2hN(a, 16, 24), null, 'bucket'), { to: herbs, n: m2hN(a, 20, 30), act: m2hAlt('pour', 4, 'bucket', m2hSide(a, herbs)), carry: null,
        fx: (b, t) => { if (t % 2 === 0) m2mPuff(b.x + (b.face === 'left' ? -4 : 4), b.y - 5, M2M_WATER, 1, { up: 0, spread: 0.3, fall: 0.15, life: 6, floor: b.y }); } }];
    },
  },
  man: {
    hall(a, r, st, s) {
      const cart = m2hSpot(r, 'cart');
      if (!cart || st.load >= M2S_MAX.load || m2Rand(a) < 0.3) return null;
      return [m2hTake(a, s, 'sack', null), m2hTip(a, cart, 'sack', () => m2sAdd(st, 'load', 1), 8)];
    },
    horses(a, r, st, s) {
      const cart = m2hSpot(r, 'cart');
      if (!s.trough || !cart || st.load < 1) return null;
      return [m2hTake(a, cart, 'sack', () => m2sAdd(st, 'load', -1)), m2hTip(a, s, 'sack', () => { st.trough.food = M2S_FEED; })];
    },
    well(a, r, st, s) {
      const horses = m2hSpot(r, 'horses');
      if (!horses?.trough) return null;
      return [m2hPick(a, s, m2hN(a, 16, 24), null, 'bucket'), { to: horses, n: 16, act: m2hAlt('pour', 4, 'bucket', m2hSide(a, horses)), fire: 6, fn: () => { st.trough.water = M2S_FEED; }, carry: null }];
    },
  },
};
// The gem colours a dug gem glints in, as v1's GEMS give them.
const M2M_GEMS = ['#7fd8ff', '#ff7aa8', '#9aff9a', '#ffe27a'];
