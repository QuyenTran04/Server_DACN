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

// Gán giảng viên
exports.assignInstructor = async (req, res) => {
  try {
    const { instructorId } = req.body;
    const inst = await User.findOne({ _id: instructorId, role: "instructor" });
    if (!inst)
      return res.status(400).json({ message: "Giảng viên không hợp lệ" });
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
   2) QUẢN LÝ GIẢNG VIÊN
========================= */
exports.listInstructors = async (req, res) => {
  try {
    const { skip, limit, sort, q } = buildListQuery(req);
    const filter = { role: "instructor" };
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

exports.createInstructor = async (req, res) => {
  try {
    const user = await User.create({ ...req.body, role: "instructor" });
    res.status(201).json(user);
  } catch (err) {
    res.status(500).json({ message: "Tạo giảng viên thất bại" });
  }
};

exports.updateInstructor = async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, role: "instructor" },
      req.body,
      { new: true }
    );
    if (!user)
      return res.status(404).json({ message: "Không tìm thấy giảng viên" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

exports.deleteInstructor = async (req, res) => {
  try {
    await User.deleteOne({ _id: req.params.id, role: "instructor" });
    res.json({ message: "Đã xóa giảng viên" });
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
    const [
      totalCourses,
      publishedCourses,
      totalUsers,
      instructors,
      students,
      activeEnrolls,
      monthRevenue,
    ] = await Promise.all([
      Course.countDocuments({}),
      Course.countDocuments({ published: true }),
      User.countDocuments({}),
      User.countDocuments({ role: "instructor" }),
      User.countDocuments({ role: "student" }),
      Enrollment.countDocuments({ status: "active" }),
      Order.aggregate([
        { $match: { status: "paid" } },
        {
          $match: {
            createdAt: {
              $gte: new Date(
                new Date().getFullYear(),
                new Date().getMonth(),
                1
              ),
            },
          },
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: "$amount" },
            orders: { $sum: 1 },
          },
        },
      ]),
    ]);

    res.json({
      courses: { total: totalCourses, published: publishedCourses },
      users: { total: totalUsers, instructors, students },
      enrollments: { active: activeEnrolls },
      revenueThisMonth: monthRevenue[0] || { revenue: 0, orders: 0 },
    });
  } catch (err) {
    res.status(500).json({ message: "Lỗi server" });
  }
};

/* =========================
   6) QUẢN LÝ HỆ THỐNG (ROLE)
========================= */
exports.updateUserRole = async (req, res) => {
  try {
    const { role } = req.body; // "student" | "instructor" | "admin"
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
