// Chạy việc tính nước đi của máy ở luồng riêng để giao diện không bị đơ.
import { chooseMove, LEVELS } from './ai.js';

self.onmessage = ({ data }) => {
  const level = LEVELS[data.level - 1] ?? LEVELS[0];
  const { move, depth, score } = chooseMove(data.state, level);
  self.postMessage({ id: data.id, move, depth, score });
};
