const Agenda = require("agenda");

let agenda;

// Khởi tạo Agenda với MongoDB
const initAgenda = async (mongoUrl) => {
  agenda = new Agenda({
    db: { address: mongoUrl, collection: "agendaJobs" },
    processEvery: "10 seconds", // Kiểm tra job mỗi 10 giây
    maxConcurrency: 5, // Tối đa 5 job chạy cùng lúc
  });

  // Khởi động
  await agenda.start();
  console.log("[Agenda] ✅ Started successfully");

  return agenda;
};

// Lấy instance Agenda
const getAgenda = () => {
  if (!agenda) {
    throw new Error("[Agenda] Chưa khởi tạo. Gọi initAgenda trước!");
  }
  return agenda;
};

// Đóng Agenda
const stopAgenda = async () => {
  if (agenda) {
    await agenda.stop();
    console.log("[Agenda] ⏹️ Stopped");
  }
};

module.exports = { initAgenda, getAgenda, stopAgenda };
