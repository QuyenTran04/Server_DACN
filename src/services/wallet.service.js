const Wallet = require("../models/Wallet");
const WalletTransaction = require("../models/WalletTransaction");

const CURRENCY = process.env.WALLET_CURRENCY || "xu";
const COIN_RATE = Math.max(0, Number(process.env.MOMO_COIN_RATE || 1)); // coins per VND

const rawPricing = {
  aiCourse: process.env.AI_PRICE_COURSE,
  aiQuiz: process.env.AI_PRICE_QUIZ,
  aiPractice: process.env.AI_PRICE_PRACTICE,
};

const defaultPricing = {
  aiCourse: 5000,
  aiQuiz: 300,
  aiPractice: 200,
};

function normalizeAmount(val, fallback) {
  const num = Number(val);
  if (Number.isFinite(num) && num > 0) return Math.ceil(num);
  return fallback || 0;
}

function getPricing() {
  return {
    aiCourse: normalizeAmount(rawPricing.aiCourse, defaultPricing.aiCourse),
    aiQuiz: normalizeAmount(rawPricing.aiQuiz, defaultPricing.aiQuiz),
    aiPractice: normalizeAmount(rawPricing.aiPractice, defaultPricing.aiPractice),
  };
}

async function ensureWallet(userId) {
  if (!userId) throw new Error("USER_REQUIRED");
  let wallet = await Wallet.findOne({ user: userId });
  if (!wallet) {
    wallet = await Wallet.create({ user: userId, balance: 0, currency: CURRENCY });
  }
  return wallet;
}

async function credit(userId, amount, reason = "credit", metadata = {}) {
  const value = normalizeAmount(amount);
  if (value <= 0) throw new Error("INVALID_CREDIT_AMOUNT");

  const wallet = await ensureWallet(userId);
  const updated = await Wallet.findByIdAndUpdate(
    wallet._id,
    { $inc: { balance: value } },
    { new: true }
  );

  const tx = await WalletTransaction.create({
    wallet: updated._id,
    user: userId,
    type: "credit",
    amount: value,
    balanceAfter: updated.balance,
    reason,
    metadata,
  });

  return { wallet: updated, transaction: tx };
}

async function debit(userId, amount, reason = "debit", metadata = {}) {
  const value = normalizeAmount(amount);
  if (value <= 0) throw new Error("INVALID_DEBIT_AMOUNT");

  const wallet = await ensureWallet(userId);
  const updated = await Wallet.findOneAndUpdate(
    { _id: wallet._id, balance: { $gte: value } },
    { $inc: { balance: -value } },
    { new: true }
  );

  if (!updated) {
    const latest = await Wallet.findById(wallet._id);
    const err = new Error("INSUFFICIENT_BALANCE");
    err.code = "INSUFFICIENT_BALANCE";
    err.balance = latest?.balance ?? wallet.balance ?? 0;
    err.required = value;
    throw err;
  }

  const tx = await WalletTransaction.create({
    wallet: updated._id,
    user: userId,
    type: "debit",
    amount: value,
    balanceAfter: updated.balance,
    reason,
    metadata,
  });

  return { wallet: updated, transaction: tx };
}

async function chargeForAction(userId, actionKey, metadata = {}) {
  const pricing = getPricing();
  const amount = pricing[actionKey] || 0;
  if (amount <= 0) return { skipped: true, wallet: await ensureWallet(userId) };
  return debit(userId, amount, `charge_${actionKey}`, { actionKey, ...metadata });
}

async function refundCharge(userId, chargeResult, reason = "refund", metadata = {}) {
  if (!chargeResult || chargeResult.skipped) return null;
  const amount = chargeResult?.transaction?.amount;
  if (!amount || amount <= 0) return null;
  return credit(userId, amount, reason, {
    refundOf: chargeResult?.transaction?._id,
    ...metadata,
  });
}

async function getWalletWithTransactions(userId, limit = 10) {
  const wallet = await ensureWallet(userId);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 10));
  const transactions = await WalletTransaction.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(safeLimit);
  return { wallet, transactions };
}

function coinsFromVnd(vndAmount) {
  const amount = Math.max(0, Number(vndAmount) || 0);
  return Math.floor(amount * COIN_RATE);
}

function getCoinRate() {
  return COIN_RATE;
}

module.exports = {
  ensureWallet,
  credit,
  debit,
  chargeForAction,
  refundCharge,
  getPricing,
  getWalletWithTransactions,
  coinsFromVnd,
  getCoinRate,
  currency: CURRENCY,
};
