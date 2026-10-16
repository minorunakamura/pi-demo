import { getLegalMoves, getResult, playMove } from './rules.ts';
import type { Cell, GameState } from './rules.ts';

function evaluate(state: GameState): number {
  const { white, black, empty, winner } = getResult(state);
  const stones = white - black;
  if (winner === 'white') return 10000 + stones;
  if (winner === 'black') return -10000 + stones;
  if (winner === 'draw') return 0;

  let corners = 0;
  for (const index of [0, 7, 56, 63]) {
    if (state.board[index] === 'white') corners++;
    if (state.board[index] === 'black') corners--;
  }
  const mobility = getLegalMoves(state.board, 'white').length - getLegalMoves(state.board, 'black').length;
  return corners * 100 + mobility * 10 + stones * (empty <= 16 ? 5 : 1);
}

export function chooseCpuMove(
  board: readonly Cell[],
  options: { now?: () => number; budgetMs?: number } = {},
): number | null {
  const now = options.now ?? (() => performance.now());
  const deadline = now() + (options.budgetMs ?? 800);
  const moves = getLegalMoves(board, 'white');
  let completedMove = moves[0] ?? null;
  const state: GameState = {
    board, turn: 'white', status: 'playing', lastMove: null, passedPlayer: null,
  };
  function search(current: GameState, remaining: number): number | undefined {
    if (remaining === 0 || current.status === 'finished') {
      const score = evaluate(current);
      return now() >= deadline ? undefined : score;
    }
    let score = current.turn === 'white' ? -Infinity : Infinity;
    for (const move of getLegalMoves(current.board, current.turn)) {
      if (now() >= deadline) return undefined;
      const childScore = search(playMove(current, move), remaining - 1);
      if (childScore === undefined) return undefined;
      score = current.turn === 'white' ? Math.max(score, childScore) : Math.min(score, childScore);
    }
    return score;
  }

  for (const depth of [1, 2]) {
    let bestMove = completedMove;
    let bestScore = -Infinity;
    for (const move of moves) {
      if (now() >= deadline) return completedMove;
      const score = search(playMove(state, move), depth - 1);
      if (score === undefined) return completedMove;
      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
    completedMove = bestMove;
  }
  return completedMove;
}
