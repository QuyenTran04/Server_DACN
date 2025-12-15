const Certificate = require("../models/Certificate");
const Course = require("../models/Course");
const User = require("../models/User");
const Enrollment = require("../models/Enrollment");
const crypto = require("crypto");

// Generate unique certificate number
const generateCertificateNumber = () => {
  const year = new Date().getFullYear();
  const random = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `CERT-${year}-${random}`;
};

// Generate verification code
const generateVerificationCode = () => {
  return crypto.randomBytes(16).toString("hex").toUpperCase();
};

// Issue certificate for completed course
exports.issueCertificate = async (req, res) => {
  try {
    const { studentId, courseId, score, grade } = req.body;

    // Check if certificate already exists
    const existing = await Certificate.findOne({
      student: studentId,
      course: courseId,
      isRevoked: false,
    });

    if (existing) {
      return res.status(400).json({
        message: "Chứng chỉ đã được cấp cho học viên này",
      });
    }

    // Verify enrollment completion
    const enrollment = await Enrollment.findOne({
      student: studentId,
      course: courseId,
      status: "completed",
    });

    if (!enrollment) {
      return res.status(400).json({
        message: "Học viên chưa hoàn thành khóa học",
      });
    }

    const certificate = await Certificate.create({
      student: studentId,
      course: courseId,
      certificateNumber: generateCertificateNumber(),
      verificationCode: generateVerificationCode(),
      completionDate: enrollment.updatedAt || new Date(),
      score: score || enrollment.progress,
      grade: grade || "Pass",
    });

    const populated = await Certificate.findById(certificate._id)
      .populate("student", "name email avatar")
      .populate("course", "title");

    res.status(201).json(populated);
  } catch (err) {
    console.error("issueCertificate:", err);
    res.status(500).json({ message: "Lỗi khi cấp chứng chỉ" });
  }
};

// List all certificates (admin)
exports.listCertificates = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    const q = (req.query.q || "").trim();

    const filter = {};
    if (q) {
      filter.$or = [
        { certificateNumber: { $regex: q, $options: "i" } },
        { verificationCode: { $regex: q, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      Certificate.find(filter)
        .populate("student", "name email avatar")
        .populate("course", "title")
        .sort("-createdAt")
        .skip(skip)
        .limit(limit),
      Certificate.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      pages: Math.ceil(total / limit),
      page,
    });
  } catch (err) {
    console.error("listCertificates:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// Get certificate by ID
exports.getCertificate = async (req, res) => {
  try {
    const certificate = await Certificate.findById(req.params.id)
      .populate("student", "name email avatar")
      .populate("course", "title description instructor");

    if (!certificate) {
      return res.status(404).json({ message: "Không tìm thấy chứng chỉ" });
    }

    res.json(certificate);
  } catch (err) {
    console.error("getCertificate:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// Verify certificate
exports.verifyCertificate = async (req, res) => {
  try {
    const { code } = req.params;

    const certificate = await Certificate.findOne({
      $or: [{ certificateNumber: code }, { verificationCode: code }],
    })
      .populate("student", "name email")
      .populate("course", "title");

    if (!certificate) {
      return res.status(404).json({
        valid: false,
        message: "Chứng chỉ không tồn tại",
      });
    }

    if (certificate.isRevoked) {
      return res.json({
        valid: false,
        message: "Chứng chỉ đã bị thu hồi",
        reason: certificate.revokedReason,
        revokedAt: certificate.revokedAt,
      });
    }

    res.json({
      valid: true,
      certificate: {
        number: certificate.certificateNumber,
        studentName: certificate.student.name,
        courseName: certificate.course.title,
        issueDate: certificate.issueDate,
        completionDate: certificate.completionDate,
        grade: certificate.grade,
      },
    });
  } catch (err) {
    console.error("verifyCertificate:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// Revoke certificate
exports.revokeCertificate = async (req, res) => {
  try {
    const { reason } = req.body;

    const certificate = await Certificate.findByIdAndUpdate(
      req.params.id,
      {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: reason || "Không có lý do",
      },
      { new: true }
    );

    if (!certificate) {
      return res.status(404).json({ message: "Không tìm thấy chứng chỉ" });
    }

    res.json(certificate);
  } catch (err) {
    console.error("revokeCertificate:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// Get student certificates
exports.getStudentCertificates = async (req, res) => {
  try {
    const certificates = await Certificate.find({
      student: req.params.studentId,
      isRevoked: false,
    })
      .populate("course", "title imageUrl")
      .sort("-issueDate");

    res.json({ items: certificates });
  } catch (err) {
    console.error("getStudentCertificates:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// Delete certificate
exports.deleteCertificate = async (req, res) => {
  try {
    const deleted = await Certificate.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Không tìm thấy chứng chỉ" });
    }
    res.json({ message: "Đã xóa chứng chỉ" });
  } catch (err) {
    console.error("deleteCertificate:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};
