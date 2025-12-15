const axios = require("axios");
const crypto = require("crypto");

const DEFAULT_API_URL = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5000}`;

const MOMO_CONFIG = {
  endpoint: process.env.MOMO_ENDPOINT || "https://test-payment.momo.vn/v2/gateway/api/create",
  partnerCode: process.env.MOMO_PARTNER_CODE || "",
  accessKey: process.env.MOMO_ACCESS_KEY || "",
  secretKey: process.env.MOMO_SECRET_KEY || "",
  redirectUrl: process.env.MOMO_REDIRECT_URL || process.env.FRONTEND_ORIGIN || "http://localhost:5173",
  ipnUrl: process.env.MOMO_IPN_URL || `${DEFAULT_API_URL}/api/wallet/momo/webhook`,
};

function createSignature(rawSignature) {
  return crypto.createHmac("sha256", MOMO_CONFIG.secretKey).update(rawSignature).digest("hex");
}

async function createPayment({ amount, orderId, requestId, orderInfo, extraData = "" }) {
  if (!MOMO_CONFIG.partnerCode || !MOMO_CONFIG.accessKey || !MOMO_CONFIG.secretKey) {
    throw new Error("MOMO_CONFIG_MISSING");
  }

  const payload = {
    partnerCode: MOMO_CONFIG.partnerCode,
    partnerName: "LMS",
    storeId: "LMS",
    requestId: String(requestId),
    amount: String(amount),
    orderId: String(orderId),
    orderInfo: orderInfo || "Nap xu qua MoMo",
    redirectUrl: MOMO_CONFIG.redirectUrl,
    ipnUrl: MOMO_CONFIG.ipnUrl || MOMO_CONFIG.redirectUrl,
    lang: "vi",
    extraData,
    requestType: "captureWallet",
  };

  const rawSignature = `accessKey=${MOMO_CONFIG.accessKey}&amount=${payload.amount}&extraData=${payload.extraData}&ipnUrl=${payload.ipnUrl}&orderId=${payload.orderId}&orderInfo=${payload.orderInfo}&partnerCode=${payload.partnerCode}&redirectUrl=${payload.redirectUrl}&requestId=${payload.requestId}&requestType=${payload.requestType}`;
  payload.signature = createSignature(rawSignature);

  const { data } = await axios.post(MOMO_CONFIG.endpoint, payload, {
    headers: { "Content-Type": "application/json" },
    timeout: 15000,
  });

  return data;
}

function verifyWebhookSignature(body) {
  if (!MOMO_CONFIG.secretKey || !MOMO_CONFIG.accessKey) {
    return { valid: false, reason: "missing_config" };
  }

  const rawSignature = [
    `accessKey=${MOMO_CONFIG.accessKey}`,
    `amount=${body.amount}`,
    `extraData=${body.extraData || ""}`,
    `message=${body.message}`,
    `orderId=${body.orderId}`,
    `orderInfo=${body.orderInfo}`,
    `orderType=${body.orderType}`,
    `partnerCode=${body.partnerCode}`,
    `payType=${body.payType}`,
    `requestId=${body.requestId}`,
    `responseTime=${body.responseTime}`,
    `resultCode=${body.resultCode}`,
    `transId=${body.transId}`,
  ].join("&");

  const expected = createSignature(rawSignature);
  return { valid: expected === body.signature, expected, received: body.signature };
}

function decodeExtraData(extraData) {
  try {
    const decoded = Buffer.from(extraData || "", "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch (err) {
    return null;
  }
}

module.exports = {
  createPayment,
  verifyWebhookSignature,
  decodeExtraData,
  config: MOMO_CONFIG,
};
