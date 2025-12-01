const mongoose = require("mongoose");
const { Schema } = mongoose;

const walletTopUpSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    provider: { type: String, default: "momo" },
    orderId: { type: String, required: true, unique: true },
    requestId: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 }, // VND
    coins: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    transId: { type: String },
    resultCode: { type: Number },
    message: { type: String },
    rawPayload: { type: Schema.Types.Mixed },
    payUrl: { type: String },
    deeplink: { type: String },
  },
  { timestamps: true }
);

walletTopUpSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("WalletTopUp", walletTopUpSchema);
