import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { createGame } from '../src/game.ts';
import type { RunCpu } from '../src/game.ts';
import { createInitialState, getResult } from '../src/rules.ts';
import type { Cell, GameState, Player } from '../src/rules.ts';

beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }));
afterEach(() => mock.timers.reset());

function position(rows: string[], turn: Player = 'black'): GameState {
  assert.equal(rows.length, 8);
  assert.ok(rows.every((row) => /^[.BW]{8}$/.test(row)));
  return Object.freeze({
    board: Object.freeze(rows.join('').split('').map((cell) => cell === 'B' ? 'black' : cell === 'W' ? 'white' : null)),
    turn, status: 'playing', lastMove: null, passedPlayer: null,
  });
}

function controlledCpu() {
  const requests: {
    board: readonly Cell[];
    complete: (move: unknown) => void;
    fail: () => void;
    cancelled: boolean;
  }[] = [];
  const runCpu: RunCpu = (board, complete, fail) => {
    const request = { board, complete, fail, cancelled: false };
    requests.push(request);
    return () => { request.cancelled = true; };
  };
  return { runCpu, requests };
}

test('createGame starts with black and notifies a human move before starting CPU work', () => {
  const notifications: GameState[] = [];
  const game = createGame((board) => {
    assert.equal(board, notifications.at(-1)?.board);
    assert.equal(board[19], 'black');
    assert.equal(board[27], 'black');
    return () => {};
  }, (state) => notifications.push(state));
  assert.deepEqual(game.getState(), createInitialState());
  game.humanMove(19);
  assert.equal(game.getState().turn, 'white');
  assert.equal(game.getState().lastMove, 19);
  assert.deepEqual(getResult(game.getState()), { black: 4, white: 1, empty: 59, winner: null });
  assert.deepEqual(notifications, [game.getState()]);
});

test('humanMove rejects illegal input and repeated input during the CPU turn without notifications', () => {
  const cpu = controlledCpu();
  const notifications: GameState[] = [];
  const game = createGame(cpu.runCpu, (state) => notifications.push(state));
  const initial = game.getState();
  for (const index of [27, 0, -1, 64, 1.5, NaN, Infinity, 20]) game.humanMove(index);
  assert.equal(game.getState(), initial);
  assert.deepEqual(notifications, []);
  assert.equal(cpu.requests.length, 0);
  game.humanMove(19);
  const thinking = game.getState();
  for (const index of [19, 18, 20, 26]) game.humanMove(index);
  assert.equal(game.getState(), thinking);
  assert.deepEqual(notifications, [thinking]);
  assert.equal(cpu.requests.length, 1);
});

test('a delayed legal CPU response advances the board once and cancels its work', () => {
  const cpu = controlledCpu();
  const notifications: GameState[] = [];
  const game = createGame(cpu.runCpu, (state) => notifications.push(state));
  game.humanMove(19);
  const thinking = game.getState();
  Object.freeze(thinking.board);
  Object.freeze(thinking);
  mock.timers.tick(100);
  assert.equal(game.getState(), thinking);
  cpu.requests[0].complete(20);
  const next = game.getState();
  assert.equal(next.turn, 'black');
  assert.equal(next.lastMove, 20);
  assert.equal(next.board[20], 'white');
  assert.equal(next.board[28], 'white');
  assert.deepEqual(getResult(next), { black: 3, white: 3, empty: 58, winner: null });
  assert.equal(thinking.board[20], null);
  assert.equal(cpu.requests[0].cancelled, true);
  assert.deepEqual(notifications, [thinking, next]);
  cpu.requests[0].complete(18);
  assert.equal(game.getState(), next);
  assert.deepEqual(notifications, [thinking, next]);
});

test('a synchronous CPU completion still cancels the returned work and ignores cancellation callbacks', () => {
  let cancelled = false;
  const notifications: GameState[] = [];
  const game = createGame((_board, complete, fail) => {
    complete(20);
    return () => {
      cancelled = true;
      complete(18);
      fail();
    };
  }, (state) => notifications.push(state));
  game.humanMove(19);
  assert.equal(game.getState().lastMove, 20);
  assert.equal(game.getState().turn, 'black');
  assert.equal(cancelled, true);
  assert.equal(notifications.length, 2);
});

test('CPU failure uses the first legal move once and ignores later success or failure', () => {
  const cpu = controlledCpu();
  const notifications: GameState[] = [];
  const game = createGame(cpu.runCpu, (state) => notifications.push(state));
  game.humanMove(19);
  cpu.requests[0].fail();
  const next = game.getState();
  assert.equal(next.lastMove, 18);
  assert.equal(next.turn, 'black');
  assert.equal(next.board[18], 'white');
  assert.equal(next.board[27], 'white');
  assert.deepEqual(getResult(next), { black: 3, white: 3, empty: 58, winner: null });
  assert.equal(cpu.requests[0].cancelled, true);
  cpu.requests[0].complete(20);
  cpu.requests[0].fail();
  assert.equal(game.getState(), next);
  assert.equal(notifications.length, 2);
});

test('untrusted CPU responses fall back to the first current legal move without coercion', () => {
  for (const response of [null, undefined, '20', { move: 20 }, [20], NaN, Infinity, 20.5, -1, 64, 19, 0, 26]) {
    const cpu = controlledCpu();
    const game = createGame(cpu.runCpu, () => {});
    game.humanMove(19);
    cpu.requests[0].complete(response);
    assert.equal(game.getState().lastMove, 18, `response: ${String(response)}`);
    assert.equal(game.getState().turn, 'black');
    assert.equal(cpu.requests[0].cancelled, true);
  }
});

test('CPU startup throws advance once with a legal fallback instead of leaving white thinking', () => {
  const notifications: GameState[] = [];
  const game = createGame(() => { throw new Error('Worker startup failed'); }, (state) => notifications.push(state));
  assert.doesNotThrow(() => game.humanMove(19));
  assert.equal(game.getState().lastMove, 18);
  assert.equal(game.getState().turn, 'black');
  assert.equal(notifications.length, 2);
});

test('the 900ms main watchdog falls back once and discards late completion and failure', () => {
  const cpu = controlledCpu();
  const notifications: GameState[] = [];
  const game = createGame(cpu.runCpu, (state) => notifications.push(state));
  game.humanMove(19);
  const thinking = game.getState();
  mock.timers.tick(899);
  assert.equal(game.getState(), thinking);
  mock.timers.tick(1);
  const next = game.getState();
  assert.equal(next.lastMove, 18);
  assert.equal(next.turn, 'black');
  assert.equal(cpu.requests[0].cancelled, true);
  cpu.requests[0].complete(20);
  cpu.requests[0].fail();
  mock.timers.tick(900);
  assert.equal(game.getState(), next);
  assert.equal(notifications.length, 2);
});

test('repeated restart invalidates work before cancellation and rejects old callbacks during a new white turn', () => {
  const cpu = controlledCpu();
  const notifications: GameState[] = [];
  const game = createGame((board, complete, fail) => {
    const cancel = cpu.runCpu(board, complete, fail);
    return () => {
      cancel();
      complete(20);
      fail();
    };
  }, (state) => notifications.push(state));
  game.humanMove(19);
  const old = cpu.requests[0];
  mock.timers.tick(400);
  game.restart();
  assert.equal(old.cancelled, true);
  assert.deepEqual(game.getState(), createInitialState());
  game.restart();
  assert.deepEqual(game.getState(), createInitialState());
  assert.equal(notifications.length, 3);
  game.humanMove(19);
  const thinking = game.getState();
  old.complete(20);
  old.fail();
  mock.timers.tick(500);
  assert.equal(game.getState(), thinking);
  assert.equal(cpu.requests[1].cancelled, false);
  cpu.requests[1].complete(34);
  assert.equal(game.getState().lastMove, 34);
  assert.equal(game.getState().turn, 'black');
  assert.equal(cpu.requests[1].cancelled, true);
  mock.timers.tick(1000);
  assert.equal(game.getState().lastMove, 34);
  assert.equal(notifications.length, 5);
});

test('black passes automatically and consecutive white turns keep requesting CPU moves until terminal', () => {
  const initial = position([
    '.BWWWWB.', 'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW',
    'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW',
  ]);
  const cpu = controlledCpu();
  const notifications: GameState[] = [];
  const game = createGame(cpu.runCpu, (state) => notifications.push(state), initial);
  assert.equal(game.getState().turn, 'white');
  assert.equal(game.getState().passedPlayer, 'black');
  assert.equal(cpu.requests.length, 1);
  const thinking = game.getState();
  game.humanMove(0);
  assert.equal(game.getState(), thinking);
  assert.equal(game.getState().passedPlayer, 'black');
  cpu.requests[0].complete(0);
  const again = game.getState();
  assert.equal(again.turn, 'white');
  assert.equal(again.passedPlayer, 'black');
  assert.equal(again.lastMove, 0);
  assert.equal(cpu.requests.length, 2);
  assert.equal(cpu.requests[0].cancelled, true);
  cpu.requests[0].complete(7);
  cpu.requests[0].fail();
  assert.equal(game.getState(), again);
  cpu.requests[1].complete(7);
  assert.equal(game.getState().status, 'finished');
  assert.equal(game.getState().lastMove, 7);
  assert.equal(game.getState().passedPlayer, 'black');
  assert.deepEqual(notifications.map((state) => state.passedPlayer), ['black', 'black']);
  assert.deepEqual(getResult(game.getState()), { black: 0, white: 64, empty: 0, winner: 'white' });
  assert.equal(cpu.requests[1].cancelled, true);
  assert.equal(cpu.requests.length, 2);
  assert.equal(notifications.length, 2);
  assert.equal(initial.board[0], null);
  assert.equal(initial.turn, 'black');
  const finished = game.getState();
  game.humanMove(7);
  assert.equal(game.getState(), finished);
  assert.equal(game.getState().passedPlayer, 'black');
  game.restart();
  assert.deepEqual(game.getState(), createInitialState());
});

test('a retained black pass survives invalid human input until a legal move clears it or replaces it with a white pass', () => {
  const initial = position([
    'BBWWWWWW', 'WWWWWWWW', 'WWBBBBBW', 'WWBWBBBW',
    'WWWBBBBW', 'WWBWWBBW', 'WWWWWBB.', 'WWWWB...',
  ]);
  for (const [move, expectedPass] of [[55, null], [61, 'white']] as const) {
    const cpu = controlledCpu();
    const notifications: GameState[] = [];
    const game = createGame(cpu.runCpu, (state) => notifications.push(state), initial);
    assert.equal(game.getState().passedPlayer, 'black');
    cpu.requests[0].complete(62);
    const humanTurn = game.getState();
    assert.equal(humanTurn.turn, 'black');
    assert.equal(humanTurn.passedPlayer, 'black');
    for (const invalid of [0, 56, -1, 64]) game.humanMove(invalid);
    assert.equal(game.getState(), humanTurn);
    assert.deepEqual(notifications, [humanTurn]);
    game.humanMove(move);
    assert.equal(game.getState().lastMove, move);
    assert.equal(game.getState().passedPlayer, expectedPass);
    assert.equal(notifications.at(-1)?.passedPlayer, expectedPass);
    game.restart();
    assert.deepEqual(game.getState(), createInitialState());
  }
});

test('settled and restarted requests leave no watchdog callback scheduled', (t) => {
  const schedule = globalThis.setTimeout;
  let expired = 0;
  t.mock.method(globalThis, 'setTimeout', (callback: () => void, delay?: number) => schedule(() => {
    expired++;
    callback();
  }, delay));
  for (const outcome of ['complete', 'fail', 'invalid', 'restart', 'sync', 'throw']) {
    const cpu = controlledCpu();
    const game = createGame((board, complete, fail) => {
      if (outcome === 'throw') throw new Error('startup');
      if (outcome === 'sync') complete(20);
      return cpu.runCpu(board, complete, fail);
    }, () => {});
    game.humanMove(19);
    if (outcome === 'complete') cpu.requests[0].complete(20);
    if (outcome === 'fail') cpu.requests[0].fail();
    if (outcome === 'invalid') cpu.requests[0].complete(null);
    if (outcome === 'restart') game.restart();
    mock.timers.tick(1000);
    assert.equal(expired, 0, outcome);
  }
});

test('white passes automatically so black can keep playing through the last move and restart', () => {
  const initial = position([
    '.WBBBBW.', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB',
    'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB',
  ], 'white');
  const cpu = controlledCpu();
  const notifications: GameState[] = [];
  const game = createGame(cpu.runCpu, (state) => notifications.push(state), initial);
  assert.equal(game.getState().turn, 'black');
  assert.equal(game.getState().passedPlayer, 'white');
  game.humanMove(0);
  assert.equal(game.getState().lastMove, 0);
  assert.equal(game.getState().turn, 'black');
  assert.equal(game.getState().passedPlayer, 'white');
  game.humanMove(7);
  const finished = game.getState();
  assert.equal(finished.status, 'finished');
  assert.equal(finished.lastMove, 7);
  assert.deepEqual(getResult(finished), { black: 64, white: 0, empty: 0, winner: 'black' });
  game.humanMove(0);
  assert.equal(game.getState(), finished);
  assert.equal(notifications.length, 2);
  assert.deepEqual(cpu.requests, []);
  game.restart();
  assert.deepEqual(game.getState(), createInitialState());
  assert.equal(notifications.length, 3);
});

test('both sides without moves finish with empty squares and draw without starting work or timers', (t) => {
  const scheduled = t.mock.method(globalThis, 'setTimeout');
  const initial = position([
    'B.......', '........', '........', '........',
    '........', '........', '........', '.......W',
  ]);
  const cpu = controlledCpu();
  const notifications: GameState[] = [];
  const game = createGame(cpu.runCpu, (state) => notifications.push(state), initial);
  const finished = game.getState();
  assert.equal(finished.status, 'finished');
  assert.deepEqual(getResult(finished), { black: 1, white: 1, empty: 62, winner: 'draw' });
  game.humanMove(0);
  game.humanMove(19);
  mock.timers.tick(1000);
  assert.equal(game.getState(), finished);
  assert.deepEqual(notifications, []);
  assert.deepEqual(cpu.requests, []);
  game.restart();
  assert.deepEqual(game.getState(), createInitialState());
  mock.timers.tick(1000);
  assert.equal(scheduled.mock.calls.length, 0);
  assert.deepEqual(cpu.requests, []);
});

test('synchronous CPU startup failures retain the initial black pass through consecutive moves and terminal', () => {
  const initial = position([
    '.BWWWWB.', 'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW',
    'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW',
  ]);
  const notifications: GameState[] = [];
  const game = createGame(() => { throw new Error('Worker startup failed'); }, (state) => notifications.push(state), initial);
  assert.equal(game.getState().status, 'finished');
  assert.equal(game.getState().passedPlayer, 'black');
  assert.deepEqual(notifications.map(({ lastMove, passedPlayer }) => ({ lastMove, passedPlayer })), [
    { lastMove: 0, passedPlayer: 'black' },
    { lastMove: 7, passedPlayer: 'black' },
  ]);
  assert.deepEqual(getResult(game.getState()), { black: 0, white: 64, empty: 0, winner: 'white' });
});

test('synchronous consecutive white responses settle and clean up every request', () => {
  const initial = position([
    '.BWWWWB.', 'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW',
    'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW', 'WWWWWWWW',
  ], 'white');
  const cancelled: number[] = [];
  const notifications: GameState[] = [];
  const game = createGame((board, complete, fail) => {
    const move = board[0] === null ? 0 : 7;
    complete(move);
    return () => {
      cancelled.push(move);
      complete(move);
      fail();
    };
  }, (state) => notifications.push(state), initial);
  const finished = game.getState();
  assert.equal(finished.status, 'finished');
  assert.equal(finished.lastMove, 7);
  assert.deepEqual(getResult(finished), { black: 0, white: 64, empty: 0, winner: 'white' });
  assert.deepEqual(cancelled.sort((a, b) => a - b), [0, 7]);
  assert.equal(notifications.length, 2);
  mock.timers.tick(1000);
  assert.equal(game.getState(), finished);
});

test('completion, failure and timeout at the same deadline apply only the first outcome', () => {
  for (const first of ['complete', 'fail', 'timeout']) {
    const cpu = controlledCpu();
    const notifications: GameState[] = [];
    const game = createGame(cpu.runCpu, (state) => notifications.push(state));
    const complete = () => cpu.requests[0].complete(20);
    const fail = () => cpu.requests[0].fail();
    if (first === 'complete') setTimeout(complete, 900);
    if (first === 'fail') setTimeout(fail, 900);
    game.humanMove(19);
    setTimeout(complete, 900);
    setTimeout(fail, 900);
    mock.timers.tick(900);
    const next = game.getState();
    assert.equal(next.lastMove, first === 'complete' ? 20 : 18, first);
    assert.equal(next.turn, 'black');
    assert.equal(cpu.requests[0].cancelled, true);
    assert.equal(notifications.length, 2);
    mock.timers.tick(900);
    assert.equal(game.getState(), next);
  }
});
