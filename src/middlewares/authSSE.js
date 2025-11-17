const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Middleware cho SSE stream - lấy token từ query string hoặc cookies hoặc header
// Setup SSE headers ngay + xác thực token (nếu có)
exports.requireAuthSSE = async (req, res, next) => {
  try {
    // Setup SSE headers NGAY TẠI ĐÂY để chắc chắn client nhận được
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    console.log("[authSSE] Setting up SSE stream...");

    const token =
      req.query.token ||
      req.cookies?.token ||
      (req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : null);

    console.log("[authSSE] Token:", token ? `${token.substring(0, 20)}...` : "none");

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id || decoded.uid;
        console.log("[authSSE] Decoded userId:", userId);
        
        if (userId) {
          const user = await User.findById(userId).select("_id role name email");
          if (user) {
            req.user = user;
            console.log("[authSSE] User authenticated:", user._id);
          }
        }
      } catch (tokenErr) {
        console.warn("[authSSE] Token verification failed:", tokenErr.message);
      }
    }
    
    next();
  } catch (err) {
    // Catch any other errors but still allow stream to continue
    console.error("[authSSE] Unexpected error:", err.message);
    next();
  }
};
