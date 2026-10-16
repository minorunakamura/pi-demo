import { chooseCpuMove } from './cpu.ts';
import type { Cell } from './rules.ts';

self.onmessage = (event: MessageEvent<readonly Cell[]>) => {
  self.postMessage(chooseCpuMove(event.data));
};
