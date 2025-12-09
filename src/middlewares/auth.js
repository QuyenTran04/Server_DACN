const jwt = require("jsonwebtoken");
const User = require("../models/User");

exports.requireAuth = async (req, res, next) => {
  try {
    const token =
      req.cookies?.token ||
      (req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : null);

    if (!token) return res.status(401).json({ message: "Chưa đăng nhập" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded.uid;
    if (!userId) return res.status(401).json({ message: "Token không hợp lệ" });
    const user = await User.findById(userId).select("_id role name email isActive");
    if (!user) return res.status(401).json({ message: "Token không hợp lệ" });

    // Kiểm tra tài khoản có bị khóa không
    if (user.isActive === false) {
      return res.status(403).json({ message: "Tài khoản đã bị khóa" });
    }

    // Cập nhật trạng thái online và lastActive
    User.findByIdAndUpdate(userId, {
      isOnline: true,
      lastActive: new Date(),
    }).exec().catch(() => {}); // Fire and forget

    req.user = user;
    next();
  } catch (err) {
    return res
      .status(401)
      .json({ message: "Xác thực thất bại", error: err.message });
  }
};

exports.requireRole = (...roles) => {
  const normalized = roles.map((r) => String(r).toLowerCase());
  return (req, res, next) => {
    const userRole = String(req.user?.role || "").toLowerCase();
    if (!userRole || !normalized.includes(userRole)) {
      return res.status(403).json({ message: "Không có quyền truy cập" });
    }
    next();
  };
};
