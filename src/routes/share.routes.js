const express = require("express");
const router = express.Router();
const Course = require("../models/Course");

// Route để render HTML với Open Graph meta tags cho Facebook crawler
router.get("/course/:id", async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate("instructor", "name")
      .populate("category", "name");

    if (!course) {
      return res.status(404).send("Khóa học không tồn tại");
    }

    const frontendUrl = process.env.FRONTEND_ORIGIN || "http://localhost:5173";
    const backendUrl = process.env.BACKEND_URL || "http://localhost:5000";
    // URL để redirect người dùng về frontend
    const courseUrl = `${frontendUrl}/courses/${course._id}`;
    // URL cho og:url (URL share trên Facebook)
    const shareUrl = `${backendUrl}/api/share/course/${course._id}`;
    
    // Sử dụng URL hình ảnh từ Cloudinary (đã là URL công khai)
    // Nếu không có, dùng placeholder image công khai
    let imageUrl = course.imageUrl;
    if (!imageUrl || imageUrl.startsWith('/')) {
      // Sử dụng placeholder image công khai
      imageUrl = "https://res.cloudinary.com/dp7xylrjo/image/upload/v1/autolearn/default-course-cover.png";
    }
    
    const title = course.title || "Khóa học AutoLearn";
    const description = (course.description || "Khám phá khóa học tuyệt vời trên AutoLearn").substring(0, 200);
    const siteName = "AutoLearn";
    const price = course.price ? `${course.price.toLocaleString('vi-VN')}đ` : "Miễn phí";
    const lessonCount = course.lessons?.length || 0;

    // Render HTML với Open Graph meta tags
    const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - ${siteName}</title>
  
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${shareUrl}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description} | ${price} | ${lessonCount} bài học">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:site_name" content="${siteName}">
  <meta property="og:locale" content="vi_VN">
  
  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:url" content="${shareUrl}">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
  
  <!-- Redirect to actual course page -->
  <meta http-equiv="refresh" content="0;url=${courseUrl}">
</head>
<body>
  <p>Đang chuyển hướng đến khóa học...</p>
  <script>window.location.href = "${courseUrl}";</script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html");
    res.send(html);
  } catch (error) {
    console.error("Share route error:", error);
    res.status(500).send("Lỗi server");
  }
});

module.exports = router;
