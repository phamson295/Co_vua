// Chạy việc tính nước đi của máy ở luồng riêng để giao diện không bị đơ.
import { chooseMove, LEVELS } from './ai.js';

self.onmessage = ({ data }) => {
  const level = { ...(LEVELS[data.level - 1] ?? LEVELS[0]) };
  // Khi có đồng hồ (hoặc khi gợi ý nước đi), giới hạn thời gian suy nghĩ thấp hơn mặc định của cấp độ.
  if (data.timeMs) level.timeMs = Math.min(level.timeMs, data.timeMs);
  const { move, depth, score } = chooseMove(data.state, level);
  self.postMessage({ id: data.id, move, depth, score });
};
