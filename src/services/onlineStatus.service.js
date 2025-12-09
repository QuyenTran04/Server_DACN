const User = require("../models/User");

// Đánh dấu user offline nếu không hoạt động trong 5 phút
const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 phút

async function updateOfflineUsers() {
  try {
    const thresholdTime = new Date(Date.now() - OFFLINE_THRESHOLD);
    
    await User.updateMany(
      {
        isOnline: true,
        lastActive: { $lt: thresholdTime },
      },
      {
        isOnline: false,
      }
    );
  } catch (error) {
    console.error("Error updating offline users:", error);
  }
}

// Chạy mỗi 1 phút
function startOnlineStatusMonitor() {
  setInterval(updateOfflineUsers, 60 * 1000);
  console.log("✅ Online status monitor started");
}

module.exports = {
  updateOfflineUsers,
  startOnlineStatusMonitor,
};
