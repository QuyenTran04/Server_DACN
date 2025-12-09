const express = require("express");
const router = express.Router();
const { requireAuth, requireRole } = require("../middlewares/auth");
const certificateCtrl = require("../controllers/certificate.controller");

// Public verification
router.get("/verify/:code", certificateCtrl.verifyCertificate);

// Protected routes
router.use(requireAuth);
router.get("/student/:studentId", certificateCtrl.getStudentCertificates);
router.get("/:id", certificateCtrl.getCertificate);

// Admin routes
router.use(requireRole("admin"));
router.get("/", certificateCtrl.listCertificates);
router.post("/", certificateCtrl.issueCertificate);
router.put("/:id/revoke", certificateCtrl.revokeCertificate);
router.delete("/:id", certificateCtrl.deleteCertificate);

module.exports = router;
