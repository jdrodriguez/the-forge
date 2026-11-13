// scene2-plan-realms.js: keeps the realms of the map from above (scene2-plan.js) apart. Rohan's region lies under
// Rivendell's, between the Misty Mountains' foot and the White Mountains, and Rivendell grows south as its desks need
// rows, so with a fourth machine Rohan's region ran into Rivendell's (2400 wide) and its own desks ran off the bottom
// of the map (every size). Now Rohan starts below any realm above it (m2PlanUnder), a layout whose realms overlap or run
// off the map does not fit (m2PlanApart), so m2Fit tries the next scale down, and at the last scale the world grows as
// tall as the realms need (m2Tall), which the view scrolls. Aragorn's post on the road by Weathertop also keeps off
// Rivendell's west edge (m2PlanPostClear).

const m2PrBox = (r, pad = 0) => ({ x0: r.x - pad, y0: r.y - pad, x1: r.x + r.w + pad, y1: r.y + r.h + pad });
const m2PrHit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

// Moves realm r (before its stations are placed) down below every other realm whose span across it shares, with a
// 6-unit gap for walkers between them.
function m2PlanUnder(plan, r) {
  const bottom = Math.max(-Infinity, ...plan.realms.filter((q) => q !== r && q.x < r.x + r.w + 4 && r.x < q.x + q.w + 4 && q.y < r.y + r.h).map((q) => q.y + q.h));
  const dy = Math.ceil(bottom + 6 - r.y);
  if (!(dy > 0)) return;
  r.y += dy;
  r.roadY += dy;
  r.f0 += dy;
}

// Marks a layout with overlapping realms, or a realm whose region runs off the map, as not fitting, and says how tall
// the world must be for every realm to fit (plan.needH).
function m2PlanApart(plan) {
  const { realms, W, H } = plan;
  const bottom = Math.max(...realms.map((r) => r.y + r.h));
  if (bottom > H - 1) { plan.fits = false; plan.needH = Math.ceil(bottom + 2); }
  if (realms.some((r) => r.x + r.w > W + 1)) plan.fits = false;
  realms.forEach((a, i) => { if (realms.slice(i + 1).some((b) => m2PrHit(m2PrBox(a), m2PrBox(b)))) plan.fits = false; });
}

// The last scale's plan, made taller until its realms fit. The realms' places are shares of the height, so each try
// moves them too, and the height it needs settles in a few tries.
function m2Tall(plan) {
  for (let i = 0; i < 8 && plan.needH > plan.H; i += 1) plan = m2Plan(plan.W, plan.needH);
  return plan;
}

// Moves a Sentry post (and its rider's place at home) west until its post and rider clear every realm, so the
// Weathertop post stands on the open road before Rivendell's valley.
function m2PlanPostClear(plan, post) {
  const box = () => ({ x0: Math.min(post.x - 3, post.hx - 6), y0: post.y - 31, x1: post.x + 8, y1: post.y + 1 });
  for (let i = 0; i < 40 && plan.realms.some((r) => m2PrHit(box(), m2PrBox(r))); i += 1) {
    post.x -= 1;
    post.hx -= 1;
  }
}
