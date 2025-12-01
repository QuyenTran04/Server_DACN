const walletService = require("../services/wallet.service");

exports.ensureWallet = async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) return res.status(401).json({ message: "Chua dang nhap" });
    req.wallet = await walletService.ensureWallet(userId);
    next();
  } catch (err) {
    next(err);
  }
};

exports.chargeAction = (actionKey) => async (req, res, next) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) return res.status(401).json({ message: "Chua dang nhap" });
    const charge = await walletService.chargeForAction(userId, actionKey, {
      path: req.originalUrl,
      method: req.method,
    });
    req.walletCharge = charge;
    next();
  } catch (err) {
    if (err.code === "INSUFFICIENT_BALANCE") {
      return res.status(402).json({
        message: "Khong du xu, vui long nap them.",
        balance: err.balance ?? 0,
        required: err.required,
        pricing: walletService.getPricing(),
        currency: walletService.currency,
      });
    }
    next(err);
  }
};
