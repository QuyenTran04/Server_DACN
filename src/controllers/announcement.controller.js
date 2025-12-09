const Announcement = require("../models/Announcement");

// Create announcement
exports.createAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.create({
      ...req.body,
      createdBy: req.user._id,
    });

    const populated = await Announcement.findById(announcement._id).populate(
      "createdBy",
      "name email"
    );

    res.status(201).json(populated);
  } catch (err) {
    console.error("createAnnouncement:", err);
    res.status(500).json({ message: "Lỗi khi tạo thông báo" });
  }
};

// List announcements (admin)
exports.listAnnouncements = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    const q = (req.query.q || "").trim();
    const type = req.query.type;
    const isActive = req.query.isActive;

    const filter = {};
    if (q) {
      filter.$or = [
        { title: { $regex: q, $options: "i" } },
        { content: { $regex: q, $options: "i" } },
      ];
    }
    if (type) filter.type = type;
    if (isActive !== undefined) filter.isActive = isActive === "true";

    const [items, total] = await Promise.all([
      Announcement.find(filter)
        .populate("createdBy", "name email")
        .sort("-createdAt")
        .skip(skip)
        .limit(limit),
      Announcement.countDocuments(filter),
    ]);

    res.json({
      items,
      total,
      pages: Math.ceil(total / limit),
      page,
    });
  } catch (err) {
    console.error("listAnnouncements:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// Get active announcements (public)
exports.getActiveAnnouncements = async (req, res) => {
  try {
    const now = new Date();
    const targetAudience = req.query.audience || "all";

    const filter = {
      isActive: true,
      startDate: { $lte: now },
      $or: [{ endDate: { $exists: false } }, { endDate: { $gte: now } }],
    };

    if (targetAudience !== "all") {
      filter.$or = [
        { targetAudience: "all" },
        { targetAudience: targetAudience },
      ];
    }

    const announcements = await Announcement.find(filter)
      .sort("-priority -createdAt")
      .limit(10);

    res.json({ items: announcements });
  } catch (err) {
    console.error("getActiveAnnouncements:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// Get announcement by ID
exports.getAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id).populate(
      "createdBy",
      "name email"
    );

    if (!announcement) {
      return res.status(404).json({ message: "Không tìm thấy thông báo" });
    }

    // Increment view count
    announcement.viewCount += 1;
    await announcement.save();

    res.json(announcement);
  } catch (err) {
    console.error("getAnnouncement:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// Update announcement
exports.updateAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    ).populate("createdBy", "name email");

    if (!announcement) {
      return res.status(404).json({ message: "Không tìm thấy thông báo" });
    }

    res.json(announcement);
  } catch (err) {
    console.error("updateAnnouncement:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// Delete announcement
exports.deleteAnnouncement = async (req, res) => {
  try {
    const deleted = await Announcement.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Không tìm thấy thông báo" });
    }
    res.json({ message: "Đã xóa thông báo" });
  } catch (err) {
    console.error("deleteAnnouncement:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};

// Toggle announcement status
exports.toggleAnnouncementStatus = async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    if (!announcement) {
      return res.status(404).json({ message: "Không tìm thấy thông báo" });
    }

    announcement.isActive = !announcement.isActive;
    await announcement.save();

    res.json(announcement);
  } catch (err) {
    console.error("toggleAnnouncementStatus:", err);
    res.status(500).json({ message: "Lỗi server" });
  }
};
