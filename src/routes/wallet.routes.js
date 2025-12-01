const express = require("express");
const router = express.Router();

const walletCtrl = require("../controllers/wallet.controller");
const { requireAuth } = require("../middlewares/auth");
const { ensureWallet } = require("../middlewares/wallet.middleware");

// Webhook public
router.post("/momo/webhook", walletCtrl.handleMomoWebhook);

// Authenticated wallet actions
router.use(requireAuth, ensureWallet);
router.get("/me", walletCtrl.getMyWallet);
router.get("/transactions", walletCtrl.listTransactions);
router.post("/topup/momo", walletCtrl.createMomoTopUp);

module.exports = router;
