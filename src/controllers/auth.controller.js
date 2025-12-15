// src/controllers/auth.controller.js
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const signAndSetCookie = (res, payload) => {
  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES || "7d",
  });

  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === "true",
    sameSite: "lax", // dùng "none" nếu FE/BE khác domain + HTTPS
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return token;
};

const normalizeEmail = (email) => (email || "").trim().toLowerCase();
const pickRole = (role) =>
  ["student", "instructor", "admin"].includes(role) ? role : undefined;

const userToSafe = (u, fallback = {}) => ({
  id: u._id,
  name: u.name,
  email: u.email,
  role: u.role,
  avatar: u.avatar || fallback.avatar || null,
  provider: u.provider || "local",
  emailVerified: typeof u.emailVerified === "boolean" ? u.emailVerified : false,
});

// POST /api/auth/register 
exports.register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "Thiếu name, email hoặc password" });
    }

    const emailNorm = normalizeEmail(email);
    const existed = await User.findOne({ email: emailNorm });

    if (existed) {
      // Nếu tài khoản tồn tại do Google trước đó → hướng dẫn đăng nhập bằng Google
      if (existed.provider === "google") {
        return res.status(409).json({
          message:
            "Email đã được sử dụng cho đăng nhập Google. Vui lòng dùng Đăng nhập với Google.",
        });
      }
      return res.status(409).json({ message: "Email đã được sử dụng" });
    }

    const hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email: emailNorm,
      password: hash,
      role: pickRole(role),
      provider: "local",
      lastLoginAt: new Date(),
    });

    const token = signAndSetCookie(res, { id: user._id, role: user.role });

    return res.status(201).json({
      message: "Đăng ký thành công",
      token,
      user: userToSafe(user),
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Email đã được sử dụng" });
    }
    console.error(err);
    return res.status(500).json({ message: "Lỗi server" });
  }
};

// POST /api/auth/login 
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log("Login attempt:", email);
    if (!email || !password)
      return res
        .status(400)
        .json({ message: "Vui lòng nhập đầy đủ thông tin" });

    const emailNorm = normalizeEmail(email);

    const user = await User.findOne({ email: emailNorm }).select("+password");
    if (!user)
      return res.status(401).json({ message: "Sai email hoặc mật khẩu" });

    if (user.isActive === false) {
      return res.status(403).json({ message: "Tài khoản đã bị vô hiệu hóa" });
    }

    if (user.provider === "google" && !user.password) {
      return res.status(400).json({
        message:
          "Tài khoản này đăng ký bằng Google. Vui lòng dùng Đăng nhập với Google.",
      });
    }

    const ok = await bcrypt.compare(password, user.password || "");
    if (!ok)
      return res.status(401).json({ message: "Sai email hoặc mật khẩu" });

    await User.updateOne(
      { _id: user._id },
      { $set: { lastLoginAt: new Date(), isOnline: true, lastActive: new Date() } }
    );

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // ✅ Đặt cookie token (đoạn bạn hỏi)
    res.cookie("token", token, {
      httpOnly: true,
      sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // ✅ Trả về user để FE lưu vào context
    res.json({
      message: "Đăng nhập thành công",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Lỗi server" });
  }
};

// POST /api/auth/google 
exports.loginWithGoogle = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: "Thiếu idToken" });

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const googleId = payload.sub;
    const email = normalizeEmail(payload.email);
    const name = payload.name || email.split("@")[0];
    const avatar = payload.picture;
    const emailVerified = !!payload.email_verified;

    if (!email)
      return res
        .status(400)
        .json({ message: "Không lấy được email từ Google" });

    // 2) Tìm theo googleId, nếu không có thì ràng buộc theo email
    let user =
      (await User.findOne({ googleId })) || (await User.findOne({ email }));

    if (!user) {
      // 3) Chưa có user → tạo mới (password không bắt buộc cho social)
      user = await User.create({
        name,
        email,
        role: "student",
        avatar,
        googleId,
        provider: "google",
        emailVerified,
        lastLoginAt: new Date(),
      });
    } else {
      // 4) Đã có user → cập nhật liên kết/thông tin cần thiết
      const update = {
        lastLoginAt: new Date(),
        isOnline: true,
        lastActive: new Date(),
      };
      if (!user.googleId) update.googleId = googleId;
      if (!user.provider || user.provider === "local")
        update.provider = "google";
      if (avatar && !user.avatar) update.avatar = avatar;
      if (emailVerified && !user.emailVerified) update.emailVerified = true;

      await User.updateOne({ _id: user._id }, update);
    }

    if (user.isActive === false) {
      return res.status(403).json({ message: "Tài khoản đã bị vô hiệu hóa" });
    }

    const token = signAndSetCookie(res, { id: user._id, role: user.role });

    return res.json({
      message: "Đăng nhập Google thành công",
      token,
      user: userToSafe(user, { avatar }),
    });
  } catch (err) {
    console.error("Google login error:", err);
    return res.status(401).json({ message: "Xác thực Google thất bại" });
  }
};

// GET /api/auth/me
exports.me = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;

    if (!userId) {
      return res
        .status(401)
        .json({ message: "Chưa đăng nhập hoặc token không hợp lệ" });
    }
    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }
    return res.json({
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role, // ⚠️ FE cần field này để điều hướng admin
        avatar: user.avatar || null,
      },
    });
  } catch (err) {
    console.error("Lỗi /me:", err);
    return res.status(500).json({ message: "Lỗi server" });
  }
};

// POST /api/auth/logout
exports.logout = async (req, res) => {
  try {
    // Đánh dấu user offline khi logout
    if (req.user?._id) {
      await User.updateOne(
        { _id: req.user._id },
        { isOnline: false }
      );
    }
  } catch (err) {
    console.error("Error updating online status on logout:", err);
  }
  
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
  });
  return res.json({ message: "Đã đăng xuất" });
};
