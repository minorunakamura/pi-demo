export type Player = 'black' | 'white';
export type Cell = Player | null;

export interface GameState {
  readonly board: readonly Cell[];
  readonly turn: Player;
  readonly status: 'playing' | 'finished';
  readonly lastMove: number | null;
  readonly passedPlayer: Player | null;
}

export function createInitialState(): GameState {
  const board: Cell[] = Array(64).fill(null);
  board[27] = 'white';
  board[36] = 'white';
  board[28] = 'black';
  board[35] = 'black';
  return { board, turn: 'black', status: 'playing', lastMove: null, passedPlayer: null };
}

export function getResult(state: GameState) {
  const black = state.board.filter((cell) => cell === 'black').length;
  const white = state.board.filter((cell) => cell === 'white').length;
  const empty = 64 - black - white;
  const winner = state.status === 'playing' ? null
    : black === white ? 'draw'
    : black > white ? 'black' : 'white';
  return { black, white, empty, winner };
}

function getFlips(board: readonly Cell[], player: Player, index: number): number[] {
  if (!Number.isInteger(index) || index < 0 || index >= 64 || board[index] !== null) return [];
  const flips: number[] = [];
  const opponent = player === 'black' ? 'white' : 'black';
  for (const dy of [-1, 0, 1]) {
    for (const dx of [-1, 0, 1]) {
      if (dx === 0 && dy === 0) continue;
      const line: number[] = [];
      let row = Math.floor(index / 8) + dy;
      let column = index % 8 + dx;
      while (row >= 0 && row < 8 && column >= 0 && column < 8) {
        const next = row * 8 + column;
        if (board[next] === opponent) {
          line.push(next);
        } else {
          if (board[next] === player) flips.push(...line);
          break;
        }
        row += dy;
        column += dx;
      }
    }
  }
  return flips;
}

export function getLegalMoves(board: readonly Cell[], player: Player): number[] {
  const moves: number[] = [];
  for (let index = 0; index < 64; index++) {
    if (getFlips(board, player, index).length > 0) moves.push(index);
  }
  return moves;
}

export function playMove(state: GameState, index: number): GameState {
  if (state.status === 'finished') return state;
  const flips = getFlips(state.board, state.turn, index);
  if (flips.length === 0) return state;
  const board = [...state.board];
  board[index] = state.turn;
  for (const flipped of flips) board[flipped] = state.turn;
  return normalizeTurn({
    board,
    turn: state.turn === 'black' ? 'white' : 'black',
    status: 'playing',
    lastMove: index,
    passedPlayer: null,
  });
}

export function normalizeTurn(state: GameState): GameState {
  if (state.status === 'finished' || getLegalMoves(state.board, state.turn).length > 0) return state;
  const opponent = state.turn === 'black' ? 'white' : 'black';
  if (getLegalMoves(state.board, opponent).length === 0) {
    return { ...state, status: 'finished', passedPlayer: null };
  }
  return { ...state, turn: opponent, passedPlayer: state.turn };
}
