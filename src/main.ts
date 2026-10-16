import { createGame } from './game.ts';
import type { RunCpu } from './game.ts';
import { getLegalMoves, getResult } from './rules.ts';
import type { GameState } from './rules.ts';

const board = document.querySelector<HTMLDivElement>('#board')!;
const turn = document.querySelector<HTMLParagraphElement>('#turn')!;
const score = document.querySelector<HTMLParagraphElement>('#score')!;
const lastMove = document.querySelector<HTMLParagraphElement>('#last-move')!;
const pass = document.querySelector<HTMLParagraphElement>('#pass')!;
const reset = document.querySelector<HTMLButtonElement>('#reset')!;

const runCpu: RunCpu = (board, complete, fail) => {
  const worker = new Worker(new URL('./cpu.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<unknown>) => complete(event.data);
  worker.onerror = fail;
  worker.onmessageerror = fail;
  try {
    worker.postMessage(board);
  } catch (error) {
    worker.terminate();
    throw error;
  }
  return () => worker.terminate();
};

function coordinate(index: number): string {
  return `${'ABCDEFGH'[index % 8]}${Math.floor(index / 8) + 1}`;
}

// Keep the buttons in place so rendering does not discard keyboard focus.
const cells = Array.from({ length: 64 }, (_, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cell';
  const label = document.createElement('span');
  label.className = 'coordinate';
  label.textContent = coordinate(index);
  label.setAttribute('aria-hidden', 'true');
  const stone = document.createElement('span');
  stone.setAttribute('aria-hidden', 'true');
  button.append(label, stone);
  button.addEventListener('click', () => game.humanMove(index));
  board.append(button);
  return { button, stone };
});

function render(state: GameState): void {
  const legalMoves = state.status === 'playing' && state.turn === 'black'
    ? getLegalMoves(state.board, state.turn) : [];
  const result = getResult(state);
  for (const [index, { button, stone }] of cells.entries()) {
    const cell = state.board[index];
    const legal = legalMoves.includes(index);
    const latest = state.lastMove === index;
    const stoneName = cell === 'black' ? '黒石' : cell === 'white' ? '白石' : '空き';
    button.setAttribute('aria-label', `${coordinate(index)}、${stoneName}${legal ? '、黒の合法手' : ''}${latest ? '、直前の着手' : ''}`);
    button.setAttribute('aria-disabled', String(!legal));
    button.classList.toggle('legal', legal);
    button.classList.toggle('last-move', latest);
    stone.className = `stone ${cell ?? 'empty'}`;
    stone.textContent = cell === 'black' ? '黒' : cell === 'white' ? '白' : legal ? '＋' : '';
  }
  if (state.status === 'finished') {
    turn.textContent = result.winner === 'draw' ? '終局：引き分けです。'
      : `終局：${result.winner === 'black' ? '黒' : '白'}の勝ちです。`;
  } else {
    turn.textContent = state.turn === 'black'
      ? '黒（あなた）の手番です。＋のマスを選んでください。'
      : '白（CPU）の手番です。思考中…';
  }
  score.textContent = `黒：${result.black}　白：${result.white}`;
  lastMove.textContent = state.lastMove === null ? '直前の着手：なし' : `直前の着手：${coordinate(state.lastMove)}（★）`;
  pass.textContent = state.passedPlayer === null ? ''
    : `${state.passedPlayer === 'black' ? '黒' : '白'}は合法手がないためパスしました。`;
  reset.textContent = state.status === 'finished' ? 'もう一度遊ぶ' : '最初から';
}

const game = createGame(runCpu, render);
reset.addEventListener('click', () => game.restart());
render(game.getState());
