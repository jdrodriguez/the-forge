// sprites-chores.js: the poses and loads of the newer rounds in the Middle-earth view, added to sprites.js's POSES and
// sprites-work.js's LOADS the way sprites-work.js adds its own. Hobbits wind a well's crank (crank) and pour a bucket
// (pour); dwarves dip hot metal in a quench trough with tongs (quench); elves grind herbs in a mortar (grind), lay hands
// on a hurt worker (heal), sit on a bench (sit) and raise a taper to a lantern (light). The loads are a bucket of water,
// a bar of hot iron in tongs, a breastplate, a pouch of gems and a bunch of herbs. Drawn at 32-bit, a pixel a quarter
// unit, with sprites-work.js's sleeves and hands, like the rest. Loaded after sprites-work.js.

// The bucket's colours as the well in scenery-farm.js draws it (one unit per pixel), and as the loads here draw it at
// 32-bit: an iron handle and bands, staves lit and shaded, an outline, and water with a ripple.
const BUCKET = { h: '#55361b', m: PX.metalD, b: '#8a5a32', B: '#6b4424', w: '#6fb6f0' };
const BUCKET_HD = { ...BUCKET, h: '#4b5266', l: '#c08a58', L: '#a8744a', N: '#373746', n: '#6c7582', W: '#cfe6ff', o: '#2e1d12' };
Object.assign(LOADS, {
  bucket: [['....NNNNNNNN....', '...N........N...', '..N..........N..', '.oNooooooooooNo.', 'onWWwwwwwWwwwwno', 'oNnnnnnnnnnnnnNo',
    'olLbbBbblLbbBbbo', 'olLbbBbblLbbBbbo', 'oNnnnnnnnnnnnnNo', 'olLbbBbblLbbBbbo', 'olLbbBbblLbbBbbo', '.olLbBbblLbBbo..',
    '.oNnnnnnnnnnnNo.', '..oooooooooooo..'], BUCKET_HD],
  hot: [['nN......................', 'NnN.....................', '.NnN....................', '..NnN...................',
    '...NnNAhhhheeeeeeeeEEf..', '....NNEhhheeeeeeEEEEEff.', '....NnEEEEEEEEEEEEEEff..', '...NnNAffffffffffffffA..'], GEAR_PX],
  plate: [['NNNNN..........NNNNN', 'NL*LLN........NMmnnN', 'NLMMMLN......NMmmnnN', 'NLMMMMLNNNNNNMMmmnnN', 'NLMMMMMMLLMMMMmmmnnN',
    'NLMMMMMML*MMMMmmmnnN', '.NLMMMMMLLMMMMmmnnN.', '.NLMMMMMMLMMMMmmnnN.', '.NLMMMMMMLMMMmmmnnN.', '..NLMMMMMLMMMmmnnN..',
    '..NLMMMMMLMMMmmnnN..', '..NLMMMMMLMMmmmnnN..', '...NLMMMMLMMmmnnN...', '...NnnnnnnnnnnnnN...', '....NNNNNNNNNNNN....'], GEAR_PX],
  pouch: [['....t..t....', '...tTttTt...', '...OtTTtO...', '..OlpgGPPO..', '.OlppGg*PPO.', 'OlpppppppPPO', 'OlppppppPPPO',
    'OppppppPPPPO', 'OpppppPPPPDO', '.OppPPPPPDO.', '..OODDDDOO..', '....OOOO....'], { t: PX.gold, T: '#b5852a', l: '#b08ad0',
    p: '#8a6aaa', P: '#6a4a8a', D: '#4a2f66', O: '#2a1c3a', g: GEMS[0][0], G: GEMS[0][1], '*': '#ffffff' }],
  herbs: [['..y....Y....y...', '.ygY..yGg..ygY..', 'ygGgYyGgGYygGgY.', '.yGgGygGgGyGgGg.', '..gGgGyGgGgGgG..', '...GgGgGgGgGG...',
    '....GGgGgGGG....', '.....KGgGGK.....', '.....tsSstT.....', '......sSsT......', '......sSs.......', '......KsK.......'],
  { y: '#c4ecac', Y: '#a0d890', g: '#7fc27a', G: '#4f9a5a', K: '#2a5a34', s: '#d6c898', S: '#a89868', t: '#8a7a50', T: '#5e5030' }],
});

// What the chores hold: a plate in the tongs' jaws, red hot and then grey once quenched; the light between a healer's
// palms; a taper's flame on its two frames; and the bucket on its side, mouth forward and spilling, its handle hanging
// behind, for pouring.
const CHORE_ART = {
  jaws: [['AhhheeeeeEEf', 'AEhheeeEEEff', 'AEEEEEEEEEff', '.AAffffffff.'], ['NLLMMMMmmmnN', 'NMMMmmmmmnnN', 'NmmmmnnnnnnN', '.NNNNNNNNNN.']],
  glow: [['..g...', '..G...', 'gGwGg.', '..G..g', '..g.gW', '.....g'], { g: '#9fe8b4', G: '#c8f7d4', w: '#ffffff', W: '#e8fff0' }],
  flame: [['.e..', '.Ee.', 'Ehhe', 'fhhE', '.EE.'], ['..e.', '.eE.', 'ehhE', 'Ehhf', '.EE.']],
  tongs: [[0, GEAR_PX.m], [0.25, GEAR_PX.N], [0.5, GEAR_PX.n], [0.75, GEAR_PX.N]],
};
const BUCKET_TIPPED = ['....ooooooooooo..', '...olllNllllNlNo.', '..obLLLnLLLLnLNWo', 'hobbbbbnbbbbnbNwo', 'hoBbbbbnbbbbnbNwo',
  'hobbbbbnbbbbnbNwo', 'hoBBBBBnBBBBnBNwo', 'hobbbbbnbbbbnbNwo', '.oBbbbbnbbbbnbNwo', '..oBBBBnBBBBnBNWo', '...ooooNooooNoNo.',
  '....ooooooooooo..'];

const CHORE_PESTLE = ['#6e6450', '#f0e6c0', '#d6c898', '#a8996a'];

Object.assign(POSES, {
  crank: {
    arms(g, f) {
      // The front hand on the well's crank grip, which goes round with the frame: up, out, down, out. It sits where
      // scenery-farm.js's well puts its crank for a hobbit standing at the well's spot.
      const gx = f.x + 5;
      const gy = f.y - 11 + [0, 2, 4, 2][f.frame % 4];
      restArm({ ...f, frame: 2 });
      armSleeve(g, f, f.armR, f.bodyTop, gx - 1, gy);
      armHand(g, f, gx, gy);
      return { x: gx, y: gy };
    },
  },
  quench: {
    lean: 1,
    arms(g, f) {
      // Long tongs from the front hand down into the trough ahead, a plate in their jaws: red hot as it goes in, grey
      // once it has hissed. Reaches the quench trough of scenery-hoard.js's armor stand from the stand's spot.
      const b = f.bodyTop;
      const [hx, hy, tx, ty] = [f.armR + 1, b + 2, f.armR + 9, f.y - 3];
      restArm({ ...f, frame: 2 });
      armSleeve(g, f, f.armR, b + 1, hx, hy);
      armHand(g, f, hx, hy);
      gearPaint(g, `tongs${tx - hx - 1},${ty - hy}`, () => [tx - hx, ty - hy + 1.25], (c) => {
        for (const [d, col] of CHORE_ART.tongs) toolThread(c, 0, d, tx - hx - 1, ty - hy + d, col);
      }, hx + 1, hy);
      gearMap(g, CHORE_ART.jaws[f.frame ? 1 : 0], GEAR_PX, tx - 1, ty);
      return { x: tx, y: ty };
    },
  },
  grind: {
    arms(g, f) {
      // Both hands on a pestle worked round in the mortar ahead, its top swinging with the frame.
      const b = f.bodyTop;
      const [x0, x1] = [f.armR + 1 + f.frame, f.armR + 2];
      armSleeve(g, f, f.armR, b + 2, f.armR + 1, b + 2);
      f.arm(f.armL, b, b + 1, b + 2);
      poseRod(g, x0, b, x1, b + 4, CHORE_PESTLE, 'pestle');
      armHand(g, f, f.armR + 1, b + 2);
      return { x: x1, y: b + 4 };
    },
  },
  heal: {
    arms(g, f) {
      // Both palms held out toward the one being healed, a soft light between them on alternate frames.
      const b = f.bodyTop;
      armSleeve(g, f, f.armR, b + 1, f.armR + 1, b + 1);
      armSleeve(g, f, f.armR, b - 1, f.armR + 1, b - 1);
      armHand(g, f, f.armR + 2, b + 1);
      armHand(g, f, f.armR + 2, b - 1);
      f.arm(f.armL, b, b + 1, b + 2);
      if (f.frame) gearMap(g, ...CHORE_ART.glow, f.armR + 2.25, b - 0.5);
      return { x: f.armR + 4, y: b };
    },
  },
  sit: {
    drop: 3,
    arms(g, f) {
      // Seated on a bench, hands resting in the lap.
      const b = f.bodyTop;
      f.arm(f.armL, b, b + 1, b + 2);
      armSleeve(g, f, f.armR - 1, b + 2, f.armR, b + 2);
      armHand(g, f, f.armR + 1, b + 2);
      return { x: f.x, y: b - 4 };
    },
  },
  light: {
    arms(g, f) {
      // An arm raised to a lantern with a lit taper: the flame touches the lamp on the second frame.
      const b = f.bodyTop;
      f.arm(f.armL, b, b + 1, b + 2);
      armSleeve(g, f, f.armR, b + 1, f.armR + 1, b);
      armHand(g, f, f.armR + 1, b - 1);
      toolThread(g, f.armR + 2, b - 0.5, f.armR + 2.5, b - 1.5 - f.frame, STRING);
      toolThread(g, f.armR + 2.25, b - 0.5, f.armR + 2.75, b - 1.5 - f.frame, '#c9bfa6');
      gearMap(g, CHORE_ART.flame[sc.tick % 2], GEAR_PX, f.armR + 2, b - 2.75 - f.frame);
      return { x: f.armR + 3, y: b - 2 - f.frame };
    },
  },
  pour: {
    arms(g, f) {
      // Both hands hold the bucket out on its side, rocking a little; the water falls from its lip.
      const b = f.bodyTop + (f.frame ? 1 : 0);
      f.arm(f.armL, f.bodyTop, f.bodyTop + 1, f.bodyTop + 2);
      armSleeve(g, f, f.armR, b + 1, f.armR + 1, b + 1);
      gearMap(g, BUCKET_TIPPED, BUCKET_HD, f.armR + 2, b - 1);
      armHand(g, f, f.armR + 2, b + 1);
      return { x: f.armR + 6, y: b + 1 };
    },
  },
});
