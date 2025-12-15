const WalletTopUp = require("../models/WalletTopUp");
const walletService = require("../services/wallet.service");
const momoService = require("../services/momo.service");
const WalletTransaction = require("../models/WalletTransaction");

exports.getMyWallet = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const { wallet, transactions } = await walletService.getWalletWithTransactions(
      userId,
      req.query.limit
    );

    return res.json({
      wallet,
      transactions,
      pricing: walletService.getPricing(),
      coinRate: walletService.getCoinRate(),
    });
  } catch (err) {
    console.error("[wallet.getMyWallet] Error:", err);
    return res.status(500).json({ message: "Khong lay duoc vi", detail: err.message });
  }
};

exports.listTransactions = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    const transactions = await WalletTransaction.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limit);
    return res.json({ items: transactions, count: transactions.length });
  } catch (err) {
    console.error("[wallet.listTransactions] Error:", err);
    return res.status(500).json({ message: "Khong lay duoc lich su giao dich" });
  }
};

exports.createMomoTopUp = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    const rawAmount = Number(req.body.amount);
    const amount = Math.max(0, Math.floor(rawAmount || 0));
    if (!amount || amount < 1000) {
      return res.status(400).json({ message: "So tien toi thieu la 10.000 VND" });
    }

    const coins = walletService.coinsFromVnd(amount);
    const orderId = `WALLET_${userId}_${Date.now()}`;
    const requestId = `${orderId}_${Math.floor(Math.random() * 10000)}`;
    const extraData = Buffer.from(JSON.stringify({ userId })).toString("base64");

    const topUp = await WalletTopUp.create({
      user: userId,
      amount,
      coins,
      provider: "momo",
      orderId,
      requestId,
      status: "pending",
    });

    const momoRes = await momoService.createPayment({
      amount,
      orderId,
      requestId,
      orderInfo: `Nap ${coins} xu`,
      extraData,
    });

    topUp.payUrl = momoRes.payUrl || momoRes.shortLink || momoRes.deeplink;
    topUp.deeplink = momoRes.deeplink || momoRes.payUrl || momoRes.shortLink;
    topUp.resultCode = momoRes.resultCode;
    topUp.message = momoRes.message;
    await topUp.save();

    if (momoRes.resultCode !== 0) {
      return res.status(502).json({
        message: momoRes.message || "MoMo tam thoi khong phan hoi",
        momo: momoRes,
      });
    }

    return res.json({
      payUrl: momoRes.payUrl || momoRes.shortLink,
      deeplink: momoRes.deeplink || momoRes.payUrl,
      qrCodeUrl: momoRes.qrCodeUrl,
      orderId,
      requestId,
      coins,
      amount,
      conversionRate: walletService.getCoinRate(),
      topUpId: topUp._id,
    });
  } catch (err) {
    console.error("[wallet.createMomoTopUp] Error:", err);
    return res.status(500).json({ message: "Khong khoi tao duoc thanh toan MoMo", detail: err.message });
  }
};

exports.handleMomoWebhook = async (req, res) => {
  try {
    const payload = req.body || {};
    console.log("[wallet.handleMomoWebhook] Received webhook:", {
      orderId: payload.orderId,
      resultCode: payload.resultCode,
      amount: payload.amount,
      extraData: payload.extraData
    });

    const verify = momoService.verifyWebhookSignature(payload);
    if (!verify.valid) {
      console.warn("[wallet.handleMomoWebhook] Invalid signature", verify);
      return res.status(400).json({ message: "Invalid signature" });
    }

    const { orderId, requestId, resultCode, transId, amount } = payload;
    let topUp = await WalletTopUp.findOne({ orderId });

    if (!topUp) {
      console.log("[wallet.handleMomoWebhook] TopUp not found, creating new one");
      const extra = momoService.decodeExtraData(payload.extraData);
      console.log("[wallet.handleMomoWebhook] Decoded extraData:", extra);

      topUp = await WalletTopUp.create({
        user: extra?.userId,
        amount: Number(amount) || 0,
        coins: walletService.coinsFromVnd(amount),
        provider: "momo",
        orderId,
        requestId,
        status: "pending",
        rawPayload: payload,
      });

      console.log("[wallet.handleMomoWebhook] Created new TopUp:", {
        id: topUp._id,
        user: topUp.user,
        coins: topUp.coins
      });
    }

    if (topUp.status === "paid") {
      console.log("[wallet.handleMomoWebhook] Already processed, skipping");
      return res.json({ message: "Already processed" });
    }

    topUp.resultCode = resultCode;
    topUp.transId = transId;
    topUp.rawPayload = payload;
    topUp.message = payload.message;

    let creditResult = null;

    if (Number(resultCode) === 0) {
      console.log("[wallet.handleMomoWebhook] Payment successful, processing credit");
      topUp.status = "paid";
      await topUp.save();

      if (!topUp.user) {
        console.error("[wallet.handleMomoWebhook] No user found in TopUp record");
        return res.status(400).json({ message: "User not found" });
      }

      if (topUp.coins <= 0) {
        console.error("[wallet.handleMomoWebhook] Invalid coins amount:", topUp.coins);
        return res.status(400).json({ message: "Invalid coins amount" });
      }

      console.log("[wallet.handleMomoWebhook] Crediting coins:", {
        user: topUp.user,
        coins: topUp.coins,
        orderId
      });

      creditResult = await walletService.credit(topUp.user, topUp.coins, "topup_momo", {
        topUpId: topUp._id,
        orderId,
        transId,
      });

      console.log("[wallet.handleMomoWebhook] Credit successful:", creditResult);
    } else {
      console.log("[wallet.handleMomoWebhook] Payment failed:", resultCode);
      topUp.status = "failed";
      await topUp.save();
    }

    const response = { message: "ok", status: topUp.status };

    // Include wallet information if payment was successful
    if (Number(resultCode) === 0 && creditResult) {
      response.wallet = creditResult.wallet;
      response.transaction = creditResult.transaction;
      response.newBalance = creditResult.wallet.balance;
    }

    return res.json(response);
  } catch (err) {
    console.error("[wallet.handleMomoWebhook] Error:", err);
    return res.status(500).json({ message: "Webhook xu ly loi", detail: err.message });
  }
};
