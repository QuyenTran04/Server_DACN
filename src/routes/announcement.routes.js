const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const announcementCtrl = require("../controllers/announcement.controller");

// Public routes
router.get("/active", announcementCtrl.getActiveAnnouncements);
router.get("/:id", announcementCtrl.getAnnouncement);

// Admin routes
router.use(requireAuth, requireRole("admin"));
router.get("/", announcementCtrl.listAnnouncements);
router.post("/", announcementCtrl.createAnnouncement);
router.put("/:id", announcementCtrl.updateAnnouncement);
router.delete("/:id", announcementCtrl.deleteAnnouncement);
router.patch("/:id/toggle", announcementCtrl.toggleAnnouncementStatus);

module.exports = router;
