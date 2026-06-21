/* =========================================================================
 * Ratatouille: Remy's Kitchen Run
 * config.js — global tunables and constants
 * (Loaded first; all other scripts read from these globals.)
 * ========================================================================= */

const CONFIG = {
  // Internal render resolution. The canvas is scaled with CSS to fit the
  // window while preserving this 12:7 aspect ratio.
  WIDTH: 960,
  HEIGHT: 560,

  TILE: 40,           // size of one grid tile in pixels
  GRAVITY: 0.8,       // downward acceleration per frame (60fps)
  MAX_FALL: 16,       // terminal velocity

  // Player movement
  MOVE_ACCEL: 0.9,
  AIR_ACCEL: 0.55,
  FRICTION: 0.78,     // ground velocity damping when no input
  AIR_FRICTION: 0.92,
  MAX_RUN: 5.4,
  JUMP_VELOCITY: 14.2,
  JUMP_CUT: 0.45,     // velocity multiplier when jump released early (variable jump)
  COYOTE_FRAMES: 6,   // frames after leaving a ledge you can still jump
  JUMP_BUFFER: 6,     // frames a jump press is remembered before landing
  STOMP_BOUNCE: 11,   // upward bounce after squashing a pest

  START_LIVES: 3,
  INVULN_FRAMES: 90,  // i-frames after taking a hit

  // Scoring
  SCORE_INGREDIENT: 100,
  SCORE_STOMP: 250,
  SCORE_LEVEL_CLEAR: 1000,

  STEP_MS: 1000 / 60, // fixed simulation timestep
};

// Game high-level states
const STATE = {
  TITLE: 'title',
  STORY: 'story',
  PLAYING: 'playing',
  PAUSED: 'paused',
  LEVEL_CLEAR: 'levelClear',
  COOKING: 'cooking',
  WIN: 'win',
  GAME_OVER: 'gameOver',
};
