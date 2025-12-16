require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const connectDB = require("./configs/database");
const cors = require("cors");
const { initAgenda, defineGenerateDocumentJob } = require("./configs/agenda");
const { defineGenerateDocumentJob: setupDocumentJob } = require("./services/document-generation.service");
const { startOnlineStatusMonitor } = require("./services/onlineStatus.service");

const embeddingRoutes = require("./routes/embedding.routes");
const authRoutes = require("./routes/auth.routes");
const categoryRoutes = require("./routes/category.routes");
const courseRoutes = require("./routes/course.routes");
const lessonRoutes = require("./routes/lesson.routes");
const quizRoutes = require("./routes/quiz.routes");
const practiceRoutes = require("./routes/practice.routes");
const adminRoutes = require("./routes/admin.routes");
const aiRoutes = require("./routes/ai.routes");
const searchRoutes = require("./routes/search.routes");
const documentRoutes = require("./routes/document.routes");
const testRoutes = require("./routes/test.routes");
const reviewRoutes = require("./routes/review.routes");
const walletRoutes = require("./routes/wallet.routes");
const announcementRoutes = require("./routes/announcement.routes");
const certificateRoutes = require("./routes/certificate.routes");
const shareRoutes = require("./routes/share.routes");

connectDB();
const app = express();
app.use(express.json());
app.use(cookieParser());

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:5177";
app.use(
  cors({
    origin: [FRONTEND_ORIGIN, "http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176", "http://localhost:5177"], // cho phép nhiều ports
    credentials: true, // bắt buộc nếu dùng cookie httpOnly
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Content-Type"],
  })
);


// Routes
app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/lessons", lessonRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/practice", practiceRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/embeddings", embeddingRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/test", testRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/share", shareRoutes);

const PORT = process.env.PORT || 5000;

// Khởi tạo Agenda và định nghĩa jobs
(async () => {
  try {
    // Chờ MongoDB kết nối xong trước
    await new Promise((resolve) => {
      const checkConnection = () => {
        if (require("mongoose").connection.readyState === 1) {
          resolve();
        } else {
          setTimeout(checkConnection, 500);
        }
      };
      checkConnection();
    });

    // Khởi tạo Agenda
    await initAgenda(process.env.MONGO_URI);

    // Định nghĩa jobs
    setupDocumentJob();

    // Khởi động online status monitor
    startOnlineStatusMonitor();

    // Start server
    app.listen(PORT, () => console.log(`Server chạy trên cổng ${PORT}`));
  } catch (err) {
    console.error("[Server] Lỗi khởi tạo Agenda:", err.message);
    process.exit(1);
  }
})();

