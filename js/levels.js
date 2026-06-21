/* =========================================================================
 * levels.js — ASCII level definitions + parser.
 *
 * Legend (per character):
 *   '#'  solid floor / ground      'P'  player start
 *   'D'  exit door (levels 1-4)    'C'  cooking pot (level 5 finale)
 *   'F'  fire (always burning)     'J'  fire jet (pulses on / off)
 *   'o'  ingredient (collect)      'E'  kitchen bug (stompable)
 *
 * Design rules that keep every kitchen winnable (verified by test/headless.js):
 *   • The FLOOR is the only solid terrain — nothing overhangs the run lane,
 *     so a jump is never cancelled by a ceiling.
 *   • Floor pits are at most 3 tiles wide (a running jump clears ~4).
 *   • No fire sits within 5 tiles before a pit (so hopping a flame never
 *     drops you straight into a gap).
 *   • Fires never form a run wider than 2 tiles.
 *   • Level 5: every ingredient sits on the floor and clear of the spot you
 *     land after hopping a hazard, so collecting them ALL is always possible —
 *     and you must, to light the pot and cook the ratatouille.
 *
 * Ingredients above the floor are pass-through bonus pickups (grab them with
 * a well-timed jump); the kitchen counters and shelves are painted into the
 * parallax background rather than built from solid tiles.
 * ========================================================================= */

const RAW_LEVELS = [
  {
    name: 'The Pantry Escape',
    subtitle: 'Remy slips out of the pantry. Hop over the embers!',
    rows: [
      '                                              ',
      '                                              ',
      '                                              ',
      '                                              ',
      '                                              ',
      '                                              ',
      '                                              ',
      '                                              ',
      '                                              ',
      '                                              ',
      '         o             o           o          ',
      '                                              ',
      'P     o     F      E      F     o     F     D ',
      '##############################################',
    ],
  },

  {
    name: 'Kitchen Counters',
    subtitle: 'Mind the gaps in the tiles between the burners.',
    rows: [
      '                                                      ',
      '                                                      ',
      '                                                      ',
      '                                                      ',
      '                                                      ',
      '                                                      ',
      '                                                      ',
      '                                                      ',
      '                                                      ',
      '                                                      ',
      '      o                       o               o       ',
      '                                                      ',
      'P   F   o   F   E   o       o   F   J   o   E   F  D  ',
      '########################  ############################',
    ],
  },

  {
    name: 'The Stove Top',
    subtitle: 'The burners are firing — time your jumps with the jets!',
    rows: [
      '                                                          ',
      '                                                          ',
      '                                                          ',
      '                                                          ',
      '                                                          ',
      '                                                          ',
      '                                                          ',
      '                                                          ',
      '                                                          ',
      '                                                          ',
      '      o                       o                 o         ',
      '                                                          ',
      'P   F   J   o            F  o  J  o        F   J  o  E  D ',
      '####################   #################  ################',
    ],
  },

  {
    name: 'Grease-Fire Alley',
    subtitle: 'A wall of flame! Hop the gaps and weave through the jets.',
    rows: [
      '                                                               ',
      '                                                               ',
      '                                                               ',
      '                                                               ',
      '                                                               ',
      '                                                               ',
      '                                                               ',
      '                                                               ',
      '                                                               ',
      '                                                               ',
      '            o                      o                    o      ',
      '                                                               ',
      'P  F  J  o         o  F  o  J  E            o F  J  o  E  F  D ',
      '################   ####################   #####################',
    ],
  },

  {
    name: "Gusteau's Grand Kitchen",
    subtitle: 'Gather every ingredient, then cook the ratatouille!',
    rows: [
      '                                                            ',
      '                                                            ',
      '                                                            ',
      '                                                            ',
      '                                                            ',
      '                                                            ',
      '                                                            ',
      '                                                            ',
      '                                                            ',
      '                                                            ',
      '                                                            ',
      '                                                            ',
      'P o   F    o   J    o   E   F    o   J    o   F    o  o  C  ',
      '############################################################',
    ],
  },
];

/* ----------------------------- Level class --------------------------- */
class Level {
  constructor(def, index) {
    this.name = def.name;
    this.subtitle = def.subtitle;
    this.index = index;
    this.isFinal = index === RAW_LEVELS.length - 1;

    this.rows = def.rows;
    this.height = this.rows.length;
    this.width = this.rows.reduce((m, r) => Math.max(m, r.length), 0);
    this.pixelWidth = this.width * CONFIG.TILE;
    this.pixelHeight = this.height * CONFIG.TILE;

    this.grid = [];
    this.fires = [];
    this.ingredients = [];
    this.bugs = [];
    this.platforms = [];
    this.player = null;
    this.goal = null;

    this._parse();
    this.totalIngredients = this.ingredients.length;
  }

  _parse() {
    const T = CONFIG.TILE;
    const palette = ['tomato', 'eggplant', 'pepper', 'mushroom', 'cheese'];
    let ingIdx = 0;

    for (let r = 0; r < this.height; r++) {
      this.grid[r] = [];
      const row = this.rows[r];
      for (let c = 0; c < this.width; c++) {
        const ch = row[c] || ' ';
        const px = c * T, py = r * T;
        let solid = ' ';
        switch (ch) {
          case '#': case 'B': solid = ch; break;
          case 'P':
            this.player = new Player(px + (T - 30) / 2, (r + 1) * T - 34);
            break;
          case 'D':
            this.goal = new Goal(px, py, false);
            break;
          case 'C':
            this.goal = new Goal(px, py, true);
            break;
          case 'F':
            this.fires.push(new Fire(px, py, false));
            break;
          case 'J':
            this.fires.push(new Fire(px, py, true));
            break;
          case 'o':
            this.ingredients.push(new Ingredient(px, py, palette[ingIdx++ % palette.length]));
            break;
          case 'E':
            this.bugs.push(new Bug(px, py));
            break;
          case 'M':
            this.platforms.push(new MovingPlatform(px, py, T * 2.2, 'h', 0.02));
            break;
          case 'N':
            this.platforms.push(new MovingPlatform(px, py, T * 2, 'v', 0.025));
            break;
          default: break;
        }
        this.grid[r][c] = solid;
      }
    }
  }

  solidAt(col, row) {
    if (col < 0 || col >= this.width) return true;   // invisible side walls
    if (row < 0 || row >= this.height) return false; // open above / pit below
    const ch = this.grid[row][col];
    return ch === '#' || ch === 'B';
  }
}

const LEVEL_COUNT = RAW_LEVELS.length;
