import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseCpuMove } from '../src/cpu.ts';
import { createInitialState, getLegalMoves } from '../src/rules.ts';
import type { Cell } from '../src/rules.ts';

function board(rows: string[]): readonly Cell[] {
  assert.equal(rows.length, 8);
  assert.ok(rows.every((row) => /^[.BW]{8}$/.test(row)));
  return Object.freeze(rows.join('').split('').map((cell) => cell === 'B' ? 'black' : cell === 'W' ? 'white' : null));
}

test('chooseCpuMove keeps the first legal move when the budget expires at search start', () => {
  const cells = Object.freeze(createInitialState().board);
  const before = [...cells];
  assert.deepEqual(getLegalMoves(cells, 'white'), [20, 29, 34, 43]);
  assert.equal(chooseCpuMove(cells, { now: () => 0, budgetMs: 0 }), 20);
  assert.deepEqual(cells, before);
});

test('chooseCpuMove prefers the available corner over an earlier non-corner without changing the board', () => {
  const cells = board([
    '........', '.BW.....', '........', '.BW.....',
    '........', '........', '........', '.....WB.',
  ]);
  const before = [...cells];
  assert.deepEqual(getLegalMoves(cells, 'white'), [8, 24, 63]);
  assert.equal(chooseCpuMove(cells, { now: () => 0 }), 63);
  assert.deepEqual(cells, before);
});

test('chooseCpuMove uses the completed one-move stone evaluation when the deeper search cannot start', () => {
  const cells = board([
    'WBWWWBBW', 'WBBBBWBB', 'BBB.B.WB', 'WWWBWWWB',
    'BW.WBBWB', 'BWBBWWWW', 'BBBBWBBW', 'WWBWWWWB',
  ]);
  // All children have corner difference 2 and equal mobility; stone differences are 4, 4, 6.
  let time = 0;
  assert.equal(chooseCpuMove(cells, { now: () => time++, budgetMs: 7 }), 34);
});

test('chooseCpuMove minimizes black replies and resolves ties in row-major order', () => {
  const cells = board([
    'WBWWWBBW', 'WBBBBWBB', 'BBB.B.WB', 'WWWBWWWB',
    'BW.WBBWB', 'BWBBWWWW', 'BBBBWBBW', 'WWBWWWWB',
  ]);
  // Two-move worst scores: D3=155, F3=165, C5=165; shallow C5=230.
  assert.equal(chooseCpuMove(cells, { now: () => 0 }), 21);
});

test('chooseCpuMove values mobility at ten and early stones at one', () => {
  const cells = board([
    '......W.', '......B.', '...B....', '..B.....',
    '...B....', '.B..WW..', '.......W', '....B...',
  ]);
  // After two moves: B3 has mobility -1 / stones 0 (-10); G3 has 0 / -2 (-2).
  assert.equal(chooseCpuMove(cells, { now: () => 0 }), 22);
});

test('chooseCpuMove prioritizes an immediate win with empty squares over a corner', () => {
  const cells = board([
    '........', '.BB.....', '.WWW....', '........',
    '........', '........', '........', '........',
  ]);
  // B1 removes both black stones: a 6–0 terminal win. A1 remains non-terminal.
  assert.equal(chooseCpuMove(cells, { now: () => 0 }), 1);
});

test('chooseCpuMove uses a stone weight of five as soon as a leaf has sixteen empty squares', () => {
  const cells = board([
    '.WWWW.W.', 'WW.WW.WW', 'WWWB.WWW', 'W.WWWW.W',
    'WWW..W.W', 'WW.WWWW.', 'WBW.WWW.', 'W.W.WWW.',
  ]);
  // At 16 empties, worst scores for C2/E3/C6/B8 are 260/260/270/260.
  // Using weight one instead gives 100/100/102/108 and incorrectly selects B8.
  assert.equal(chooseCpuMove(cells, { now: () => 0 }), 42);
});

test('chooseCpuMove does not count a black pass and maximizes the consecutive white move', () => {
  const cells = board([
    'WWWWBWWB', 'WWWWWWWW', '.WWWWWBW', 'BWWWBWWW',
    'WWWWWWWW', 'WWWBWBWW', '.BWWWWWW', '.B.WWWWW',
  ]);
  // A3 forces black to pass; white can then choose scores 330/450/340, so takes 450.
  // Other root worst scores: A7=140, A8=340, C8=190; counting the pass selects A8.
  assert.equal(chooseCpuMove(cells, { now: () => 0 }), 16);
});

test('chooseCpuMove scores a terminal draw as zero regardless of corner ownership', () => {
  const cells = board([
    '........', '.BB.....', '.WWW....', '........',
    '........', '........', '........', 'BBBBBB..',
  ]);
  // B1 ends 6–6 with an unoccupied board corner and a black A8; A1 has worst score -15.
  assert.equal(chooseCpuMove(cells, { now: () => 0 }), 1);
});

test('chooseCpuMove rejects a terminal loss at a corner and evaluates a white pass on move two', () => {
  const cells = board([
    '.BW.....', '.BW.....', '..W.....', '........',
    '........', '........', '........', 'BBBBBBB.',
  ]);
  // A1 ends 6–7 (-10001). A2/A3 worst scores are -146/-136 after black D1 forces a white pass.
  assert.equal(chooseCpuMove(cells, { now: () => 0 }), 16);
});

test('chooseCpuMove uses the final stone difference to rank wins and losses ending on move two', () => {
  for (const rows of [
    // A1/H8 finish at +6/+8: both wins, prefer +8.
    ['.BWWBWWW', 'BWBBBBWB', 'BWWWBWBW', 'WWWWBWWW', 'BWWWBWBB', 'WWWBWWBB', 'BWBBBWBB', 'BWBBWWW.'],
    // A1/H8 finish at -12/-4: both losses, prefer -4.
    ['.BWWBBBB', 'BWBBWBBB', 'WWWWWBBB', 'WBWBWBWB', 'BBWWWBWW', 'WBBWWWWB', 'WWBBBBWB', 'BBBBWWW.'],
  ]) {
    assert.equal(chooseCpuMove(board(rows), { now: () => 0 }), 63);
  }
});

test('chooseCpuMove only publishes a fully completed depth under the injected deadline', () => {
  const cells = board([
    'WBWWWBBW', 'WBBBBWBB', 'BBB.B.WB', 'WWWBWWWB',
    'BW.WBBWB', 'BWBBWWWW', 'BBBBWBBW', 'WWBWWWWB',
  ]);
  const before = [...cells];
  for (const [budgetMs, expected] of [
    [1, 19], // Expired immediately after obtaining the first legal move.
    [6, 19], // Shallow stage unfinished: do not publish its better C5 candidate.
    [7, 34], // Shallow stage complete, deep stage cannot start.
    [12, 34], // Only the first deep root candidate has completed.
    [17, 34], // Deep F3 is better, but C5 has not yet completed.
    [21, 34], // Deadline reached during the last deep evaluation.
    [22, 21], // Every two-move candidate has completed.
  ]) {
    let time = 0;
    assert.equal(chooseCpuMove(cells, { now: () => time++, budgetMs }), expected, `budget ${budgetMs}`);
  }
  assert.deepEqual(cells, before);
});

test('chooseCpuMove never searches a third move even when the clock has unlimited time', () => {
  const cells = board([
    'BBWWBWWW', 'BW.BBBWB', 'BWWWBWBW', 'WWWWBWWW',
    'BWWWBWBB', 'W.WBWWBB', 'BWBBB.BB', 'BWBBWWWW',
  ]);
  // Two-move worst scores: C2=-15, F7=-25. A third move instead makes F7 a forced 34–30 win.
  assert.equal(chooseCpuMove(cells, { now: () => 0 }), 10);
});

test('chooseCpuMove defaults to an 800ms budget and expires exactly at the deadline', () => {
  const cells = board([
    'WBWWWBBW', 'WBBBBWBB', 'BBB.B.WB', 'WWWBWWWB',
    'BW.WBBWB', 'BWBBWWWW', 'BBBBWBBW', 'WWBWWWWB',
  ]);
  let time = 0;
  const now = () => {
    const current = time;
    time = 800;
    return current;
  };
  assert.equal(chooseCpuMove(cells, { now }), 19);
  time = 0;
  assert.equal(chooseCpuMove(cells, { now, budgetMs: 801 }), 21);
});

test('chooseCpuMove returns null when white has no legal move, including a forced pass', () => {
  for (const cells of [Array<Cell>(64).fill('white'), board([
    '.WBBBBW.', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB',
    'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB',
  ])]) {
    assert.equal(chooseCpuMove(cells), null);
  }
});
