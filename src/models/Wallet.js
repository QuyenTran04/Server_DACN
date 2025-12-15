const mongoose = require("mongoose");
const { Schema } = mongoose;

const walletSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    balance: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "xu" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Wallet", walletSchema);
