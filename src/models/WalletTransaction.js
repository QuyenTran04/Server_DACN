const mongoose = require("mongoose");
const { Schema } = mongoose;

const walletTransactionSchema = new Schema(
  {
    wallet: { type: Schema.Types.ObjectId, ref: "Wallet", required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["credit", "debit", "refund"], required: true },
    amount: { type: Number, required: true, min: 0 },
    balanceAfter: { type: Number, required: true, min: 0 },
    reason: { type: String, default: "" },
    reference: { type: String },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

walletTransactionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
