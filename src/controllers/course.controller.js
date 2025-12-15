const Course = require("../models/Course");
const Category = require("../models/Category");
const cloudinary = require("../configs/cloudinary");

const bufferToDataURI = (buffer, mimetype) =>
  `data:${mimetype};base64,${buffer.toString("base64")}`;


function buildFilterQuery(qs) {
  const filter = {};
  if (qs.q) {
    const regex = new RegExp(qs.q.trim(), "i");
    filter.$or = [{ title: regex }, { description: regex }];
  }
  if (qs.category) filter.category = qs.category;
  if (qs.instructor) filter.instructor = qs.instructor;
  if (qs.published === "true") filter.published = true;
  if (qs.published === "false") filter.published = false;

  if (qs.minPrice || qs.maxPrice) {
    filter.price = {};
    if (qs.minPrice) filter.price.$gte = Number(qs.minPrice);
    if (qs.maxPrice) filter.price.$lte = Number(qs.maxPrice);
  }
  return filter;
}


function parseSort(sortStr) {
  if (!sortStr) return { createdAt: -1 };
  return sortStr.split(",").reduce((acc, key) => {
    key = key.trim();
    if (!key) return acc;
    if (key.startsWith("-")) acc[key.slice(1)] = -1;
    else acc[key] = 1;
    return acc;
  }, {});
}


exports.createCourse = async (req, res) => {
  try {
    const instructor = req.user?.id || req.user?._id;
    if (!instructor) {
      return res.status(401).json({ message: "Chưa đăng nhập" });
    }
    const { title, description, category, published, price } = req.body;

    console.log("Dữ liệu:", { title, description, category, published, price, file: req.file ? true : false });
    if (!title || !description || !category) {
      return res
        .status(400)
        .json({ message: "Thiếu title, description hoặc category" });
    }

    let imageUrl;
    if (req.file) {
      const dataURI = bufferToDataURI(req.file.buffer, req.file.mimetype);
      const uploaded = await cloudinary.uploader.upload(dataURI, {
        folder: "lms/courses/images",
        resource_type: "image",
      });
      imageUrl = uploaded.secure_url;
    }

    const course = await Course.create({
      title,
      description,
      category,
      instructor,
      published,
      price, 
      imageUrl,
    });

    return res.status(201).json(course);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Tạo khóa học thất bại" });
  }
};



exports.getCourses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 12,
      select, 
      sort, 
    } = req.query;

    const filter = buildFilterQuery(req.query);
    // Chỉ hiển thị khóa học published hoặc của instructor hiện tại
    const userId = req.user?.id || req.user?._id;
    if (userId) {
      filter.$or = [
        { published: true },
        { instructor: userId }
      ];
    } else {
      filter.published = true;
    }

    const sortObj = parseSort(sort);
    const skip = (Number(page) - 1) * Number(limit);

    const [items, total] = await Promise.all([
      Course.find(filter)
        .select(select ? select.split(",").join(" ") : "")
        .sort(sortObj)
        .skip(skip)
        .limit(Number(limit))
        .populate("category", "name")
        .populate("instructor", "name email avatar role")
        .lean(),
      Course.countDocuments(filter),
    ]);

    return res.json({
      page: Number(page),
      limit: Number(limit),
      total,
      items,
    });
  } catch (err) {
    console.error("getCourses error:", err);
    return res.status(500).json({ message: "Lấy khóa học thất bại" });
  }
};

// Lấy khóa học do user tạo (đang đăng nhập)
// Tất cả user (không phân biệt role) chỉ thấy khóa học mình tạo
exports.getMyCourses = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Chưa đăng nhập" });
    }

    const courses = await Course.find({ instructor: userId })
      .sort({ createdAt: -1 })
      .populate("category", "name")
      .populate("instructor", "name email avatar role")
      .lean();

    // Lấy số lượng học viên cho mỗi khóa học
    const Enrollment = require("../models/Enrollment");
    const coursesWithEnrollment = await Promise.all(
      courses.map(async (course) => {
        const enrolledCount = await Enrollment.countDocuments({ course: course._id });
        return {
          ...course,
          enrolledStudents: enrolledCount,
          rating: course.avgRating ? (course.avgRating / 2).toFixed(1) : 0 // Convert 10-point to 5-point scale
        };
      })
    );

    return res.json({ total: coursesWithEnrollment.length, items: coursesWithEnrollment });
  } catch (err) {
    console.error("getMyCourses error:", err);
    return res
      .status(500)
      .json({ message: "Lỗi server khi lấy khóa học của bạn" });
  }
};

exports.getCoursesByInstructor = async (req, res) => {
  try {
    const { instructorId } = req.params;
    const courses = await Course.find({ instructor: instructorId })
      .sort({ createdAt: -1 }) 
      .populate("category", "name")
      .populate("instructor", "name email avatar role")
      .lean();

    if (!courses.length) {
      return res
        .status(404)
        .json({ message: "Người dùng chưa có khóa học nào" });
    }

    return res.json({ total: courses.length, items: courses });
  } catch (err) {
    console.error("getCoursesByInstructor error:", err);
    return res
      .status(500)
      .json({ message: "Lỗi server khi lấy khóa học theo instructor" });
  }
};

exports.getCourseById = async (req, res) => {
  try {
    const courseId = req.params.id;
    const user = req.user;
    if (!user) {
      return res.status(401).json({ message: "Chưa đăng nhập" });
    }
    const courses = await Course.findById(courseId);
    return res.json(courses);
  } catch (err) {
    console.error("getCourseById error:", err);
    return res
      .status(500)
      .json({ message: "Lỗi server khi lấy khóa học của bạn" });
  }
};

exports.updateCourse = async (req, res) => {
  try {
    const { id } = req.params; 
    const { title, description, price, category, published } = req.body || {};

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ message: "Không tìm thấy khóa học" });
    }

    if (category) {
      const cat = await Category.findById(category).lean();
      if (!cat) {
        return res.status(404).json({ message: "Category không tồn tại" });
      }
      course.category = category;
      course.categoryName = cat.name;
    }


    if (title) course.title = title.trim();
    if (description) course.description = description.trim();
    if (price !== undefined) course.price = Number(price);
    if (published !== undefined) course.published = Boolean(published);

    if (req.file?.buffer) {
      const dataURI = bufferToDataURI(req.file.buffer, req.file.mimetype);
      const uploaded = await cloudinary.uploader.upload(dataURI, {
        folder: "lms/courses/images",
        resource_type: "image",
      });
      if (course.imagePublicId) {
        await cloudinary.uploader.destroy(course.imagePublicId);
      }

      course.imageUrl = uploaded.secure_url;
      course.imagePublicId = uploaded.public_id;
    }
    await course.save();
    const updated = await Course.findById(course._id)
      .populate("category", "name")
      .populate("instructor", "name email avatar role")
      .lean();

    return res.json({
      message: "Cập nhật khóa học thành công",
      course: updated,
    });
  } catch (err) {
    console.error("updateCourse error:", err);
    return res.status(500).json({ message: "Cập nhật khóa học thất bại" });
  }
};

exports.publishCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const instructor = req.user?.id || req.user?._id;

    if (!instructor) {
      return res.status(401).json({ message: "Chưa đăng nhập" });
    }

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ message: "Khóa học không tồn tại" });
    }

    if (String(course.instructor) !== String(instructor) && req.user?.role !== "admin") {
      return res.status(403).json({ message: "Bạn không có quyền công khai khóa học này" });
    }

    if (course.published) {
      return res.status(400).json({ message: "Khóa học này đã được công khai rồi" });
    }

    // Check if course has minimum requirements
    if (!course.title || !course.description || !course.category) {
      return res.status(400).json({
        message: "Khóa học cần có tiêu đề, mô tả và danh mục trước khi công khai"
      });
    }

    course.published = true;
    course.publishedAt = new Date();
    await course.save();

    return res.json({
      message: "Khóa học đã được công khai thành công",
      course: course
    });
  } catch (err) {
    console.error("publishCourse error:", err);
    return res.status(500).json({ message: "Công khai khóa học thất bại" });
  }
};

exports.deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const instructor = req.user?.id || req.user?._id;

    if (!instructor) {
      return res.status(401).json({ message: "Chưa đăng nhập" });
    }

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({ message: "Khóa học không tồn tại" });
    }

    if (String(course.instructor) !== String(instructor) && req.user?.role !== "admin") {
      return res.status(403).json({ message: "Bạn không có quyền xóa khóa học này" });
    }

    const Lesson = require("../models/Lesson");
    const Quiz = require("../models/Quiz");
    const Document = require("../models/Document");

    await Lesson.deleteMany({ course: id });
    await Quiz.deleteMany({ course: id });
    await Document.deleteMany({ course: id });
    await Course.deleteOne({ _id: id });

    return res.json({ message: "Khóa học đã được xóa thành công" });
  } catch (err) {
    console.error("deleteCourse error:", err);
    return res.status(500).json({ message: "Xóa khóa học thất bại" });
  }
};
