# LMS Server - AI-Powered Learning Management System Backend

Backend cho hệ thống quản lý học tập trực tuyến tích hợp AI, hỗ trợ tạo khóa học tự động, tạo quiz/bài tập bằng AI, và nhiều tính năng nâng cao.

## Mục lục

- [Tổng quan](#tổng-quan)
- [Công nghệ sử dụng](#công-nghệ-sử-dụng)
- [Cấu trúc thư mục](#cấu-trúc-thư-mục)
- [Cài đặt](#cài-đặt)
- [Cấu hình môi trường](#cấu-hình-môi-trường)
- [Chạy ứng dụng](#chạy-ứng-dụng)
- [API Endpoints](#api-endpoints)
- [Database Models](#database-models)
- [Tính năng chính](#tính-năng-chính)
- [Docker](#docker)

---

## Tổng quan

Server này là backend cho một hệ thống LMS (Learning Management System) với các khả năng:

- **Quản lý khóa học**: Tạo, cập nhật, xóa khóa học và bài học
- **AI-powered**: Tạo nội dung khóa học, quiz, bài tập tự động bằng Google Gemini AI
- **Hệ thống ví điện tử**: Tích hợp thanh toán MoMo
- **Chứng chỉ**: Cấp và xác thực chứng chỉ hoàn thành khóa học
- **Đánh giá & Review**: Hệ thống đánh giá khóa học
- **Admin Dashboard**: Quản lý người dùng, khóa học, doanh thu

---

## Công nghệ sử dụng

| Danh mục | Công nghệ |
|----------|-----------|
| **Runtime** | Node.js (v20 Alpine) |
| **Framework** | Express.js v5.1.0 |
| **Database** | MongoDB với Mongoose v8.18.2 |
| **Authentication** | JWT + Google OAuth |
| **AI Integration** | Google Gemini API (text generation, embeddings, TTS) |
| **File Storage** | Cloudinary |
| **Job Scheduling** | Agenda (MongoDB-based) |
| **Payment** | MoMo Wallet Integration |
| **Validation** | Zod |
| **PDF Processing** | pdf-parse, mammoth |
| **OCR** | Tesseract.js |

---

## Cấu trúc thư mục

```
server/
├── src/
│   ├── server.js              # Entry point chính
│   ├── configs/
│   │   ├── database.js        # Kết nối MongoDB
│   │   ├── agenda.js          # Cấu hình job scheduling
│   │   └── cloudinary.js      # Cấu hình Cloudinary
│   ├── controllers/           # Xử lý logic request
│   │   ├── auth.controller.js
│   │   ├── course.controller.js
│   │   ├── admin.controller.js
│   │   ├── ai.controller.js
│   │   ├── quiz.controller.js
│   │   ├── practice.controller.js
│   │   ├── lesson.controller.js
│   │   ├── document.controller.js
│   │   ├── wallet.controller.js
│   │   └── ...
│   ├── models/                # MongoDB models
│   │   ├── User.js
│   │   ├── Course.js
│   │   ├── Lesson.js
│   │   ├── Quiz.js
│   │   ├── Practice.js
│   │   ├── Wallet.js
│   │   └── ...
│   ├── routes/                # API routes
│   │   ├── auth.routes.js
│   │   ├── course.routes.js
│   │   ├── admin.routes.js
│   │   └── ...
│   ├── services/              # Business logic services
│   │   ├── gemini.service.js  # Gemini AI integration
│   │   ├── embedding.service.js
│   │   ├── momo.service.js    # MoMo payment
│   │   ├── wallet.service.js
│   │   └── ...
│   ├── middlewares/
│   │   ├── auth.js            # JWT authentication
│   │   └── upload.js          # Multer file upload
│   └── utils/                 # Helper functions
├── scripts/                   # Migration scripts
├── package.json
├── docker-compose.yml
├── Dockerfile
└── .env
```

---

## Cài đặt

### Yêu cầu

- Node.js >= 18
- MongoDB >= 5.0
- npm hoặc yarn

### Cài đặt dependencies

```bash
cd server
npm install
```

---

## Cấu hình môi trường

Tạo file `.env` trong thư mục `server/`:

```env
# Server
PORT=5000
FRONTEND_ORIGIN=http://localhost:5173
NODE_ENV=development

# MongoDB
MONGO_URI=mongodb://localhost:27017/lms

# JWT
JWT_SECRET=your-jwt-secret

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id

# Gemini AI
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.0-flash
GEMINI_EMBED_MODEL=gemini-embedding-001
GEMINI_EMBED_DIM=3072

# Cloudinary
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# MoMo Payment
MOMO_PARTNER_CODE=your-partner-code
MOMO_ACCESS_KEY=your-access-key
MOMO_SECRET_KEY=your-secret-key
MOMO_ENDPOINT=https://test-payment.momo.vn/v2/gateway/api/create
MOMO_REDIRECT_URL=http://localhost:5173
MOMO_IPN_URL=http://localhost:5000/api/wallet/momo/webhook

# n8n (optional)
N8N_ENCRYPTION_KEY=your-encryption-key

# Auto embedding
AUTO_EMBEDDING_ENABLED=true
```

---

## Chạy ứng dụng

### Development (với hot reload)

```bash
npm run dev
```

### Production

```bash
npm start
```

Server sẽ chạy tại `http://localhost:5000`

---

## API Endpoints

### Authentication (`/api/auth`)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/register` | Đăng ký user mới |
| POST | `/login` | Đăng nhập |
| POST | `/google` | Đăng nhập với Google OAuth |
| GET | `/me` | Lấy thông tin user hiện tại (cần auth) |
| POST | `/logout` | Đăng xuất (cần auth) |

### Courses (`/api/courses`)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/getCourses` | Danh sách tất cả khóa học |
| GET | `/my` | Khóa học đã đăng ký của user |
| GET | `/getCoursesByInstructor/:instructorId` | Khóa học theo instructor |
| GET | `/getCourseById/:id` | Chi tiết khóa học |

### AI Features (`/api/ai`)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| POST | `/courses/draft` | Tạo draft khóa học với AI |
| POST | `/courses/start` | Bắt đầu tạo khóa học AI |
| GET | `/courses/:courseId/stream` | SSE stream cho việc tạo khóa học |
| POST | `/chat` | Chat với AI tutor |
| POST | `/explain-quiz` | AI giải thích quiz |
| POST | `/tts/pronounce` | Text-to-speech |

### Quizzes (`/api/quizzes`)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/` | Danh sách quiz |
| GET | `/:id` | Chi tiết quiz |
| POST | `/create` | Tạo quiz mới |
| PUT | `/:id` | Cập nhật quiz |
| DELETE | `/:id` | Xóa quiz |
| POST | `/:id/submit` | Nộp bài quiz |
| POST | `/generate` | AI tạo quiz tự động |
| POST | `/import` | Import quiz từ file (PDF/Image) |

### Practice (`/api/practice`)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/lesson/:lessonId` | Bài tập theo lesson |
| GET | `/:id` | Chi tiết bài tập |
| POST | `/` | Tạo bài tập mới |
| POST | `/:id/submit` | Nộp bài tập |
| GET | `/history/:userId/:lessonId` | Lịch sử làm bài |
| DELETE | `/:id` | Xóa bài tập |

### Documents (`/api/documents`)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/lesson/:lessonId` | Documents theo lesson |
| GET | `/course/:courseId` | Documents theo course |
| POST | `/` | Tạo document mới |
| PUT | `/:id` | Cập nhật document |
| DELETE | `/:id` | Xóa document |
| POST | `/:id/ask` | Hỏi đáp AI về document |
| POST | `/:id/generate-example` | AI tạo ví dụ |

### Wallet (`/api/wallet`)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/me` | Thông tin ví |
| GET | `/transactions` | Lịch sử giao dịch |
| POST | `/topup/momo` | Nạp tiền qua MoMo |
| POST | `/momo/webhook` | MoMo webhook (public) |

### Reviews (`/api/reviews`)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/course/:courseId` | Reviews của khóa học |
| GET | `/check-eligibility/:courseId` | Kiểm tra eligibility review |
| POST | `/course/:courseId` | Tạo review mới |
| PUT | `/:reviewId` | Cập nhật review |
| DELETE | `/:reviewId` | Xóa review |

### Certificates (`/api/certificates`)

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/verify/:code` | Xác thực chứng chỉ (public) |
| GET | `/student/:studentId` | Chứng chỉ của học viên |

### Admin (`/api/admin`) - Yêu cầu role admin

- CRUD quản lý khóa học (assign instructor, publish/unpublish)
- CRUD quản lý người dùng (role management)
- Theo dõi tiến độ học viên
- Thống kê doanh thu (theo tháng, theo khóa học, theo instructor)
- Quản lý orders và refunds
- Quản lý categories, lessons, quizzes, documents
- Quản lý wallet và announcements
- Quản lý certificates
- Analytics dashboard

---

## Database Models

| Model | Mô tả |
|-------|-------|
| **User** | name, email, password, role (student/admin), avatar, googleId, provider |
| **Course** | title, description, price, category, instructor, level, rating |
| **Lesson** | course, title, videoUrl, content, order, resources |
| **Quiz** | course, lesson, question, options, correctAnswers, difficulty |
| **Practice** | title, questions, lessonId, courseId, difficulty, questionType, hints |
| **Document** | lesson, course, title, content, contentType, generatedByAI, summary |
| **Enrollment** | student, course, progress, completedLessons, status |
| **Category** | name, parent (hierarchical), iconUrl |
| **Review** | student, course, rating, comment, hidden |
| **Wallet** | user, balance, currency |
| **WalletTransaction** | wallet, user, type, amount, balanceAfter, reason |
| **Order** | student, course, amount, status, paymentMethod |
| **Certificate** | student, course, certificateNumber, grade, verificationCode |
| **Announcement** | title, content, type, priority, targetAudience |
| **Chunk** | Vector embeddings cho semantic search |

---

## Tính năng chính

### AI-Powered Course Creation

- Tạo khóa học hoàn chỉnh từ topic/title sử dụng Gemini AI
- Streaming SSE để theo dõi tiến độ tạo khóa học real-time
- Tự động tạo lessons, quizzes, và practice exercises
- Subject-specific prompt templates

### AI Tutoring

- Chat với AI tutor cho câu hỏi liên quan đến khóa học
- AI giải thích đáp án quiz
- Hỏi đáp về documents

### Vector Search

- Gemini embeddings cho semantic search
- Tự động chunking và embedding nội dung course/document
- Atlas Vector Search integration

### Payment Integration

- MoMo wallet integration
- Mua khóa học với số dư ví
- Webhook handling cho payment confirmation

### Job Scheduling

- Agenda cho background job processing
- Document generation jobs
- Online status monitoring

---

## Docker

### Build và chạy với Docker

```bash
# Build và chạy
docker-compose up -d

# Xem logs
docker-compose logs -f

# Dừng
docker-compose down
```

### Services

- **Server**: Chạy trên port 5000
- **n8n**: Workflow automation trên port 5678 (optional)

---

## Scripts

```bash
# Development
npm run dev          # Chạy với nodemon

# Production
npm start            # node src/server.js

# Migration
node scripts/migrate-practice-difficulty.js
```

---

## License

MIT
