import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createInitialState, getLegalMoves, getResult, normalizeTurn, playMove } from '../src/rules.ts';
import type { GameState, Player } from '../src/rules.ts';

function position(rows: string[], turn: Player = 'black'): GameState {
  assert.equal(rows.length, 8);
  assert.ok(rows.every((row) => /^[.BW]{8}$/.test(row)));
  return {
    board: rows.join('').split('').map((cell) => cell === 'B' ? 'black' : cell === 'W' ? 'white' : null),
    turn, status: 'playing', lastMove: null, passedPlayer: null,
  };
}

test('initial state has white D4/E5, black E4/D5 and a 2–2 score', () => {
  const state = createInitialState();
  const expected = Array(64).fill(null);
  expected[27] = 'white';
  expected[36] = 'white';
  expected[28] = 'black';
  expected[35] = 'black';
  assert.deepEqual(state, {
    board: expected,
    turn: 'black',
    status: 'playing',
    lastMove: null,
    passedPlayer: null,
  });
  assert.deepEqual(getResult(state), { black: 2, white: 2, empty: 60, winner: null });
});

test('initial legal moves are D3/C4/F5/E6 for black and E3/F4/C5/D6 for white', () => {
  const { board } = createInitialState();
  assert.deepEqual(getLegalMoves(board, 'black'), [19, 26, 37, 44]);
  assert.deepEqual(getLegalMoves(board, 'white'), [20, 29, 34, 43]);
});

test('black D3 flips D4, records the last move, and gives white the turn without mutating input', () => {
  const state = createInitialState();
  Object.freeze(state.board);
  Object.freeze(state);
  const next = playMove(state, 19);
  const expected = [...state.board];
  expected[19] = 'black';
  expected[27] = 'black';
  assert.deepEqual(next, {
    board: expected, turn: 'white', status: 'playing', lastMove: 19, passedPlayer: null,
  });
  assert.deepEqual(getResult(next), { black: 4, white: 1, empty: 59, winner: null });
  assert.deepEqual(getLegalMoves(next.board, next.turn), [18, 20, 34]);
  assert.equal(state.board[19], null);
  assert.equal(state.board[27], 'white');
});

test('occupied, non-bracketing, out-of-range, wrong-turn and finished-game moves leave state unchanged', () => {
  const state = createInitialState();
  Object.freeze(state.board);
  Object.freeze(state);
  for (const index of [27, 0, -1, 64, 1.5, NaN, Infinity, 20]) {
    assert.equal(playMove(state, index), state);
  }
  const finished = { ...state, status: 'finished' as const };
  assert.equal(playMove(finished, 19), finished);
});

test('either color automatically passes when only its opponent has legal moves', () => {
  const whitePass = position([
    '.WBBBBW.',
    'BBBBBBBB',
    'BBBBBBBB',
    'BBBBBBBB',
    'BBBBBBBB',
    'BBBBBBBB',
    'BBBBBBBB',
    'BBBBBBBB',
  ], 'white');
  const blackPass = position([
    '.BWWWWB.',
    'WWWWWWWW',
    'WWWWWWWW',
    'WWWWWWWW',
    'WWWWWWWW',
    'WWWWWWWW',
    'WWWWWWWW',
    'WWWWWWWW',
  ]);
  for (const [state, nextTurn] of [[whitePass, 'black'], [blackPass, 'white']] as const) {
    Object.freeze(state.board);
    Object.freeze(state);
    const next = normalizeTurn(state);
    assert.deepEqual(next, { ...state, turn: nextTurn, passedPlayer: state.turn });
    assert.deepEqual(getLegalMoves(next.board, next.turn), [0, 7]);
    assert.deepEqual(getLegalMoves(state.board, state.turn), []);
    assert.equal(normalizeTurn(next), next);
    assert.equal(state.passedPlayer, null);
  }
});

test('a move normalizes an opponent pass so the same side can play again', () => {
  for (const [row, fill, player, passed] of [
    ['.WBBBBW.', 'BBBBBBBB', 'black', 'white'],
    ['.BWWWWB.', 'WWWWWWWW', 'white', 'black'],
  ] as const) {
    const state = position([row, fill, fill, fill, fill, fill, fill, fill], player);
    Object.freeze(state.board);
    Object.freeze(state);
    const next = playMove(state, 0);
    assert.equal(next.turn, player);
    assert.equal(next.status, 'playing');
    assert.equal(next.lastMove, 0);
    assert.equal(next.passedPlayer, passed);
    assert.deepEqual(getLegalMoves(next.board, player), [7]);
    assert.equal(state.board[0], null);
  }
});

test('a second consecutive move fills the board and reports a black or white win', () => {
  for (const [row, fill, player, expected] of [
    ['.WBBBBW.', 'BBBBBBBB', 'black', { black: 64, white: 0, empty: 0, winner: 'black' }],
    ['.BWWWWB.', 'WWWWWWWW', 'white', { black: 0, white: 64, empty: 0, winner: 'white' }],
  ] as const) {
    const state = position([row, fill, fill, fill, fill, fill, fill, fill], player);
    const afterPass = playMove(state, 0);
    const finished = playMove(afterPass, 7);
    assert.equal(finished.status, 'finished');
    assert.equal(finished.lastMove, 7);
    assert.equal(finished.passedPlayer, null);
    assert.deepEqual(getResult(finished), expected);
    assert.equal(normalizeTurn(finished), finished);
    assert.equal(playMove(finished, 0), finished);
  }
});

test('D4 brackets and flips all eight directions in one move', () => {
  const state = position([
    '........',
    '.B.B.B..',
    '..WWW...',
    '.BW.WB..',
    '..WWW...',
    '.B.B.B..',
    '........',
    '........',
  ]);
  const expected = position([
    '........',
    '.B.B.B..',
    '..BBB...',
    '.BBBBB..',
    '..BBB...',
    '.B.B.B..',
    '........',
    '........',
  ]);
  const next = playMove(state, 27);
  assert.deepEqual(next.board, expected.board);
  assert.equal(next.lastMove, 27);
  assert.equal(next.status, 'finished');
  assert.deepEqual(getResult(next), { black: 17, white: 0, empty: 47, winner: 'black' });
});

test('a bracket flips every opponent stone along a line', () => {
  const state = position([
    '........', '........', '........', '.WWWB...',
    '........', '........', '........', '........',
  ]);
  const next = playMove(state, 24);
  assert.deepEqual(next.board.slice(24, 32), ['black', 'black', 'black', 'black', 'black', null, null, null]);
  assert.deepEqual(getResult(next), { black: 5, white: 0, empty: 59, winner: 'black' });
});

test('horizontal and diagonal scans cannot wrap across the left or right edge', () => {
  for (const [rows, index] of [
    [['........', 'WB......', '........', '........', '........', '........', '........', '........'], 7],
    [['......BW', '........', '........', '........', '........', '........', '........', '........'], 8],
    [['........', '........', 'W.......', '.B......', '........', '........', '........', '........'], 7],
    [['......B.', '.......W', '........', '........', '........', '........', '........', '........'], 16],
  ] as const) {
    const state = position([...rows]);
    assert.ok(!getLegalMoves(state.board, 'black').includes(index));
    assert.equal(playMove(state, index), state);
  }
});

test('white also plays with the shared rules and returns the turn to black', () => {
  const state = playMove(createInitialState(), 19);
  Object.freeze(state.board);
  Object.freeze(state);
  const next = playMove(state, 20);
  assert.equal(next.board[20], 'white');
  assert.equal(next.board[28], 'white');
  assert.equal(next.turn, 'black');
  assert.equal(next.lastMove, 20);
  assert.equal(next.passedPlayer, null);
  assert.deepEqual(getResult(next), { black: 3, white: 3, empty: 58, winner: null });
  assert.equal(state.board[20], null);
  assert.equal(state.board[28], 'black');
});

test('both sides without moves ends the game even with empty squares', () => {
  for (const [rows, expected] of [
    [
      ['WWWWWWW.', 'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW'],
      { black: 0, white: 63, empty: 1, winner: 'white' },
    ],
    [
      ['B.......', '........', '........', '........', '........', '........', '........', '.......W'],
      { black: 1, white: 1, empty: 62, winner: 'draw' },
    ],
  ] as const) {
    const state = position([...rows]);
    Object.freeze(state.board);
    Object.freeze(state);
    const next = normalizeTurn(state);
    assert.equal(next.status, 'finished');
    assert.equal(next.passedPlayer, null);
    assert.deepEqual(getResult(next), expected);
    assert.equal(state.status, 'playing');
    assert.equal(normalizeTurn(next), next);
  }
});

test('the last square can finish with a 32–32 draw', () => {
  const state = position([
    '.WBBBBBB',
    'BBBBBBBB',
    'BBBBBBBB',
    'BBBBBBBB',
    'WWWWWWWW',
    'WWWWWWWW',
    'WWWWWWWW',
    'WWWWWWWW',
  ]);
  const next = playMove(state, 0);
  assert.equal(next.status, 'finished');
  assert.equal(next.lastMove, 0);
  assert.deepEqual(getResult(next), { black: 32, white: 32, empty: 0, winner: 'draw' });
});
