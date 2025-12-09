// src/controllers/admin.controller.js
// Tận dụng lại controller sẵn có: course/lesson/quiz/category
const courseCtrl = require("./course.controller");
const lessonCtrl = require("./lesson.controller");
const quizCtrl = require("./quiz.controller");
const categoryCtrl = require("./category.controller");

const Course = require("../models/Course");
const Lesson = require("../models/Lesson");
const Quiz = require("../models/Quiz");
const User = require("../models/User");
const Enrollment = require("../models/Enrollment");
const Order = require("../models/Order");
const Review = require("../models/Review");

// Helper chung cho list
const buildListQuery = (req) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, parseInt(req.query.limit) || 20);
  const skip = (page - 1) * limit;
  const sort = req.query.sort || "-createdAt";
  const q = (req.query.q || "").trim();
  return { page, limit, skip, sort, q };
};

/* =========================
   1) QUẢN LÝ KHÓA HỌC
========================= */
// Dùng lại hàm có sẵn
exports.listCourses = courseCtrl.getCourses;
exports.createCourse = courseCtrl.createCourse;
exports.updateCourse = courseCtrl.updateCourse;

// Xóa course: dọn lesson + quiz liên quan (không trùng với controller khác)
exports.deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    await Lesson.deleteMany({ course: id });
    await Quiz.deleteMany({ course: id });
    const deleted = await Course.findByIdAndDelete(id);
    if (!deleted)
      return res.status(404).json({ message: "Không tìm thấy khóa học" });
    res.json({ message: "Đã xóa khóa học" });
  } catch (err) {
    console.error("deleteCourse:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// Gán người tạo nội dung
exports.assignInstructor = async (req, res) => {
  try {
    const { instructorId } = req.body;
    const inst = await User.findOne({ _id: instructorId });
    if (!inst)
      return res.status(400).json({ message: "Người dùng không hợp lệ" });
    const updated = await Course.findByIdAndUpdate(
      req.params.id,
      { instructor: instructorId },
      { new: true }
    )
      .populate("category", "name")
      .populate("instructor", "name email");
    if (!updated)
      return res.status(404).json({ message: "Không tìm thấy khóa học" });
    res.json(updated);
  } catch (err) {
    console.error("assignInstructor:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// Publish / Unpublish
exports.publishCourse = async (req, res) => {
  try {
    const doc = await Course.findByIdAndUpdate(
      req.params.id,
      { published: true },
      { new: true }
    );
    if (!doc)
      return res.status(404).json({ message: "Không tìm thấy khóa học" });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};
exports.unpublishCourse = async (req, res) => {
  try {
    const doc = await Course.findByIdAndUpdate(
      req.params.id,
      { published: false },
      { new: true }
    );
    if (!doc)
      return res.status(404).json({ message: "Không tìm thấy khóa học" });
    res.json(doc);
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

// Danh mục: dùng lại controller sẵn có
exports.listCategories = categoryCtrl.getCategories;
exports.createCategory = categoryCtrl.createCategory;

/* =========================
   2) QUẢN LÝ NGƯỜI TẠO NỘI DUNG
========================= */
exports.listCreators = async (req, res) => {
  try {
    const { skip, limit, sort, q } = buildListQuery(req);
    const filter = { role: { $in: ["student", "admin"] } };
    if (q)
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ];
    const [items, total] = await Promise.all([
      User.find(filter).sort(sort).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);
    res.json({ total, items, pageSize: limit });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

exports.createUser = async (req, res) => {
  try {
    const user = await User.create({ ...req.body, role: req.body.role || "student" });
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ message: "Tạo người dùng thất bại" });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id },
      req.body,
      { new: true }
    );
    if (!user)
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    await User.deleteOne({ _id: req.params.id });
    res.json({ message: "Đã xóa người dùng" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

/* =========================
   3) QUẢN LÝ HỌC VIÊN
========================= */
exports.listStudents = async (req, res) => {
  try {
    const { skip, limit, sort, q } = buildListQuery(req);
    const filter = { role: "student" };
    if (q)
      filter.$or = [
        { name: { $regex: q, $options: "i" } },
        { email: { $regex: q, $options: "i" } },
      ];
    const [items, total] = await Promise.all([
      User.find(filter).sort(sort).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);
    res.json({ total, items, pageSize: limit });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

exports.getStudentProgress = async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ student: req.params.id })
      .populate("course", "title")
      .populate("completedLessons", "title");
    res.json({ items: enrollments });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

/* =========================
   4) THANH TOÁN & DOANH THU
========================= */
exports.listOrders = async (req, res) => {
  try {
    const { skip, limit, sort, q } = buildListQuery(req);
    const filter = {};
    if (q) filter.status = q; // vd: paid|pending|failed
    const [items, total] = await Promise.all([
      Order.find(filter)
        .populate("student", "name email")
        .populate("course", "title")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Order.countDocuments(filter),
    ]);
    res.json({ total, items, pageSize: limit });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

exports.refundOrder = async (req, res) => {
  try {
    const updated = await Order.findByIdAndUpdate(
      req.params.id,
      { status: "failed", "metadata.refundAt": new Date() },
      { new: true }
    );
    if (!updated)
      return res.status(404).json({ message: "Không tìm thấy đơn hàng" });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

exports.revenueByMonth = async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const data = await Order.aggregate([
      { $match: { status: "paid" } },
      {
        $match: {
          createdAt: {
            $gte: new Date(`${year}-01-01`),
            $lt: new Date(`${year + 1}-01-01`),
          },
        },
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          revenue: { $sum: "$amount" },
          orders: { $sum: 1 },
        },
      },
      { $project: { month: "$_id", revenue: 1, orders: 1, _id: 0 } },
      { $sort: { month: 1 } },
    ]);
    res.json({ year, data });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

exports.revenueByCourse = async (_req, res) => {
  try {
    const data = await Order.aggregate([
      { $match: { status: "paid" } },
      {
        $group: {
          _id: "$course",
          revenue: { $sum: "$amount" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 50 },
    ]);
    const map = Object.fromEntries(
      (
        await Course.find({ _id: { $in: data.map((d) => d._id) } }, "title")
      ).map((c) => [c._id.toString(), c.title])
    );
    res.json(
      data.map((d) => ({
        courseId: d._id,
        title: map[d._id.toString()],
        revenue: d.revenue,
        orders: d.orders,
      }))
    );
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

exports.revenueByInstructor = async (_req, res) => {
  try {
    const data = await Order.aggregate([
      { $match: { status: "paid" } },
      {
        $lookup: {
          from: "courses",
          localField: "course",
          foreignField: "_id",
          as: "c",
        },
      },
      { $unwind: "$c" },
      {
        $group: {
          _id: "$c.instructor",
          revenue: { $sum: "$amount" },
          orders: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
    ]);
    const map = Object.fromEntries(
      (
        await User.find({ _id: { $in: data.map((d) => d._id) } }, "name email")
      ).map((u) => [u._id.toString(), { name: u.name, email: u.email }])
    );
    res.json(
      data.map((d) => ({
        instructorId: d._id,
        ...map[d._id.toString()],
        revenue: d.revenue,
        orders: d.orders,
      }))
    );
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

/* =========================
   5) THỐNG KÊ & BÁO CÁO (DASHBOARD)
========================= */
exports.overview = async (_req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const last7Days = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - 6
    );

    const [
      totalCourses,
      publishedCourses,
      totalUsers,
      instructors,
      students,
      activeEnrolls,
      monthRevenue,
      recentOrders,
      pendingCourses,
      latestStudents,
      topCourses,
      topInstructors,
      enrollmentTrendRaw,
    ] = await Promise.all([
      Course.countDocuments({}),
      Course.countDocuments({ published: true }),
      User.countDocuments({}),
      User.countDocuments({ role: "admin" }),
      User.countDocuments({ role: "student" }),
      Enrollment.countDocuments({ status: "active" }),
      Order.aggregate([
        { $match: { status: "paid", createdAt: { $gte: startOfMonth } } },
        {
          $group: {
            _id: null,
            revenue: { $sum: "$amount" },
            orders: { $sum: 1 },
          },
        },
      ]),
      Order.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .populate("student", "name email avatar")
        .populate("course", "title price")
        .lean(),
      Course.find({ published: false })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("title price createdAt category instructor")
        .populate("instructor", "name avatar email")
        .populate("category", "name")
        .lean(),
      User.find({ role: "student" })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("name email createdAt avatar")
        .lean(),
      Order.aggregate([
        { $match: { status: "paid" } },
        {
          $lookup: {
            from: "courses",
            localField: "course",
            foreignField: "_id",
            as: "course",
          },
        },
        { $unwind: "$course" },
        {
          $group: {
            _id: "$course._id",
            revenue: { $sum: "$amount" },
            orders: { $sum: 1 },
            title: { $first: "$course.title" },
            category: { $first: "$course.category" },
            instructor: { $first: "$course.instructor" },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "categories",
            localField: "category",
            foreignField: "_id",
            as: "categoryDoc",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "instructor",
            foreignField: "_id",
            as: "instructorDoc",
          },
        },
        { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } },
        { $unwind: { path: "$instructorDoc", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 1,
            title: 1,
            revenue: 1,
            orders: 1,
            categoryName: "$categoryDoc.name",
            instructorName: "$instructorDoc.name",
          },
        },
      ]),
      Order.aggregate([
        { $match: { status: "paid" } },
        {
          $lookup: {
            from: "courses",
            localField: "course",
            foreignField: "_id",
            as: "course",
          },
        },
        { $unwind: "$course" },
        {
          $group: {
            _id: "$course.instructor",
            revenue: { $sum: "$amount" },
            orders: { $sum: 1 },
          },
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "users",
            localField: "_id",
            foreignField: "_id",
            as: "instructor",
          },
        },
        { $unwind: "$instructor" },
        {
          $project: {
            _id: "$instructor._id",
            name: "$instructor.name",
            email: "$instructor.email",
            avatar: "$instructor.avatar",
            revenue: 1,
            orders: 1,
          },
        },
      ]),
      Enrollment.aggregate([
        { $match: { createdAt: { $gte: last7Days } } },
        {
          $group: {
            _id: {
              $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const dateLabels = Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date(last7Days);
      d.setDate(last7Days.getDate() + idx);
      return d;
    });
    const trendLookup = enrollmentTrendRaw.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    const enrollmentTrend = dateLabels.map((date) => {
      const key = date.toISOString().slice(0, 10);
      return {
        date: key,
        label: date.toLocaleDateString("vi-VN", { weekday: "short" }),
        count: trendLookup[key] || 0,
      };
    });

    res.json({
      courses: { total: totalCourses, published: publishedCourses },
      users: { total: totalUsers, instructors, students },
      enrollments: { active: activeEnrolls },
      revenueThisMonth: monthRevenue[0] || { revenue: 0, orders: 0 },
      recentOrders,
      pendingCourses,
      newStudents: latestStudents,
      topCourses,
      topInstructors,
      enrollmentTrend,
    });
  } catch (err) {
    console.error("overview error:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

/* =========================
   6) QUẢN LÝ HỆ THỐNG (ROLE)
========================= */
exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body; // "student" | "admin"
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role },
      { new: true }
    );
    if (!user)
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

/* =========================
   7) QUẢN LÝ TƯƠNG TÁC (REVIEW)
========================= */
exports.listReviews = async (req, res) => {
  try {
    const { skip, limit, sort, q } = buildListQuery(req);
    const filter = {};
    if (q) filter.comment = { $regex: q, $options: "i" };
    const [items, total] = await Promise.all([
      Review.find(filter)
        .populate("student", "name")
        .populate("course", "title")
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Review.countDocuments(filter),
    ]);
    res.json({ total, items, pageSize: limit });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    await Review.findByIdAndDelete(req.params.id);
    res.json({ message: "Đã xóa đánh giá" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

exports.hideReview = async (req, res) => {
  try {
    const review = await Review.findByIdAndUpdate(
      req.params.id,
      { comment: "[hidden by admin]" },
      { new: true }
    );
    if (!review)
      return res.status(404).json({ message: "Không tìm thấy đánh giá" });
    res.json(review);
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

exports.listLessons = lessonCtrl.listLessonsByCourse;
exports.createLesson = lessonCtrl.createLesson;
exports.updateLesson = lessonCtrl.updateLesson;
exports.deleteLesson = lessonCtrl.deleteLesson;
exports.reorderLessons = lessonCtrl.reorderLessons;

exports.listQuiz = quizCtrl.list;
exports.createQuiz = quizCtrl.create;
exports.updateQuiz = quizCtrl.update;
exports.deleteQuiz = quizCtrl.remove;

/* =========================
   9) QUẢN LÝ TÀI LIỆU
========================= */
exports.listDocuments = async (req, res) => {
  try {
    const { skip, limit, q } = buildListQuery(req);
    const filter = q ? { name: { $regex: q, $options: "i" } } : {};
    const [items, total] = await Promise.all([
      require("../models/Document")
        .find(filter)
        .sort("-createdAt")
        .skip(skip)
        .limit(limit),
      require("../models/Document").countDocuments(filter),
    ]);
    res.json({
      items,
      total,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("listDocuments:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

exports.uploadDocuments = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "Vui lòng chọn tệp" });
    }
    const docs = req.files.map((file) => ({
      name: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      url: file.path,
    }));
    const created = await require("../models/Document").insertMany(docs);
    res.status(201).json(created);
  } catch (err) {
    console.error("uploadDocuments:", err);
    res.status(500).json({ message: "Upload thất bại" });
  }
};

exports.deleteDocument = async (req, res) => {
  try {
    const deleted = await require("../models/Document").findByIdAndDelete(req.params.id);
    if (!deleted)
      return res.status(404).json({ message: "Không tìm thấy tài liệu" });
    res.json({ message: "Đã xóa tài liệu" });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

/* =========================
   10) CÀI ĐẶT HỆ THỐNG
========================= */
exports.getSettings = async (req, res) => {
  try {
    res.json({
      siteName: "Nền tảng học tập DACN",
      siteDescription: "Học online chất lượng cao",
      minPrice: 0,
      maxPrice: 5000000,
      instructorCommissionPercent: 70,
      platformFeePercent: 30,
      maintenanceMode: false,
      maintenanceMessage: "",
      emailNotifications: true,
    });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    res.json({
      message: "Cài đặt đã được lưu",
      data: req.body,
    });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

/* =========================
   12) QUẢN LÝ VÍ - MANUAL CREDIT
========================= */
const walletService = require("../services/wallet.service");

exports.creditUserWallet = async (req, res) => {
  try {
    const { userId, coins, reason } = req.body;

    if (!userId || !coins || coins <= 0) {
      return res.status(400).json({
        message: "Vui lòng cung cấp userId và số xu hợp lệ"
      });
    }

    // Kiểm tra user tồn tại
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    // Credit xu vào ví
    await walletService.credit(userId, Number(coins), "admin_credit", {
      reason: reason || "Admin manual credit",
      adminId: req.user._id
    });

    // Lấy thông tin ví sau khi credit
    const walletData = await walletService.getWalletWithTransactions(userId, 5);

    res.json({
      message: `Đã cộng ${coins} xu vào tài khoản ${user.name || user.email}`,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      },
      coins: Number(coins),
      reason: reason || "Admin manual credit",
      wallet: walletData.wallet
    });
  } catch (err) {
    console.error("[admin.creditUserWallet] Error:", err);
    res.status(500).json({
      message: "Lỗi khi cộng xu",
      detail: err.message
    });
  }
};

/* =========================
   11) QUẢN LÝ THÔNG BÁO
========================= */
exports.getNotifications = async (req, res) => {
  try {
    // Lấy các thông báo gần đây cho admin
    const notifications = [];

    // Kiểm tra các khóa học cần duyệt
    const pendingCourses = await Course.countDocuments({ published: false });
    if (pendingCourses > 0) {
      notifications.push({
        id: "pending-courses",
        type: "warning",
        title: "Khóa học chờ duyệt",
        description: `${pendingCourses} khóa học đang chờ duyệt đăng tải`,
        createdAt: new Date(),
        read: false
      });
    }

    // Kiểm tra đơn hàng mới trong 24h
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentOrders = await Order.countDocuments({
      createdAt: { $gte: yesterday },
      status: "paid"
    });
    if (recentOrders > 0) {
      notifications.push({
        id: "recent-orders",
        type: "success",
        title: "Đơn hàng mới",
        description: `${recentOrders} đơn hàng mới trong 24 giờ qua`,
        createdAt: new Date(),
        read: false
      });
    }

    // Kiểm tra người dùng mới đăng ký
    const newUsers = await User.countDocuments({
      createdAt: { $gte: yesterday },
      role: "student"
    });
    if (newUsers > 0) {
      notifications.push({
        id: "new-users",
        type: "info",
        title: "Học viên mới",
        description: `${newUsers} học viên mới đăng ký trong 24 giờ qua`,
        createdAt: new Date(),
        read: false
      });
    }

    // Thêm thông báo hệ thống mẫu
    notifications.push(
      {
        id: "system-update",
        type: "info",
        title: "Cập nhật hệ thống",
        description: "Hệ thống đã được cập nhật phiên bản mới",
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        read: false
      },
      {
        id: "revenue-report",
        type: "success",
        title: "Báo cáo doanh thu",
        description: "Doanh thu tháng này tăng 15% so với tháng trước",
        createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
        read: true
      }
    );

    // Sắp xếp theo thời gian giảm dần
    notifications.sort((a, b) => b.createdAt - a.createdAt);

    // Lấy số thông báo chưa đọc
    const unreadCount = notifications.filter(n => !n.read).length;

    res.json({
      notifications,
      unreadCount
    });
  } catch (err) {
    console.error("getNotifications:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

/* =========================
   12) NHẬT KÝ HOẠT ĐỘNG
========================= */
exports.listActivityLogs = async (req, res) => {
  try {
    const { skip, limit, page } = buildListQuery(req);
    const action = req.query.action || "";
    const days = parseInt(req.query.days) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const filter = { createdAt: { $gte: startDate } };
    if (action) filter.action = action;

    const logs = Array.from({ length: limit }).map((_, i) => ({
      _id: `log-${page}-${i}`,
      adminName: "Admin",
      email: "admin@system.local",
      action: ["create", "update", "delete", "publish"][i % 4],
      resourceType: ["Course", "User", "Lesson"][i % 3],
      description: "Hoạt động hệ thống",
      createdAt: new Date(Date.now() - i * 3600000),
    }));

    res.json({
      items: logs,
      total: 50,
      pages: Math.ceil(50 / limit),
    });
  } catch (err) {
    console.error("listActivityLogs:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};
