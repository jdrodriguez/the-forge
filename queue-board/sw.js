// sw.js: the board's service worker, which lets the browser install the board as an app. The page, its scripts and
// icons come from the network first and fall back to the last copy, so the app still opens when the board is down and
// says it can't reach it. /api is never cached: the data on screen is always live or visibly failing. Nor is /music,
// the owner's own MP3s for the header player, which the browser streams from the board in byte ranges.
const CACHE = 'board-v172';
const SHELL = ['/', '/mobile.css', '/mobile-views.css', '/mobile.js', '/ai-marks.js', '/session.js', '/inbox.js', '/worktrees.js', '/gollum-data.js', '/sessions.js', '/sprites.js', '/sprites-gear.js', '/sprites-gear-stations.js', '/sprites-hd.js', '/sprites-hd-folk.js', '/sprites-qd.js', '/sprites-wanderers.js', '/sprites-wanderers-folk.js', '/sprites-wanderers-gear.js', '/sprites-captains.js', '/sprites-work.js', '/sprites-horse.js', '/sprites-horse-art.js', '/sprites-horse-post.js', '/sprites-chores.js', '/realm-art-kit.js', '/realm-art.js', '/machines-accounts.js', '/machines.js', '/gollum-view.js', '/scenery-sun.js', '/scenery.js', '/scenery-qd.js', '/scenery-sky.js', '/scenery-sky-qd.js', '/scenery-land.js', '/scenery-land-qd.js', '/scenery-rohan.js', '/scenery-falls.js', '/scenery-erebor.js', '/scenery-lights.js', '/scenery-props.js', '/scenery-props-hd.js', '/scenery-props-qd.js', '/scenery-farm.js', '/scenery-hoard.js', '/scenery-elves.js', '/scenery-heal.js', '/scenery-shire.js', '/scene-tags.js', '/scene.js', '/scene-path.js', '/scene-weather.js', '/scene-weather-fall.js', '/scenery-weather.js', '/scenery-storm.js', '/scenery-snow.js', '/scene-wind.js', '/scene-glow.js', '/scene-work.js', '/scene-jobs.js', '/scene-farm.js', '/scene-hoard.js', '/scene-elves.js', '/scene-wild.js', '/scene-duel.js', '/scene-orcs.js', '/scene-ride.js', '/scene-tower.js', '/scene-call.js', '/scene-call-light.js', '/sprites-eagle.js', '/sprites-eagle-fly.js', '/scene-eagle.js', '/sprites-gollum.js', '/scene-gollum.js', '/scene-gollum-tag.js', '/sprites-saruman.js', '/sprites-saruman-stone.js', '/scene-saruman.js', '/scene2.js', '/scene2-plan.js', '/scene2-core-places.js', '/scene2-plan-south.js', '/scene2-tiles.js', '/scene2-build.js', '/scene2-trees.js', '/scene2-rivendell.js', '/scene2-rivendell-trees.js', '/scene2-rivendell-house.js', '/scene2-rivendell-garden.js', '/scene2-shire.js', '/scene2-shire-hill.js', '/scene2-shire-holes.js', '/scene2-shire-oak.js', '/scene2-shire-props.js', '/scene2-shire-pen.js', '/scene2-shire-mill.js', '/scene2-shire-front.js', '/scene2-shire-fill.js', '/scene2-erebor.js', '/scene2-erebor-gate.js', '/scene2-erebor-river.js', '/scene2-erebor-works.js', '/scene2-erebor-yard.js', '/scene2-rohan.js', '/scene2-edoras.js', '/scene2-edoras-stable.js', '/scene2-edoras-gondor.js', '/scene2-stations.js', '/scene2-station-art.js', '/scene2-elf.js', '/scene2-folk.js', '/scene2-body-kit.js', '/scene2-body-parts.js', '/scene2-body-head.js', '/scene2-tool.js', '/scene2-body-elf.js', '/scene2-body-man.js', '/scene2-body-hobbit.js', '/scene2-body-dwarf.js', '/scene2-body-wizard.js', '/scene2-body-captains.js', '/scene2-body-ent.js', '/scene2-body-wild.js', '/scene2-body-v1.js', '/scene2-move.js', '/scene2-path.js', '/scene2-life-fx.js', '/scene2-jobs.js', '/scene2-life.js', '/scene2-life-road.js', '/scene2-haul.js', '/scene2-haul-jobs.js', '/scene2-stock.js', '/scene2-stock-art.js', '/scene2-chores.js', '/scene2-archery.js', '/scene2-life-beasts.js', '/scene2-horse-art.js', '/scene2-horse.js', '/scene2-rider.js', '/scene2-rider-draw.js', '/scene2-rider-v1.js', '/scene2-fx.js', '/scene2-orc-art.js', '/scene2-orc-body.js', '/scene2-duel.js', '/scene2-orcs.js', '/scene2-orc-draw.js', '/scene2-war.js', '/scene2-rider-fight.js', '/scene2-rider-bug.js', '/scene2-life-deer.js', '/scene2-eye.js', '/scene2-eagle-art.js', '/scene2-call.js', '/scene2-eagle.js', '/scene2-call-bar.js', '/scene2-gollum-art.js', '/scene2-gollum.js', '/scene2-gollum-lairs.js', '/scene2-foes-v1.js', '/scene2-saruman.js', '/scene2-weather.js', '/scene2-wind.js', '/scene2-weather-fall.js', '/scene2-glow.js', '/scene2-tags.js', '/scene2-notes.js', '/scene2-mist.js', '/scene2-fireworks.js', '/scene2-saruman-tag.js', '/scene2-lands.js', '/scene2-land-peaks.js', '/scene2-land-peaks-draw.js', '/scene2-places.js', '/scene2-land-eriador.js', '/scene2-land-eriador-bree.js', '/scene2-land-eriador-trolls.js', '/scene2-land-eriador-willow.js', '/scene2-land-vale.js', '/scene2-land-vale-beorn.js', '/scene2-land-vale-wild.js', '/scene2-land-lake.js', '/scene2-land-lake-town.js', '/scene2-moria.js', '/scene2-moria-east.js', '/scene2-lorien.js', '/scene2-world.js', '/scene2-gondor.js', '/scene2-mordor.js', '/scene2-mordor-gate.js', '/scene2-mordor-doom.js', '/scene2-helm.js', '/scene2-helm-caves.js', '/scene2-isengard-orthanc.js', '/scene2-isengard.js', '/scene2-gondor-city.js', '/scene2-gondor-citybuild.js', '/scene2-gondor-osgiliath.js', '/scene2-gondor-fields.js', '/scene2-gondor-river.js', '/scene2-gondor-sea.js', '/scene2-gondor-ithilien.js', '/horn.js', '/sound-ui.js', '/music.js', '/music-duck.js', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || /^\/(api|music)\//.test(url.pathname)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(e.request, copy)));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit ?? Response.error())),
  );
});
