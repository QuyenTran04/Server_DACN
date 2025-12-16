const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Gửi email thông báo cộng xu
 */
async function sendCreditNotification({ to, userName, coins, reason, newBalance }) {
  const mailOptions = {
    from: `"SmartLearn" <${process.env.EMAIL_USER}>`,
    to,
    subject: ` Bạn vừa được cộng ${coins} xu!`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; background: #f4f7fa; margin: 0; padding: 20px; }
          .container { max-width: 500px; margin: 0 auto; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          .header { background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center; }
          .header h1 { color: #fff; margin: 0; font-size: 24px; }
          .header .coins { font-size: 48px; color: #fff; margin: 10px 0; }
          .content { padding: 30px; }
          .info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
          .info-label { color: #64748b; }
          .info-value { font-weight: 600; color: #1e293b; }
          .balance-box { background: linear-gradient(135deg, #fef3c7, #fde68a); padding: 20px; border-radius: 12px; text-align: center; margin-top: 20px; }
          .balance-label { color: #92400e; font-size: 14px; }
          .balance-value { color: #92400e; font-size: 28px; font-weight: 700; }
          .footer { padding: 20px; text-align: center; color: #94a3b8; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Thông báo cộng xu</h1>
            <div class="coins">+${coins} xu</div>
          </div>
          <div class="content">
            <p>Xin chào <strong>${userName}</strong>,</p>
            <p>Tài khoản của bạn vừa được cộng thêm xu từ hệ thống.</p>
            
            <div class="info-row">
              <span class="info-label">Số xu được cộng:</span>
              <span class="info-value" style="color: #10b981;">+${coins} xu</span>
            </div>
            <div class="info-row">
              <span class="info-label">Lý do:</span>
              <span class="info-value">${reason || "Admin cộng xu"}</span>
            </div>
            
            <div class="balance-box">
              <div class="balance-label">Số dư hiện tại</div>
              <div class="balance-value">${newBalance?.toLocaleString() || 0} xu</div>
            </div>
          </div>
          <div class="footer">
            <p>Email này được gửi tự động, vui lòng không trả lời.</p>
            <p>© ${new Date().getFullYear()} Hệ thống học tập trực tuyến</p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Email] Credit notification sent to ${to}`);
    return true;
  } catch (err) {
    console.error("[Email] Failed to send credit notification:", err.message);
    return false;
  }
}

module.exports = {
  sendCreditNotification,
};
