import { createInitialState, getLegalMoves, normalizeTurn, playMove } from './rules.ts';
import type { Cell, GameState } from './rules.ts';

export type RunCpu = (
  board: readonly Cell[],
  complete: (move: unknown) => void,
  fail: () => void,
) => () => void;

interface CpuRequest {
  cancel: (() => void) | null;
  timer: ReturnType<typeof setTimeout> | null;
}

export function createGame(
  runCpu: RunCpu,
  onChange: (state: GameState) => void,
  initialState: GameState = createInitialState(),
) {
  let state = normalizeTurn(initialState);
  let active: CpuRequest | null = null;

  function stopCpu() {
    const request = active;
    active = null;
    if (!request) return;
    if (request.timer !== null) clearTimeout(request.timer);
    request.cancel?.();
  }

  function startCpu() {
    if (state.status !== 'playing' || state.turn !== 'white' || active) return;
    const request: CpuRequest = { cancel: null, timer: null };
    active = request;
    const complete = (move: unknown) => {
      if (active !== request || state.status !== 'playing' || state.turn !== 'white') return;
      const legal = getLegalMoves(state.board, 'white');
      const index = typeof move === 'number' && legal.includes(move) ? move : legal[0];
      stopCpu();
      const next = playMove(state, index);
      // Keep the pass explanation readable until a legal human move or restart.
      state = { ...next, passedPlayer: next.passedPlayer ?? state.passedPlayer };
      onChange(state);
      startCpu();
    };
    const fail = () => complete(undefined);
    request.timer = setTimeout(fail, 900);
    try {
      const cancel = runCpu(state.board, complete, fail);
      if (active === request) request.cancel = cancel;
      else cancel();
    } catch {
      fail();
    }
  }

  function humanMove(index: number) {
    if (state.status !== 'playing' || state.turn !== 'black') return;
    const next = playMove(state, index);
    if (next === state) return;
    state = next;
    onChange(state);
    startCpu();
  }

  function restart() {
    stopCpu();
    state = createInitialState();
    onChange(state);
  }

  startCpu();
  return { getState: () => state, humanMove, restart };
}
