# API Tự Động Điều Chỉnh Mức Độ Bài Luyện Tập

## Tổng quan

Hệ thống đã được cập nhật để tự động điều chỉnh mức độ khó của bài luyện tập dựa trên kết quả làm bài của người dùng. Các câu hỏi được tạo bởi AI sẽ bám sát nội dung bài học và không chung chung.

## Logic Điều Chỉnh Mức Độ

- **Điểm > 8/10**: Tăng lên 1 mức độ cao hơn
- **Điểm 5-8/10**: Giữ nguyên mức độ hiện tại
- **Điểm < 5/10**: Giảm xuống 1 mức độ thấp hơn

## Các Mức Độ

1. **Dễ** - Kiểm tra hiểu biết khái niệm cơ bản
2. **Trung bình** - Yêu cầu áp dụng kiến thức vào tình huống cụ thể
3. **Khó** - Yêu cầu tư duy phản biện và giải quyết vấn đề phức tạp
4. **Rất Khó** - Yêu cầu tổng hợp kiến thức, sáng tạo và tư duy cấp cao

## API Endpoints

### 1. Tạo bài luyện tập (Tự động điều chỉnh mức độ)

```http
POST /api/practice/
```

**Body:**
```json
{
  "lessonId": "string",
  "title": "string (optional)",
  "lessonContent": "string",
  "courseId": "string (optional)",
  "difficulty": "string (optional - sẽ tự động điều chỉnh nếu không cung cấp)",
  "questionType": "open_ended | multiple_choice | essay"
}
```

**Response:**
```json
{
  "practice": {
    "_id": "string",
    "title": "Luyện tập: [Tên bài học]",
    "questions": [...],
    "difficulty": "Dễ | Trung bình | Khó | Rất Khó",
    "totalQuestions": 3,
    "lessonId": "string",
    "courseId": "string"
  },
  "wallet": {...} // Nếu có phí
}
```

### 2. Lấy thông tin mức độ tiếp theo

```http
GET /api/practice/next-difficulty/:lessonId
```

**Response:**
```json
{
  "nextDifficulty": "Trung bình",
  "lastScore": 7.5,
  "lastDifficulty": "Trung bình",
  "message": "Điểm 7.5/10 → Giữ nguyên mức độ Trung bình",
  "totalSubmissions": 3,
  "averageScore": 7.2,
  "difficultyLevels": ["Dễ", "Trung bình", "Khó", "Rất Khó"],
  "scoringRules": {
    "increase": "Điểm > 8/10 → Tăng 1 mức",
    "maintain": "Điểm 5-8/10 → Giữ nguyên",
    "decrease": "Điểm < 5/10 → Giảm 1 mức"
  }
}
```

### 3. Lấy bài luyện tập theo bài học

```http
GET /api/practice/lesson/:lessonId
```

**Response:**
```json
{
  "practice": {...},
  "userSubmissions": [...],
  "totalAttempts": 2,
  "lastScore": 7.5,
  "nextDifficulty": "Trung bình",
  "difficultyInfo": {
    "current": "Trung bình",
    "next": "Khó",
    "message": "Dựa trên điểm 7.5/10 của bài trước, bài tiếp theo sẽ ở mức độ Trung bình"
  }
}
```

## Ví dụ Luồng Hoạt Động

### Lần đầu tạo bài luyện tập:
1. Gọi `POST /api/practice/` không truyền `difficulty`
2. Hệ thống tạo bài ở mức độ "Trung bình" (mặc định)
3. Người dùng làm bài và đạt 6/10 điểm

### Lần thứ hai tạo bài luyện tập:
1. Gọi `POST /api/practice/` không truyền `difficulty`
2. Hệ thống tự động tạo bài ở mức độ "Trung bình" (giữ nguyên do điểm 5-8/10)
3. Người dùng làm bài và đạt 9/10 điểm

### Lần thứ ba tạo bài luyện tập:
1. Gọi `POST /api/practice/` không truyền `difficulty`
2. Hệ thống tự động tạo bài ở mức độ "Khó" (tăng do điểm > 8/10)
3. Người dùng làm bài và đạt 4/10 điểm

### Lần thứ tư tạo bài luyện tập:
1. Gọi `POST /api/practice/` không truyền `difficulty`
2. Hệ thống tự động tạo bài ở mức độ "Trung bình" (giảm do điểm < 5/10)

## Cải Thiện AI

Prompt AI đã được cải thiện để:
- Đọc kỹ toàn bộ nội dung bài học
- Xác định các khái niệm chính, ví dụ cụ thể
- Tạo câu hỏi yêu cầu học viên PHẢI dựa vào nội dung bài học
- Sử dụng chính xác thuật ngữ, ví dụ từ bài học
- Tránh các câu hỏi chung chung

## Xử lý frontend

Khi gọi API tạo bài luyện tập:
- Không cần truyền tham số `difficulty` nếu muốn hệ thống tự động điều chỉnh
- Có thể truyền `difficulty` nếu muốn ép buộc mức độ cụ thể
- Lấy thông tin mức độ tiếp theo bằng API `next-difficulty` để hiển thị cho người dùng

## Lưu ý

- Mỗi bài học có thể có nhiều bài luyện tập ở các mức độ khác nhau
- Hệ thống sẽ không tạo trùng bài luyện tập cùng mức độ trong cùng 1 bài học
- Điểm số được lưu và tính toán tự động
- Feedback từ AI giúp người dùng hiểu rõ điểm mạnh và điểm yếu