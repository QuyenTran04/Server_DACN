const { callLLMJSON } = require("./llm-improved.service");
const {
  extractKeyVocabulary,
} = require("../utils/dynamicPrompt.helper");

const MIN_CONTENT_CHARS = 4000; // Increased to ensure comprehensive content
const MAX_RETRIES = 3;
const BASE_TIMEOUT = 300000; // 5 minutes
const STREAM_TIMEOUT = 240000; // 4 minutes for stream operations
const EXPANDED_TOKENS = 16384; // Increased from 8192

// Detect course type for appropriate content structure
function detectCourseType(courseTitle = "", courseDescription = "", lessonTitle = "") {
  const text = `${courseTitle} ${courseDescription} ${lessonTitle}`.toLowerCase();

  // Programming & Technology - Mở rộng từ khóa
  if (/lập\s*trình|programming|code|python|javascript|java|c\+\+|react|node|sql|database|web\s*dev|software|app\s*dev|backend|frontend|mobile\s*dev|devops|cloud|aws|azure|docker|kubernetes|api|microservices|algorithm|data\s*structure|php|ruby|swift|kotlin|flutter|blockchain|cybersecurity|networking|ai|machine\s*learning|deep\s*learning|tensorflow|pytorch|nlp|computer\s*vision/i.test(text)) {
    return "Lập trình & Công nghệ";
  }

  // Languages - Mở rộng thêm nhiều ngôn ngữ
  if (/tiếng|ngôn\s*ngữ|language|english|chinese|japanese|korean|french|german|spanish|italian|russian|arabic|portuguese|hindi|thai|ielts|toeic|toefl|vocabulary|grammar|speaking|listening|reading|writing|pronunciation|conversation|phát\s*âm|từ\s*vựng|ngữ\s*pháp|hội\s*thoại|giao\s*tiếp|efl|esl/i.test(text)) {
    return "Ngoại ngữ";
  }

  // Business & Marketing - Mở rộng thêm
  if (/kinh\s*doanh|business|marketing|quản\s*lý|management|sales|bán\s*hàng|khởi\s*nghiệp|startup|chiến\s*lược|strategy|tài\s*chính|finance|kế\s*toán|accounting|investment|đầu\s*tư|entrepreneurship|branding|digital\s*marketing|social\s*media|ecommerce|market\s*research|business\s*analysis|project\s*management|hr|nhân\s*sự|leadership|ceo|cfo|cpa|mba|swot|kpi|roi/i.test(text)) {
    return "Kinh doanh & Marketing";
  }

  // Design & Creative - Mở rộng
  if (/thiết\s*kế|design|ui|ux|graphic|photoshop|illustrator|figma|sketch|art|nghệ\s*thuật|sáng\s*tạo|creative|video\s*edit|animation|3d|vfx|motion\s*graphics|branding|logo|typography|color\s*theory|web\s*design|app\s*design|product\s*design|industrial\s*design|architecture|interior\s*design|fashion|adobe|canva|sketch|invision|prototype|wireframe|mockup/dg/i.test(text)) {
    return "Thiết kế & Sáng tạo";
  }

  // Soft Skills & Personal Development - Mở rộng
  if (/kỹ\s*năng\s*mềm|soft\s*skill|giao\s*tiếp|communication|lãnh\s*đạo|leadership|thuyết\s*trình|presentation|quản\s*lý\s*thời\s*gian|time\s*management|tư\s*duy|thinking|phát\s*triển\s*bản\s*thân|personal\s*dev|self\s*improvement|emotional\s*intelligence|eq|negotiation|teamwork|problem\s*solving|critical\s*thinking|creativity|innovation|productivity|mindfulness|stress\s*management|confidence|public\s*speaking|networking|coaching|mentoring/i.test(text)) {
    return "Kỹ năng mềm";
  }

  // Data & Analytics - Mở rộng
  if (/dữ\s*liệu|data|phân\s*tích|analytics|machine\s*learning|ai|artificial\s*intelligence|deep\s*learning|statistics|thống\s*kê|excel|power\s*bi|tableau|sql|python|r|big\s*data|data\s*science|data\s*visualization|dashboard|business\s*intelligence|bi|data\s*mining|predictive\s*analytics|etl|data\s*warehouse|data\s*lakes|spark|hadoop|numpy|pandas|matplotlib|seaborn|jupyter/i.test(text)) {
    return "Dữ liệu & Phân tích";
  }

  // Health & Fitness - Mở rộng
  if (/sức\s*khỏe|health|fitness|yoga|gym|dinh\s*dưỡng|nutrition|tập\s*luyện|workout|thể\s*dục|exercise|meditation|wellness|weight\s*loss|bodybuilding|crossfit|cardio|strength\s*training|pilates|calisthenics|hiit|personal\s*trainer|physical\s*therapy|rehab|mental\s*health|stress\s*relief|sleep|mindfulness|chakra|ayurveda|vegan|keto|paleo|diet|supplement|vitamin|mineral/i.test(text)) {
    return "Sức khỏe & Thể hình";
  }

  // Music & Arts - Mở rộng
  if (/âm\s*nhạc|music|nhạc\s*cụ|instrument|guitar|piano|vocal|hát|singing|vẽ|drawing|painting|violin|drums|bass|flute|saxophone|trumpet|music\s*theory|composition|songwriting|music\s*production|djing|mixing|mastering|dancing|ballet|contemporary|hip\s*hop|jazz|classical|rock|pop|blues|country|folk|reggae|electronic|edm|sculpture|ceramics|photography|film|theater|acting|improv/i.test(text)) {
    return "Âm nhạc & Nghệ thuật";
  }

  // Photography & Video - Mở rộng
  if (/nhiếp\s*ảnh|photography|camera|chụp\s*ảnh|photo|quay\s*phim|video|cinematography|editing|videography|drone|portrait|landscape|wildlife|street\s*photo|macro|black\s*and\s*white|long\s*exposure|time\s*lapse|hdr|panorama|lightroom|photoshop|premiere\s*pro|final\s*cut|after\s*effects|da\s*vinci|resolve|color\s*grading|visual\s*effects|motion\s*design|storytelling|documentary|youtube|vlogging|tiktok|instagram|reel/i.test(text)) {
    return "Nhiếp ảnh & Video";
  }

  // Education & Teaching - Mở rộng
  if (/giáo\s*dục|education|teaching|dạy\s*học|pedagogy|giảng\s*dạy|học\s*tập|learning|elearning|online\s*course|curriculum|lesson\s*plan|classroom|student|teacher|professor|academic|research|university|college|school|tutoring|mentorship|educational\s*technology|edtech|instructional\s*design|assessment|evaluation|psychology|philosophy|sociology|history|literature|mathematics|physics|chemistry|biology|geography|economics|political\s*science/i.test(text)) {
    return "Giáo dục";
  }

  // Culinary & Cooking - Thêm mới
  if (/nấu\s*ăn|cooking|baking|culinary|chef|recipe|cuisine|food|ẩm\s*thực|kitchen|ingredients|spices|herbs|techniques|methods|grilling|frying|steaming|roasting|sautéing|knife\s*skills|plating|pastry|dessert|wine|cocktail|bartending|mixology|coffee|barista|fermentation|preservation|vegan|vegetarian|gluten\s*free|keto|paleo|international|fusion|molecular\s*gastronomy/i.test(text)) {
    return "Ẩm thực & Nấu ăn";
  }

  // Real Estate & Property - Thêm mới
  if (/bất\s*động\s*sản|real\s*estate|property|nhà\s*đất|rent|lease|mortgage|investment|landlord|tenant|appraisal|inspection|valuation|broker|agent|realtor|development|construction|architecture|interior\s*design|home\s*staging|foreclosure|short\s*sale|flip|house\s*hunting|property\s*management|hoa|commercial|residential|luxury/i.test(text)) {
    return "Bất động sản";
  }

  // Gaming & Esports - Thêm mới
  if (/game|gaming|esports|đồ\s*hội|game\s*development|unity|unreal\s*engine|game\s*design|level\s*design|game\s*art|animation|programming|mobile\s*games|pc\s*games|console|vr|ar|streaming|twitch|youtube\s*gaming|pro\s*gamer|competitive|tournament|league|fps|moba|mmorpg|rpg|strategy|puzzle|casual|indie|aaa/i.test(text)) {
    return "Gaming & Esports";
  }

  // Travel & Tourism - Thêm mới
  if (/du\s*lịch|travel|tourism|vacation|holiday|adventure|backpacking|hotel|airline|cruise|guide|destination|explore|wanderlust|budget\s*travel|luxury\s*travel|solo\s*travel|family\s*vacation|business\s*trip|cultural|heritage|museum|landmark|passport|visa|itinerary|booking|hostel|resort|airbnb/i.test(text)) {
    return "Du lịch & Khám phá";
  }

  // Personal Finance - Thêm mới
  if (/tài\s*cá\s*nhân|personal\s*finance|saving|budgeting|investing|retirement|insurance|tax|estate\s*planning|debt|credit|loan|mortgage|financial\s*freedom|passive\s*income|side\s*hustle|freelancing|entrepreneurship|crypto|bitcoin|blockchain|stocks|bonds|etf|mutual\s*funds|real\s*estate\s*investment|401k|ira|pension|social\s*security/i.test(text)) {
    return "Tài chính cá nhân";
  }

  // Parenting & Family - Thêm mới
  if (/làm\s*cha\s*mẹ|parenting|family|child|baby|toddler|teenager|pregnancy|newborn|breastfeeding|sleep\s*training|discipline|education|development|psychology|single\s*parent|step\s*family|adoption|foster\s*care|homeschooling|activities|games|nutrition|health|safety|carving|milestones|parenting\s*styles|positive\s*discipline|gentle\s*parenting/i.test(text)) {
    return "Làm cha mẹ & Gia đình";
  }

  // Spirituality & Philosophy - Thêm mới
  if (/tâm\s*linh|spirituality|philosophy|meditation|yoga|mindfulness|buddhism|taoism|hinduism|christianity|islam|judaism|religion|faith|enlightenment|awareness|consciousness|meaning\s*of\s*life|ethics|morality|wisdom|stoicism|existentialism|minimalism|self\s*help|personal\s*growth|transformation|healing|energy|chakra|reiki|astrology|numerology|tarot/i.test(text)) {
    return "Tâm linh & Triết học";
  }

  // DIY & Home Improvement - Thêm mới
  if (/diy|do\s*it\s*yourself|home\s*improvement|renovation|repair|maintenance|woodworking|gardening|landscaping|plumbing|electrical|painting|decorating|organizing|decluttering|cleaning|hacks|tips|upcycling|recycling|sustainability|green\s*living|composting|solar|energy\s*efficiency|smart\s*home|automation|security/i.test(text)) {
    return "DIY & Cải thiện nhà cửa";
  }

  // Fashion & Beauty - Thêm mới
  if (/thời\s*trang|fashion|style|beauty|makeup|skincare|hair|cosmetics|wardrobe|outfit|accessories|shoes|bags|jewelry|model|runway|designer|brand|luxury|vintage|sustainable|ethical|minimalist|capsule\s*wardrobe|personal\s*stylist|image\s*consultant|nail\s*art|fragrance|perfume|anti\s*aging|wellness|self\s*care/i.test(text)) {
    return "Thời trang & Làm đẹp";
  }

  return "Tổng hợp"; // General/Other
}

// Generate language course specific user prompt
function getLanguageCoursePrompt({ lessonTitle, lessonContent, courseTitle, courseDescription, level, keyTerms }) {
  return `📚 THÔNG TIN KHÓA HỌC NGOẠI NGỮ:
Khóa học: ${courseTitle}
Mô tả: ${courseDescription}
Cấp độ: ${level}
Bài học: ${lessonTitle}

📝 GỢI Ý NỘI DUNG:
${lessonContent || "Không có gợi ý - hãy tự tạo nội dung phù hợp với tiêu đề bài học"}

🎯 TỪ KHÓA: ${keyTerms.join(", ")}

⚠️ ĐÂY LÀ KHÓA HỌC NGOẠI NGỮ - PHẢI TẠO NỘI DUNG PHÙ HỢP:
- KHÔNG viết về "nguyên lý hoạt động", "quy trình triển khai", "case study doanh nghiệp"
- PHẢI tập trung vào: TỪ VỰNG, HỘI THOẠI, NGỮ PHÁP, PHÁT ÂM, BÀI TẬP NGÔN NGỮ

📋 CẤU TRÚC BẮT BUỘC CHO BÀI HỌC NGOẠI NGỮ:

## 1. Mục tiêu bài học (100-150 từ)
- Sau bài học này, học viên sẽ biết những từ vựng/cấu trúc gì
- Có thể giao tiếp trong tình huống nào

## 2. Từ vựng chính (Vocabulary) - QUAN TRỌNG NHẤT
Tạo BẢNG TỪ VỰNG với ÍT NHẤT 15-20 từ/cụm từ:
| Từ vựng | Phiên âm (IPA) | Loại từ | Nghĩa tiếng Việt | Câu ví dụ |
Ví dụ:
| Hello | /həˈloʊ/ | interjection | Xin chào | Hello, how are you? |
| My name is | /maɪ neɪm ɪz/ | phrase | Tên tôi là | My name is Minh. |

## 3. Cụm từ & Thành ngữ (Phrases & Idioms)
- 8-10 cụm từ thông dụng liên quan đến chủ đề
- Giải thích cách dùng và ngữ cảnh

## 4. Hội thoại mẫu (Sample Dialogues) - RẤT QUAN TRỌNG
Tạo ÍT NHẤT 3-4 đoạn hội thoại THỰC TẾ:

**Hội thoại 1: Tình huống [mô tả]**
\`\`\`
A: [Câu tiếng Anh]
   (Dịch nghĩa tiếng Việt)

B: [Câu trả lời]
   (Dịch nghĩa)
\`\`\`
- Giải thích từ vựng/ngữ pháp trong hội thoại
- Các cách nói khác (alternatives)

**Hội thoại 2: Formal (trang trọng)**
**Hội thoại 3: Informal (thân mật)**
**Hội thoại 4: Tình huống đặc biệt**

## 5. Ngữ pháp liên quan (Grammar Points)
- Giải thích CẤU TRÚC NGỮ PHÁP liên quan đến bài học
- Công thức và cách dùng
- Ví dụ minh họa
- Lỗi thường gặp và cách tránh

## 6. Luyện phát âm (Pronunciation)
- Các âm khó cần chú ý
- Phiên âm IPA
- Tips phát âm
- Intonation (ngữ điệu) cho câu hỏi/câu trần thuật

## 7. Bài tập thực hành (Practice Exercises)
Tạo ÍT NHẤT 6-8 bài tập đa dạng:

**Bài 1-2: Điền từ vào chỗ trống (Fill in the blanks)**
**Bài 3-4: Sắp xếp từ thành câu (Rearrange)**
**Bài 5-6: Dịch câu (Translation)**
**Bài 7-8: Viết đoạn văn/hội thoại (Writing)**

Mỗi bài tập PHẢI có ĐÁP ÁN chi tiết.

## 8. Tóm tắt & Tips học tập
- Từ vựng cần nhớ (tóm tắt)
- Cấu trúc quan trọng
- Tips ghi nhớ và luyện tập
- Gợi ý học tiếp

🎯 YÊU CẦU:
✅ Tổng độ dài >= 4000 ký tự
✅ Từ vựng phải có PHIÊN ÂM IPA
✅ Hội thoại phải THỰC TẾ, có thể dùng ngay
✅ Bài tập phải có ĐÁP ÁN
✅ Ngữ pháp phải có VÍ DỤ cụ thể

🚫 KHÔNG ĐƯỢC:
❌ Viết về "nguyên lý hoạt động", "quy trình triển khai"
❌ Case study doanh nghiệp (không phù hợp với khóa ngoại ngữ)
❌ Nội dung không liên quan đến ngôn ngữ

Trả về JSON HOÀN CHỈNH với: title, content, summary, tags`;
}

// Get example guide based on course type
function getCourseTypeExampleGuide(courseType, lessonTitle) {
  switch (courseType) {
    case "Lập trình & Công nghệ":
      return `**Lập trình:** Mỗi ví dụ PHẢI có code hoàn chỉnh, có thể chạy được, với comment giải thích TỪNG DÒNG. Bao gồm cả input, output, và edge cases.`;
    
    case "Ngoại ngữ":
      return `**Ngoại ngữ:** Mỗi ví dụ PHẢI có hội thoại/câu mẫu thực tế, phiên âm, dịch nghĩa, giải thích ngữ pháp, và ngữ cảnh sử dụng. Bao gồm cả formal và informal.`;
    
    case "Kinh doanh & Marketing":
      return `**Kinh doanh:** Mỗi ví dụ PHẢI có case study thực tế từ doanh nghiệp, số liệu cụ thể (doanh thu, ROI, conversion rate), chiến lược được áp dụng, và kết quả đo lường được.`;
    
    case "Thiết kế & Sáng tạo":
      return `**Thiết kế:** Mỗi ví dụ PHẢI mô tả quy trình thiết kế chi tiết, nguyên tắc áp dụng, màu sắc/typography/layout, và giải thích lý do thiết kế. Có thể dùng markdown để minh họa.`;
    
    case "Kỹ năng mềm":
      return `**Kỹ năng mềm:** Mỗi ví dụ PHẢI có tình huống thực tế cụ thể (công việc/cuộc sống), cách xử lý từng bước, dialogue/script mẫu, và phân tích tâm lý/hành vi.`;
    
    case "Dữ liệu & Phân tích":
      return `**Dữ liệu:** Mỗi ví dụ PHẢI có dataset mẫu, công thức/thuật toán, code phân tích, visualization, và insights rút ra từ dữ liệu.`;
    
    case "Sức khỏe & Thể hình":
      return `**Sức khỏe:** Mỗi ví dụ PHẢI có bài tập cụ thể, hướng dẫn từng bước, lưu ý an toàn, lợi ích, và lịch trình luyện tập mẫu.`;
    
    case "Âm nhạc & Nghệ thuật":
      return `**Âm nhạc:** Mỗi ví dụ PHẢI có bài tập kỹ thuật, notation/tab cụ thể, hướng dẫn thực hành, và tips từ chuyên gia (nếu có audio reference).`;
    
    case "Nhiếp ảnh & Video":
      return `**Nhiếp ảnh:** Mỗi ví dụ PHẢI có settings cụ thể (ISO, aperture, shutter speed), lighting setup, composition, post-processing steps, và before/after comparison.`;
    
    default:
      return `**Tổng hợp:** Mỗi ví dụ PHẢI cụ thể, có số liệu/minh họa thực tế, hướng dẫn từng bước chi tiết, và kết quả đo lường được.`;
  }
}

// Get detailed guidance for content generation based on course type
function getCourseTypeDetailedGuidance(courseType, lessonTitle, keyTerms) {
  switch (courseType) {
    case "Ngoại ngữ":
      return `
🌍 HƯỚNG DẪN ĐẶC BIỆT CHO KHÓA HỌC NGOẠI NGỮ:

**BẮT BUỘC phải có:**
1. **Bảng từ vựng** (15-20 từ) với:
   - Từ vựng tiếng Anh
   - Phiên âm IPA CHÍNH XÁC (ví dụ: /həˈloʊ/, /ˈwɛðər/)
   - Loại từ (noun, verb, adjective, etc.)
   - Nghĩa tiếng Việt
   - Câu ví dụ CỤ THỂ

2. **Hội thoại mẫu** (3-4 đoạn):
   - Tình huống thực tế (gặp gỡ, mua sắm, nhà hàng, etc.)
   - Dialogue với dịch nghĩa từng câu
   - Giải thích từ vựng/ngữ pháp trong hội thoại
   - Cả formal và informal

3. **Ngữ pháp** liên quan:
   - Cấu trúc câu cụ thể
   - Công thức và cách dùng
   - Ví dụ minh họa
   - Lỗi thường gặp

4. **Phát âm**:
   - Các âm khó
   - Tips phát âm
   - Intonation (ngữ điệu)

5. **Bài tập** (6-8 bài):
   - Fill in the blanks
   - Rearrange words
   - Translation
   - Writing dialogue
   - MỖI BÀI PHẢI CÓ ĐÁP ÁN

**VÍ DỤ CẤU TRÚC:**
| Từ vựng | Phiên âm | Loại từ | Nghĩa | Ví dụ |
|---------|----------|---------|-------|-------|
| weather | /ˈwɛðər/ | noun | thời tiết | What's the weather like? |
| sunny | /ˈsʌni/ | adjective | nắng | It's sunny today. |

**VÍ DỤ HỘI THOẠI:**
\`\`\`
A: What's the weather like today?
   (Thời tiết hôm nay thế nào?)

B: It's sunny and warm!
   (Trời nắng và ấm!)
\`\`\`
`;

    case "Lập trình & Công nghệ":
      return `
💻 HƯỚNG DẪN ĐẶC BIỆT CHO KHÓA HỌC LẬP TRÌNH:

**BẮT BUỘC phải có:**
1. **Code examples** (6-8 ví dụ):
   - Code HOÀN CHỈNH, có thể chạy được
   - Comment TỪNG DÒNG giải thích
   - Input và Output mẫu
   - Edge cases và error handling
   - Nhiều cách implement (ít nhất 2-3 cách)

2. **So sánh performance**:
   - Time complexity
   - Space complexity
   - Ưu nhược điểm từng cách

3. **Best practices**:
   - Coding conventions
   - Design patterns
   - Common pitfalls

4. **Bài tập coding** (6-8 bài):
   - Đề bài rõ ràng
   - Test cases
   - Hướng dẫn giải chi tiết
   - Code solution đầy đủ

**VÍ DỤ CODE:**
\`\`\`javascript
// Ví dụ: Tính tổng mảng
function sumArray(arr) {
  // Kiểm tra input hợp lệ
  if (!Array.isArray(arr)) {
    throw new Error('Input must be an array');
  }

  // Sử dụng reduce để tính tổng
  return arr.reduce((sum, num) => sum + num, 0);
}

// Test
console.log(sumArray([1, 2, 3, 4, 5])); // Output: 15
\`\`\`
`;

    case "Kinh doanh & Marketing":
      return `
📊 HƯỚNG DẪN ĐẶC BIỆT CHO KHÓA HỌC KINH DOANH:

**BẮT BUỘC phải có:**
1. **Case studies** (3-4 case):
   - Tên công ty/dự án thực tế
   - Bối cảnh và thách thức
   - Chiến lược áp dụng
   - Số liệu CỤ THỂ (doanh thu, ROI, conversion rate, etc.)
   - Kết quả đạt được
   - Bài học rút ra

2. **Frameworks**:
   - SWOT Analysis
   - Porter's 5 Forces
   - Business Model Canvas
   - Áp dụng vào ví dụ cụ thể

3. **Số liệu và metrics**:
   - KPIs quan trọng
   - Cách đo lường
   - Benchmarks trong ngành

4. **Templates**:
   - Marketing plan template
   - Budget template
   - Timeline template

**VÍ DỤ CASE STUDY:**
**Công ty:** Shopee Vietnam
**Thách thức:** Cạnh tranh với Lazada
**Chiến lược:** Free shipping + Gamification
**Kết quả:** Tăng 150% users trong 6 tháng
**ROI:** 280% sau 1 năm
`;

    case "Thiết kế & Sáng tạo":
      return `
🎨 HƯỚNG DẪN ĐẶC BIỆT CHO KHÓA HỌC THIẾT KẾ:

**BẮT BUỘC phải có:**
1. **Design principles** với ví dụ:
   - Contrast (độ tương phản)
   - Hierarchy (hệ thống phân cấp)
   - Balance (cân bằng)
   - Repetition (lặp lại)
   - White space (không gian trắng)

2. **Color theory**:
   - Color palette (bảng màu cụ thể)
   - Psychology of colors
   - Color combinations

3. **Typography**:
   - Font pairing
   - Hierarchy với sizes
   - Readability tips

4. **Practical examples**:
   - Before/After redesigns
   - Design process sketches
   - Tools và software recommendations`;

    case "Kỹ năng mềm":
      return `
🤝 HƯỚNG DẪN ĐẶC BIỆT CHO KHÓA HỌC KỸ NĂNG MỀM:

**BẮT BUỘC phải có:**
1. **Real scenarios** (5-6 tình huống):
   - Workplace situations
   - Personal life contexts
   - Conflict resolution
   - Team dynamics

2. **Communication techniques**:
   - Active listening
   - Non-verbal cues
   - Assertiveness
   - Empathy building

3. **Self-assessment tools**:
   - Skill checklists
   - Action plans
   - Progress tracking

4. **Role-play exercises**:
   - Dialogues/scripts
   - Different perspectives
   - Cultural considerations`;

    case "Dữ liệu & Phân tích":
      return `
📈 HƯỚNG DẪN ĐẶC BIỆT CHO KHÓA HỌC DỮ LIỆU:

**BẮT BUỘC phải có:**
1. **Dataset examples**:
   - Sample data (50-100 records)
   - Data cleaning techniques
   - Data types and formats

2. **Analysis methods**:
   - Statistical tests explained
   - When to use each method
   - Interpretation guidelines

3. **Visualization**:
   - Chart types and when to use
   - Design principles for charts
   - Tools (Excel, Tableau, Power BI)

4. **Code examples**:
   - SQL queries
   - Python/R scripts
   - Jupyter notebooks`;

    case "Sức khỏe & Thể hình":
      return `
💪 HƯỚNG DẪN ĐẶC BIỆT CHO KHÓA HỌC SỨC KHỎE:

**BẮT BUỘC phải có:**
1. **Exercise routines**:
   - 6-8 exercises with clear instructions
   - Form techniques
   - Common mistakes
   - Modifications for different levels

2. **Programming details**:
   - Sets, reps, rest times
   - Progression plans
   - Periodization concepts

3. **Nutrition guidance**:
   - Meal planning
   - Supplementation
   - Hydration

4. **Safety considerations**:
   - Injury prevention
   - Contraindications
   - Warning signs`;

    case "Âm nhạc & Nghệ thuật":
      return `
🎵 HƯỚNG DẪN ĐẶC BIỆT CHO KHÓA HỌC ÂM NHẠC:

**BẮT BUỘC phải có:**
1. **Technical exercises**:
   - Scales and arpeggios
   - Notation examples
   - Practice routines

2. **Music theory**:
   - Concepts explained simply
   - Practical applications
   - Ear training exercises

3. **Performance tips**:
   - Stage presence
   - Practice techniques
   - Recording basics

4. **Equipment guidance**:
   - Instrument selection
   - Maintenance tips
   - Accessory recommendations`;

    case "Nhiếp ảnh & Video":
      return `
📷 HƯỚNG DẪN ĐẶC BIỆT CHO KHÓA HỌC NHIẾP ẢNH:

**BẮT BUỘC phải có:**
1. **Technical settings**:
   - Aperture, ISO, shutter speed
   - Manual mode explanations
   - Camera settings by situation

2. **Composition rules**:
   - Rule of thirds
   - Leading lines
   - Framing techniques
   - Light and shadow

3. **Post-processing**:
   - Workflow steps
   - Software recommendations
   - Editing techniques

4. **Equipment**:
   - Gear recommendations
   - Budget options
   - Essential accessories`;

    case "Ẩm thực & Nấu ăn":
      return `
🍳 HƯỚNG DẪN ĐẶC BIỆT CHO KHÓA HỌC ẨM THỰC:

**BẮT BUỘC phải có:**
1. **Recipes chi tiết** (8-10 món):
   - Ingredients chính xác với số lượng
   - Step-by-step instructions
   - Cooking times và temperatures
   - Tips cho từng bước

2. **Kỹ thuật nấu ăn**:
   - Cutting techniques
   - Cooking methods (sauté, grill, braise)
   - Flavor pairing principles
   - Food safety guidelines

3. **Equipment knowledge**:
   - Essential tools cho kitchen
   - Knife skills và maintenance
   - Appliance usage
   - Storage solutions

4. **Cultural context**:
   - Origin của dishes
   - Regional variations
   - Cultural significance
   - Modern adaptations`;

    case "Bất động sản":
      return `
🏠 HƯỚNG DẪN ĐẶC BIỆT CHO KHÓA HỌC BẤT ĐỘNG SẢN:

**BẮT BUỘC phải có:**
1. **Market analysis**:
   - Property valuation methods
   - Market trends analysis
   - Neighborhood evaluation
   - Investment calculations

2. **Legal aspects**:
   - Property laws
   - Contract essentials
   - Rights và obligations
   - Common pitfalls

3. **Transaction process**:
   - Step-by-step buying/selling
   - Negotiation strategies
   - Financing options
   - Closing procedures

4. **Real-life examples**:
   - Success stories
   - Failed deals analysis
   - ROI calculations
   - Risk management`;

    case "Gaming & Esports":
      return `
🎮 HƯỚNG DẪN ĐẶC BIỆT CHO KHÓA HỌC GAMING:

**BẮT BUỘC phải có:**
1. **Game mechanics**:
   - Core gameplay loops
   - Balance principles
   - Player psychology
   - Monetization strategies

2. **Technical aspects**:
   - Game engines overview
   - Programming basics
   - Asset creation
   - Testing methodologies

3. **Esports ecosystem**:
   - Tournament structures
   - Team management
   - Sponsorship acquisition
   - Career pathways

4. **Practical projects**:
   - Game design documents
   - Level design exercises
   - Simple game prototypes
   - Analysis of successful games`;

    case "Du lịch & Khám phá":
      return `
✈️ HƯỚNG DẪN ĐẶC BIỆT CHO KHÓA HỌC DU LỊCH:

**BẮT BUỘC phải có:**
1. **Destination planning**:
   - Research methods
   - Itinerary creation
   - Budget management
   - Time optimization

2. **Travel skills**:
   - Language essentials
   - Cultural etiquette
   - Safety precautions
   - Emergency procedures

3. **Practical logistics**:
   - Booking strategies
   - Transportation options
   - Accommodation types
   - Packing techniques

4. **Case studies**:
   - Successful trips
   - Mistakes to avoid
   - Budget breakdowns
   - Cultural experiences`;

    case "Tài chính cá nhân":
      return `
💰 HƯỚNG DẪN ĐẶC BIỆT CHO KHÓA HỌC TÀI CHÍNH CÁ NHÂN:

**BẮT BUỘC phải có:**
1. **Financial planning**:
   - Goal setting frameworks
   - Budget creation methods
   - Expense tracking
   - Savings strategies

2. **Investment principles**:
   - Risk management
   - Portfolio diversification
   - Asset allocation
   - Market analysis basics

3. **Practical tools**:
   - Budgeting apps
   - Investment platforms
   - Credit monitoring
   - Tax planning software

4. **Real scenarios**:
   - Case studies of financial success
   - Common mistakes analysis
   - Retirement planning examples
   - Debt management strategies`;

    case "Làm cha mẹ & Gia đình":
      return `
👨‍👩‍👧‍👦 HƯỚNG DẪN ĐẶC BIỆT CHO KHÓA HỌC LÀM CHA MẸ:

**BẮT BUỘC phải có:**
1. **Child development**:
   - Age-appropriate expectations
   - Developmental milestones
   - Learning activities
   - Behavioral guidance

2. **Parenting techniques**:
   - Positive discipline
   - Communication strategies
   - Conflict resolution
   - Emotional support

3. **Practical management**:
   - Daily routines
   - Meal planning
   - Activity scheduling
   - Safety measures

4. **Real-life situations**:
   - Common challenges
   - Solution strategies
   - Expert advice
   - Support networks`;

    case "Tâm linh & Triết học":
      return `
🧘‍♂️ HƯỚNG DẪN ĐẶC BIỆT CHO KHÓA HỌC TÂM LINH:

**BẮT BUỘC phải có:**
1. **Philosophical concepts**:
   - Major schools of thought
   - Key principles
   - Historical context
   - Modern interpretations

2. **Practical applications**:
   - Meditation techniques
   - Mindfulness exercises
   - Self-reflection methods
   - Daily practices

3. **Wisdom traditions**:
   - Eastern philosophies
   - Western thought
   - Indigenous wisdom
   - Contemporary movements

4. **Personal growth**:
   - Self-discovery exercises
   - Transformation stories
   - Practical challenges
   - Integration strategies`;

    case "DIY & Cải thiện nhà cửa":
      return `
🔨 HƯỚNG DẪN ĐẶC BIỆT CHO KHÓA HỌC DIY:

**BẮT BUỘC phải có:**
1. **Project planning**:
   - Skill assessment
   - Material estimation
   - Timeline creation
   - Budget management

2. **Technical skills**:
   - Tool usage and safety
   - Measurement techniques
   - Assembly methods
   - Finishing touches

3. **Project examples**:
   - Step-by-step guides
   - Before/after comparisons
   - Cost breakdowns
   - Skill progression

4. **Resource management**:
   - Material sourcing
   - Tool maintenance
   - Storage solutions
   - Recycling/upcycling`;

    case "Thời trang & Làm đẹp":
      return `
💄 HƯỚNG DẪN ĐẶC BIỆT CHO KHÓA HỌC THỜI TRANG:

**BẮT BUỘC phải có:**
1. **Style principles**:
   - Color theory
   - Body type analysis
   - Wardrobe planning
   - Trend analysis

2. **Practical skills**:
   - Makeup techniques
   - Skincare routines
   - Styling methods
   - Shopping strategies

3. **Industry knowledge**:
   - Fashion history
   - Designer profiles
   - Sustainable practices
   - Career opportunities

4. **Application exercises**:
   - Personal style development
   - Makeup tutorials
   - Wardrobe audits
   - Budget planning`;

    default:
      return `
📚 HƯỚNG DẪN CHUNG:

**BẮT BUỘC phải có:**
1. **Ví dụ thực tế** (6-8 ví dụ):
   - Tình huống cụ thể
   - Cách giải quyết từng bước
   - Kết quả đạt được
   - Phân tích và bài học

2. **Bài tập thực hành** (6-8 bài):
   - Đề bài rõ ràng
   - Gợi ý cách làm
   - Hướng dẫn giải chi tiết
   - Đáp án đầy đủ

3. **Tips và tricks**:
   - Kinh nghiệm thực tế
   - Common mistakes
   - Best practices

4. **Tài liệu tham khảo**:
   - Sách nên đọc
   - Khóa học online
   - Websites hữu ích
`;
  }
}

// Get special content requirements based on course type
function getCourseTypeSpecialContent(courseType, lessonTitle) {
  switch (courseType) {
    case "Lập trình & Công nghệ":
      return `### Code Examples & Implementation
Tạo ÍT NHẤT 6-8 ví dụ code HOÀN CHỈNH với:
- Code đầy đủ, có thể chạy được
- Comment giải thích TỪNG DÒNG
- Input/Output mẫu
- Nhiều cách implement khác nhau
- So sánh performance, memory usage
- Best practices và common pitfalls
- Unit tests và error handling`;

    case "Ngoại ngữ":
      return `### Nội dung chuyên biệt cho khóa học Ngoại ngữ
**Bảng từ vựng chi tiết (ÍT NHẤT 20 từ):**
- Từ vựng với PHIÊN ÂM IPA chính xác
- Loại từ (noun, verb, adjective)
- Câu ví dụ THỰC TẾ
- Cách dùng trong giao tiếp

**Hội thoại mẫu (ÍT NHẤT 5 đoạn):**
- Tình huống: Gặp gỡ, nhà hàng, mua sắm, công việc
- Dialogue với dịch nghĩa từng câu
- Giải thích từ vựng/ngữ pháp
- Cả formal và informal

**Ngữ pháp chuyên sâu:**
- Các cấu trúc ngữ pháp liên quan
- Công thức và cách dùng
- Lỗi thường gặp và cách tránh
- Tips học ngữ pháp hiệu quả`;

    case "Kinh doanh & Marketing":
      return `### Nội dung chuyên biệt về Kinh doanh
**Case Studies thực tế:**
- 3-4 case study từ doanh nghiệp Việt Nam/Thế giới
- Phân tích SWOT chi tiết
- Số liệu cụ thể: doanh thu, ROI, market share
- Timeline và milestones
- Lessons learned

**Frameworks và Templates:**
- Business Model Canvas
- Marketing Plan template
- Financial projections
- KPI tracking sheets`;

    case "Thiết kế & Sáng tạo":
      return `### Nội dung chuyên biệt về Thiết kế
**Design Principles:**
- Contrast, Hierarchy, Balance, Repetition
- Color theory với palette cụ thể
- Typography và font pairing
- Grid systems và layouts

**Practical Examples:**
- Before/After comparisons
- Design process từ sketch → final
- Tools và software recommendations
- Resources và inspiration`;

    case "Kỹ năng mềm":
      return `### Nội dung chuyên biệt về Kỹ năng mềm
**Real-life Scenarios:**
- 5-6 tình huống công việc/cuộc sống
- Dialogue và script mẫu
- Phân tích tâm lý và hành vi
- Non-verbal communication tips

**Self-assessment Tools:**
- Checklist kỹ năng
- Action plans
- Progress tracking methods`;

    case "Dữ liệu & Phân tích":
      return `### Nội dung chuyên biệt về Dữ liệu
**Data Analysis Examples:**
- Dataset thực tế với 100+ records
- SQL/Python/R code samples
- Statistical methods explained
- Visualization examples
- Insights and interpretations`;

    case "Sức khỏe & Thể hình":
      return `### Nội dung chuyên biệt về Sức khỏe
**Exercise Routines:**
- 6-8 bài tập với hình minh họa
- Form technique và common mistakes
- Sets, reps, rest time cụ thể
- Progression plans
- Nutrition guidelines`;

    case "Âm nhạc & Nghệ thuật":
      return `### Nội dung chuyên biệt về Âm nhạc
**Technical Exercises:**
- Notation và tablature
- Practice schedules
- Common mistakes và corrections
- Performance tips
- Music theory applications`;

    case "Nhiếp ảnh & Video":
      return `### Nội dung chuyên biệt về Nhiếp ảnh
**Technical Settings:**
- Camera settings cho từng situation
- Lighting setups
- Composition rules
- Post-processing workflows
- Equipment recommendations`;

    case "Ẩm thực & Nấu ăn":
      return `### Nội dung chuyên biệt về Ẩm thực
**Công thức chi tiết (8-10 món):**
- Ingredients với số lượng chính xác
- Step-by-step instructions
- Tips cho từng bước
- Variations và substitutions

**Kỹ thuật chuyên sâu:**
- Knife skills fundamentals
- Cooking methods explained
- Flavor pairing principles
- Food safety guidelines`;

    case "Bất động sản":
      return `### Nội dung chuyên biệt về Bất động sản
**Phân tích thị trường:**
- Property valuation methods
- Market trend analysis
- ROI calculation examples
- Risk assessment frameworks

**Quy trình thực tế:**
- Step-by-step transactions
- Legal documentation
- Negotiation strategies
- Due diligence checklists`;

    case "Gaming & Esports":
      return `### Nội dung chuyên biệt về Gaming
**Game Design Elements:**
- Core mechanics analysis
- Player psychology insights
- Balance principles
- Monetization strategies

**Technical Implementation:**
- Engine comparisons
- Asset creation workflows
- Testing methodologies
- Performance optimization`;

    case "Du lịch & Khám phá":
      return `### Nội dung chuyên biệt về Du lịch
**Planning Frameworks:**
- Destination research methods
- Itinerary creation templates
- Budget optimization strategies
- Time management techniques

**Practical Guides:**
- Cultural etiquette essentials
- Safety protocols
- Emergency procedures
- Local integration tips`;

    case "Tài chính cá nhân":
      return `### Nội dung chuyên biệt về Tài chính
**Financial Planning Tools:**
- Budget creation templates
- Investment portfolio examples
- Retirement planning calculators
- Debt reduction strategies

**Investment Strategies:**
- Risk management frameworks
- Asset allocation models
- Market analysis techniques
- Passive income streams`;

    case "Làm cha mẹ & Gia đình":
      return `### Nội dung chuyên biệt về Làm cha mẹ
**Developmental Guidelines:**
- Age-specific expectations
- Milestone tracking methods
- Learning activity templates
- Behavioral management strategies

**Practical Solutions:**
- Daily routine planners
- Meal planning guides
- Activity scheduling tools
- Safety checklist templates`;

    case "Tâm linh & Triết học":
      return `### Nội dung chuyên biệt về Tâm linh
**Meditation Practices:**
- Step-by-step techniques
- Duration guidelines
- Common obstacles and solutions
- Integration with daily life

**Philosophy Applications:**
- Ancient wisdom in modern context
- Practical exercises for self-discovery
- Transformation pathways
- Community building strategies`;

    case "DIY & Cải thiện nhà cửa":
      return `### Nội dung chuyên biệt về DIY
**Project Planning:**
- Skill assessment templates
- Material calculation guides
- Timeline creation tools
- Budget tracking sheets

**Technical Skills:**
- Tool safety and maintenance
- Measurement accuracy tips
- Assembly best practices
- Finishing techniques guide`;

    case "Thời trang & Làm đẹp":
      return `### Nội dung chuyên biệt về Thời trang
**Style Development:**
- Body type analysis guides
- Color matching principles
- Wardrobe planning templates
- Budget shopping strategies

**Beauty Techniques:**
- Skincare routine builders
- Makeup application tutorials
- Product selection guides
- Seasonal adaptation tips`;

    default:
      return `### Nội dung chuyên sâu về ${lessonTitle}
- Các kỹ thuật nâng cao
- Best practices trong ngành
- Common pitfalls và cách tránh
- Resources hữu ích
- Tips từ chuyên gia`;
  }
}

function validateDocumentCompleteness(content, lessonTitle) {
  const issues = [];

  // Check minimum length - stricter now
  if (!content || content.length < MIN_CONTENT_CHARS) {
    issues.push(`Content too short: ${content?.length || 0}/${MIN_CONTENT_CHARS} characters - needs more detail`);
  }

  // Check for sufficient examples
  const exampleCount = (content?.match(/ví dụ|example|case study/gi) || []).length;
  if (exampleCount < 4) {
    issues.push(`Not enough examples: ${exampleCount}/6 - need more concrete examples`);
  }

  // Check for exercises
  const exerciseCount = (content?.match(/bài tập|exercise|practice|thực hành/gi) || []).length;
  if (exerciseCount < 3) {
    issues.push(`Not enough exercises: ${exerciseCount}/6 - need more practice problems`);
  }

  // Check for incomplete markers at the end
  const lastLine = content?.split('\n').slice(-1)[0]?.trim() || "";
  const criticalIncompleteMarkers = ["...", "•", "-", "*"];

  for (const marker of criticalIncompleteMarkers) {
    if (lastLine.endsWith(marker)) {
      issues.push(`Content appears to be cut off (ends with: ${marker})`);
      break;
    }
  }

  // Check for incomplete code blocks
  const codeBlocks = (content?.match(/```/g) || []).length;
  if (codeBlocks > 0 && codeBlocks % 2 !== 0) {
    issues.push("Unclosed code blocks: " + codeBlocks + " ``` markers");
  }

  // Check for proper ending
  const trimmed = content?.trim() || "";
  if (trimmed && trimmed.length > 100 && !trimmed.match(/[.!?\n]\s*$/)) {
    issues.push("Content doesn't end with proper punctuation");
  }

  // Check for section completeness
  const hasSummary = /tóm tắt|summary|kết luận|conclusion/gi.test(content || "");
  if (!hasSummary) {
    issues.push("Missing summary/conclusion section");
  }

  return {
    isComplete: issues.length === 0,
    issues,
    contentLength: content?.length || 0,
    exampleCount,
    exerciseCount,
  };
}

async function generateDetailedLessonDocumentWithRetry({
  lessonTitle = "",
  lessonContent = "",
  courseTitle = "",
  courseDescription = "",
  level = "Beginner",
  language = "vi",
  retryCount = 0,
  timeoutMs = BASE_TIMEOUT,
} = {}) {
  try {
    console.log(`[generateDetailedLessonDocument] Attempt ${retryCount + 1}/${MAX_RETRIES} for: ${lessonTitle}`);

    const keyTerms = extractKeyVocabulary(
      lessonContent || `${lessonTitle} ${courseTitle} ${courseDescription}`,
      12
    );

    // Detect course type for appropriate content structure
    const courseType = detectCourseType(courseTitle, courseDescription, lessonTitle);
    
    // Enhanced prompt with completeness requirements - UNIVERSAL for all course types
    const systemPrompt =
      language === "vi"
        ? `Bạn là một chuyên gia giáo dục với 15+ năm kinh nghiệm dạy học ở cấp ${level}.
Lĩnh vực chuyên môn: ${courseTitle}
Loại khóa học: ${courseType}

🎯 NHIỆM VỤ QUAN TRỌNG:
Tạo tài liệu học tập TOÀN DIỆN, CHI TIẾT, ĐẦY ĐỦ KIẾN THỨC để học viên có thể TỰ HỌC HOÀN TOÀN mà KHÔNG CẦN tài liệu bổ sung.

⚠️ QUY TẮC BẮT BUỘC (áp dụng cho MỌI loại khóa học):
1. Nội dung TỐI THIỂU 4000 ký tự - ưu tiên CHẤT LƯỢNG và ĐỘ SÂU kiến thức
2. MỖI KHÁI NIỆM phải được giải thích CHI TIẾT với:
   - Định nghĩa rõ ràng, dễ hiểu
   - Giải thích TẠI SAO quan trọng trong thực tế
   - Giải thích NHƯ THẾ NÀO áp dụng/thực hiện
   - Ví dụ CỤ THỂ phù hợp với lĩnh vực
3. PHẢI có ÍT NHẤT 6-8 ví dụ THỰC TẾ, CỤ THỂ:
   - Tình huống/bối cảnh rõ ràng
   - Cách giải quyết/áp dụng chi tiết
   - Kết quả và phân tích bài học
4. PHẢI có 6-8 bài tập/hoạt động thực hành với HƯỚNG DẪN CHI TIẾT
5. Phù hợp với đặc thù từng loại khóa học:
   - Lập trình: Code examples với giải thích từng dòng
   - Ngoại ngữ: Hội thoại, từ vựng, ngữ pháp, phát âm
   - Kinh doanh: Case studies, chiến lược, số liệu thực tế
   - Thiết kế: Hình ảnh minh họa, quy trình thiết kế
   - Kỹ năng mềm: Tình huống thực tế, roleplay
   - Khác: Điều chỉnh phù hợp với lĩnh vực
6. KHÔNG ĐƯỢC dừng giữa chừng - phải hoàn thành TẤT CẢ sections

💡 NGUYÊN TẮC TẠO NỘI DUNG:
- Viết như đang dạy 1-1 cho học viên
- Giải thích mọi thuật ngữ chuyên ngành
- Dùng ngôn ngữ đơn giản, dễ hiểu
- Liên hệ với thực tế cuộc sống/công việc
- Cung cấp tips, tricks, best practices của ngành

TRẢ VỀ JSON HOÀN CHỈNH với: title, content, summary, tags.`
        : `You are an expert educator with 15+ years of experience at the ${level} level.
Field of expertise: ${courseTitle}
Course type: ${courseType}

🎯 CRITICAL MISSION:
Create COMPREHENSIVE, DETAILED, COMPLETE educational content that enables COMPLETE SELF-LEARNING without additional resources.

⚠️ MANDATORY RULES (for ALL course types):
1. MINIMUM 4000 characters - prioritize QUALITY and DEPTH
2. EVERY CONCEPT must include:
   - Clear, easy-to-understand definition
   - WHY it matters in real-world context
   - HOW to apply/implement it
   - Concrete examples relevant to the field
3. MUST have AT LEAST 6-8 REAL-WORLD examples:
   - Clear situation/context
   - Detailed solution/application
   - Results and lessons learned
4. MUST have 6-8 exercises/activities with DETAILED guides
5. Adapt to course type specifics:
   - Programming: Code examples with line-by-line explanations
   - Languages: Dialogues, vocabulary, grammar, pronunciation
   - Business: Case studies, strategies, real data
   - Design: Visual examples, design process
   - Soft skills: Real scenarios, roleplay
   - Others: Adjust to field requirements
6. NEVER stop mid-content - complete ALL sections

Return COMPLETE JSON with: title, content, summary, tags.`;

    // Generate course-type specific examples and guidance
    const courseTypeGuidance = getCourseTypeDetailedGuidance(courseType, lessonTitle, keyTerms);

    const userPrompt =
      language === "vi"
        ? `📚 THÔNG TIN KHÓA HỌC:
Khóa học: ${courseTitle}
Mô tả: ${courseDescription}
Cấp độ: ${level}
Loại khóa học: ${courseType}
Bài học: ${lessonTitle}

📝 HƯỚNG DẪN NỘI DUNG (chỉ là gợi ý - BẠN PHẢI MỞ RỘNG TOÀN DIỆN):
${lessonContent || "Không có hướng dẫn - hãy tự tạo tài liệu HOÀN CHỈNH dựa trên tiêu đề bài học"}

🎯 TỪ KHÓA QUAN TRỌNG (phải giải thích CHI TIẾT): ${keyTerms.join(", ")}

${courseTypeGuidance}

⚠️ LƯU Ý QUAN TRỌNG:
- Nội dung hướng dẫn trên CHỈ LÀ GỢI Ý - KHÔNG ĐỦ để dạy học viên
- BẠN PHẢI TỰ NGHIÊN CỨU và BỔ SUNG KIẾN THỨC ĐẦY ĐỦ về "${lessonTitle}"
- Tài liệu phải ĐỦ CHI TIẾT để học viên TỰ HỌC HOÀN TOÀN
- KHÔNG được chỉ tóm tắt - phải GIẢI THÍCH SÂU từng khái niệm

📋 CẤU TRÚC BẮT BUỘC (MỖI SECTION PHẢI DÀI VÀ CHI TIẾT):

### 1. Giới thiệu & Tầm quan trọng (300-400 từ)
- "${lessonTitle}" là gì? Định nghĩa đầy đủ
- Tại sao quan trọng trong ${courseTitle}?
- Ứng dụng thực tế trong công việc/cuộc sống
- Lợi ích khi nắm vững kiến thức này

### 2. Kiến thức nền tảng (500-700 từ)
- Các khái niệm cơ bản cần biết trước
- Thuật ngữ và định nghĩa chi tiết
- Nguyên lý hoạt động cơ bản
- Mối liên hệ với kiến thức đã học

### 3. Kiến thức chuyên sâu (800-1000 từ)
- Giải thích CHI TIẾT từng khái niệm trong ${keyTerms.join(", ")}
- Phân tích TẠI SAO và NHƯ THẾ NÀO
- Các trường hợp đặc biệt, ngoại lệ
- So sánh các phương pháp/cách tiếp cận khác nhau
- Ưu điểm, nhược điểm của từng cách

### 4. Quy trình thực hiện chi tiết (400-600 từ)
- Các bước thực hiện CỤ THỂ từ A-Z
- Công thức, thuật toán (nếu có)
- Tips và tricks từ kinh nghiệm thực tế
- Các lỗi thường gặp và cách tránh
- Best practices trong ngành

### 5. Ví dụ thực tế (800-1000 từ - QUAN TRỌNG NHẤT)
Tạo ÍT NHẤT 6-8 ví dụ CỤ THỂ phù hợp với loại khóa học "${courseType}":

${getCourseTypeExampleGuide(courseType, lessonTitle)}

**Cấu trúc mỗi ví dụ:**
- Bối cảnh/Tình huống: [mô tả cụ thể, rõ ràng]
- Vấn đề/Mục tiêu: [cần giải quyết/đạt được gì]
- Giải pháp/Cách thực hiện: [áp dụng ${lessonTitle} từng bước chi tiết]
- Minh họa: [code/hội thoại/số liệu/hình ảnh tùy loại khóa học]
- Kết quả: [kết quả đạt được, số liệu cụ thể]
- Phân tích & Bài học: [tại sao hiệu quả, điều cần lưu ý]

**Ví dụ 1-2: Cơ bản** - Dễ hiểu, phù hợp người mới
**Ví dụ 3-4: Trung bình** - Phức tạp hơn, kết hợp nhiều yếu tố
**Ví dụ 5-6: Nâng cao** - Case study thực tế từ doanh nghiệp/chuyên gia
**Ví dụ 7-8: Đặc biệt** - Trường hợp ngoại lệ, tips nâng cao

### 6. Nội dung chuyên biệt (500-700 từ)
${getCourseTypeSpecialContent(courseType, lessonTitle)}

### 7. Bài tập thực hành (600-800 từ)
Tạo 6-8 bài tập với HƯỚNG DẪN GIẢI:

**Bài 1-2: Cơ bản**
- Đề bài: [mô tả chi tiết]
- Gợi ý: [các bước cần làm]
- Hướng dẫn giải: [giải pháp chi tiết]

**Bài 3-4: Trung bình**
[Phức tạp hơn, kết hợp nhiều kiến thức]

**Bài 5-6: Nâng cao**
[Bài tập thực tế, mở rộng]

**Bài 7-8: Thử thách**
[Bài khó, sáng tạo]

### 8. Tổng kết & Lộ trình tiếp theo (300-400 từ)
- Tóm tắt các điểm quan trọng nhất
- Checklist kiến thức cần nắm vững
- Các bước tiếp theo để học sâu hơn
- Tài liệu tham khảo bổ sung (sách, khóa học, website)
- Lời khuyên từ chuyên gia

🎯 YÊU CẦU CHẤT LƯỢNG:
✅ TỔNG ĐỘ DÀI: >= 4000 ký tự (không tính khoảng trắng)
✅ Mỗi ví dụ phải CỤ THỂ, có số liệu/code thực tế
✅ Mỗi bài tập phải có hướng dẫn giải CHI TIẾT
✅ Giải thích mọi thuật ngữ kỹ thuật
✅ Viết như đang dạy trực tiếp học viên
✅ HOÀN THÀNH TẤT CẢ sections - không bỏ sót

🚫 TUYỆT ĐỐI KHÔNG:
❌ Viết tắt hoặc bỏ qua phần nào
❌ Chỉ liệt kê bullet points mà không giải thích
❌ Ví dụ chung chung, không cụ thể
❌ Bài tập không có hướng dẫn giải
❌ Dừng giữa chừng vì hết token`
        : `📚 COURSE INFORMATION:
Course: ${courseTitle}
Description: ${courseDescription}
Level: ${level}
Lesson: ${lessonTitle}

📝 CONTENT GUIDE (only a hint - YOU MUST EXPAND COMPREHENSIVELY):
${lessonContent || "No guide - create COMPLETE content based on lesson title"}

🎯 KEY TERMS (explain in DETAIL): ${keyTerms.join(", ")}

⚠️ CRITICAL NOTES:
- Content guide above is ONLY A HINT - NOT ENOUGH to teach students
- YOU MUST RESEARCH and ADD COMPLETE KNOWLEDGE about "${lessonTitle}"
- Document must be DETAILED enough for COMPLETE SELF-LEARNING
- DO NOT just summarize - must EXPLAIN IN DEPTH each concept

📋 MANDATORY STRUCTURE (EACH SECTION MUST BE LONG AND DETAILED):

### 1. Introduction & Importance (300-400 words)
### 2. Foundation Knowledge (500-700 words)
### 3. In-Depth Knowledge (800-1000 words)
### 4. Detailed Process (400-600 words)
### 5. Real Examples (800-1000 words - MOST IMPORTANT)
   - AT LEAST 6-8 CONCRETE examples with context, solution, code, results
### 6. Code Examples (if programming - 500-700 words)
### 7. Practice Exercises (600-800 words)
   - 6-8 exercises with DETAILED solution guides
### 8. Summary & Next Steps (300-400 words)

🎯 QUALITY REQUIREMENTS:
✅ TOTAL LENGTH: >= 4000 characters
✅ Every example must be CONCRETE with real data/code
✅ Every exercise must have DETAILED solution guide
✅ Explain all technical terms
✅ COMPLETE ALL sections

🚫 NEVER:
❌ Skip or abbreviate any section
❌ Only list bullet points without explanation
❌ Generic examples without specifics
❌ Exercises without solution guides
❌ Stop mid-content due to token limits`;

    const schema = {
      title: "string",
      content: "string",
      summary: "string",
      tags: ["string"],
    };

    // Call with increased timeout and tokens
    const result = await callLLMJSON({
      system: systemPrompt,
      user: userPrompt,
      schema,
      lang: language,
      timeoutMs: timeoutMs || BASE_TIMEOUT,
      maxTokens: EXPANDED_TOKENS,
    });

    console.log(`[generateDetailedLessonDocument] Generated:`, {
      lessonTitle,
      attempt: retryCount + 1,
      contentLength: result.content?.length || 0,
      hasSummary: !!result.summary,
      tagsCount: result.tags?.length || 0,
      meetsMinLength: (result.content?.length || 0) >= MIN_CONTENT_CHARS,
      contentType: typeof result.content,
    });

    // Validate completeness
    const validation = validateDocumentCompleteness(result.content, lessonTitle);

    console.log(`[generateDetailedLessonDocument] Validation result for "${lessonTitle}":`, {
      isComplete: validation.isComplete,
      contentLength: validation.contentLength,
      issues: validation.issues,
      attempt: retryCount + 1,
    });

    if (!validation.isComplete) {
      console.warn(`[generateDetailedLessonDocument] Document incomplete:`, validation.issues);

      if (retryCount < MAX_RETRIES - 1) {
        // Retry with a more aggressive prompt
        return await generateDetailedLessonDocumentWithRetry({
          lessonTitle,
          lessonContent,
          courseTitle,
          courseDescription,
          level,
          language,
          retryCount: retryCount + 1,
          timeoutMs,
        });
      } else {
        // Last attempt - try to fix the incomplete content
        console.warn(`[generateDetailedLessonDocument] Final attempt to fix incomplete content`);
        return await attemptContentRepair(result, {
          lessonTitle,
          courseTitle,
          language,
          validation
        });
      }
    }

    return {
      title: result.title || lessonTitle,
      content: result.content || "",
      summary: result.summary || `Tài liệu chi tiết cho bài "${lessonTitle}"`,
      tags: Array.isArray(result.tags) ? result.tags : keyTerms.slice(0, 5),
    };

  } catch (err) {
    console.error(`[generateDetailedLessonDocument] Error on attempt ${retryCount + 1}:`, err.message);

    if (retryCount < MAX_RETRIES - 1) {
      console.log(`[generateDetailedLessonDocument] Retrying... (${retryCount + 1}/${MAX_RETRIES})`);
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait before retry
      return await generateDetailedLessonDocumentWithRetry({
        lessonTitle,
        lessonContent,
        courseTitle,
        courseDescription,
        level,
        language,
        retryCount: retryCount + 1,
        timeoutMs,
      });
    }

    // If all retries fail, create a comprehensive fallback
    console.warn(`[generateDetailedLessonDocument] All retries failed, creating comprehensive fallback for: ${lessonTitle}`);

    return createComprehensiveFallback({
      lessonTitle,
      lessonContent,
      courseTitle,
      courseDescription,
      level,
      language
    });
  }
}

async function attemptContentRepair(incompleteResult, { lessonTitle, courseTitle, language, validation }) {
  const repairPrompt = language === "vi"
    ? `⚠️ KHẨN CẤP - SỬA NỘI DUNG CHƯA ĐỦ CHI TIẾT:

📊 Vấn đề phát hiện:
${validation.issues.map(issue => `❌ ${issue}`).join('\n')}

📝 Nội dung hiện tại (${validation.contentLength} ký tự):
${incompleteResult.content}

🎯 YÊU CẦU BỔ SUNG:
1. ✅ Hoàn thành TẤT CẢ sections bị thiếu/cắt
2. ✅ THÊM ${Math.max(6 - (validation.exampleCount || 0), 0)} ví dụ thực tế CỤ THỂ với:
   - Bối cảnh rõ ràng
   - Giải pháp chi tiết
   - Code/số liệu thực tế
   - Kết quả và phân tích
3. ✅ THÊM ${Math.max(6 - (validation.exerciseCount || 0), 0)} bài tập với HƯỚNG DẪN GIẢI CHI TIẾT
4. ✅ MỞ RỘNG giải thích cho mỗi khái niệm (giải thích TẠI SAO, NHƯ THẾ NÀO)
5. ✅ Đảm bảo tổng độ dài >= ${MIN_CONTENT_CHARS} ký tự
6. ✅ Kết thúc với phần tóm tắt và hướng học tiếp

💡 LƯU Ý:
- Bài học: "${lessonTitle}"
- Khóa học: "${courseTitle}"
- Nội dung phải ĐỦ ĐỂ HỌC VIÊN TỰ HỌC HOÀN TOÀN
- KHÔNG được viết tắt hoặc bỏ qua phần nào

Trả về JSON HOÀN CHỈNH với: title, content, summary, tags`
    : `⚠️ URGENT - FIX INSUFFICIENT CONTENT:

📊 Issues detected:
${validation.issues.map(issue => `❌ ${issue}`).join('\n')}

📝 Current content (${validation.contentLength} chars):
${incompleteResult.content}

🎯 REQUIRED ADDITIONS:
1. ✅ Complete ALL missing/cut sections
2. ✅ ADD ${Math.max(6 - (validation.exampleCount || 0), 0)} concrete examples with context, solution, code, results
3. ✅ ADD ${Math.max(6 - (validation.exerciseCount || 0), 0)} exercises with DETAILED solution guides
4. ✅ EXPAND explanations (explain WHY and HOW)
5. ✅ Ensure total length >= ${MIN_CONTENT_CHARS} characters
6. ✅ End with summary and next steps

Return COMPLETE JSON with: title, content, summary, tags`;

  try {
    const repairedResult = await callLLMJSON({
      system: language === "vi" 
        ? "Bạn là chuyên gia giáo dục chuyên sửa và bổ sung nội dung học tập. Nhiệm vụ: tạo tài liệu HOÀN CHỈNH, CHI TIẾT, ĐẦY ĐỦ KIẾN THỨC."
        : "You are an expert educator specializing in fixing and expanding educational content. Mission: create COMPLETE, DETAILED, COMPREHENSIVE content.",
      user: repairPrompt,
      schema: { title: "string", content: "string", summary: "string", tags: ["string"] },
      lang: language,
      timeoutMs: BASE_TIMEOUT,
      maxTokens: EXPANDED_TOKENS,
    });

    const finalValidation = validateDocumentCompleteness(repairedResult.content, lessonTitle);

    console.log(`[attemptContentRepair] Repair result:`, {
      originalLength: validation.contentLength,
      repairedLength: finalValidation.contentLength,
      isComplete: finalValidation.isComplete,
      remainingIssues: finalValidation.issues,
    });

    if (finalValidation.isComplete || finalValidation.contentLength > validation.contentLength * 1.5) {
      console.log(`[attemptContentRepair] ✅ Content repaired successfully`);
      return {
        title: repairedResult.title || incompleteResult.title || lessonTitle,
        content: repairedResult.content,
        summary: repairedResult.summary || incompleteResult.summary,
        tags: Array.isArray(repairedResult.tags) ? repairedResult.tags : incompleteResult.tags || [],
      };
    }
  } catch (err) {
    console.error(`[attemptContentRepair] Failed to repair content:`, err.message);
  }

  // If repair failed, return the original with a note
  return {
    ...incompleteResult,
    content: incompleteResult.content + "\n\n⚠️ *Lưu ý: Nội dung này có thể chưa đủ chi tiết do giới hạn kỹ thuật. Vui lòng làm mới trang để thử lại hoặc liên hệ giảng viên để bổ sung.*",
    summary: (incompleteResult.summary || "") + " [Có thể chưa đủ chi tiết]",
  };
}

// Function with custom timeout for streaming operations
async function generateDetailedLessonDocumentWithTimeout({
  lessonTitle = "",
  lessonContent = "",
  courseTitle = "",
  courseDescription = "",
  level = "Beginner",
  language = "vi",
  timeoutMs = BASE_TIMEOUT,
} = {}) {
  return await generateDetailedLessonDocumentWithRetry({
    lessonTitle,
    lessonContent,
    courseTitle,
    courseDescription,
    level,
    language,
    retryCount: 0,
    timeoutMs,
  });
}

// Create comprehensive fallback when AI completely fails
function createComprehensiveFallback({ lessonTitle, lessonContent, courseTitle, courseDescription, level, language }) {
  const keyTerms = extractKeyVocabulary(
    lessonContent || `${lessonTitle} ${courseTitle} ${courseDescription}`,
    10
  );

  if (language === "vi") {
    return generateVietnameseFallbackContent({ lessonTitle, lessonContent, courseTitle, courseDescription, level, keyTerms });
  } else {
    return generateEnglishFallbackContent({ lessonTitle, lessonContent, courseTitle, courseDescription, level, keyTerms });
  }
}

// Check if it's a language learning course
function isLanguageCourse(courseTitle, lessonTitle) {
  const text = `${courseTitle} ${lessonTitle}`.toLowerCase();
  return /tiếng\s*(anh|việt|trung|nhật|hàn|pháp|đức)|english|chinese|japanese|korean|french|german|vocabulary|từ\s*vựng|ngữ\s*pháp|grammar|ielts|toeic|toefl|speaking|listening|reading|writing|hội\s*thoại|giao\s*tiếp/i.test(text);
}

// Generate language course specific fallback content
function generateLanguageCourseFallback({ lessonTitle, lessonContent, courseTitle, level, keyTerms }) {
  let content = `# ${lessonTitle}\n\n`;
  content += `> 📚 **Khóa học:** ${courseTitle} | **Cấp độ:** ${level}\n\n`;

  // Determine target language
  const isEnglish = /tiếng\s*anh|english/i.test(courseTitle);
  const targetLang = isEnglish ? "tiếng Anh" : "ngoại ngữ";

  content += `## 🎯 Mục tiêu bài học\n\n`;
  content += `Sau khi hoàn thành bài học **"${lessonTitle}"**, bạn sẽ:\n`;
  content += `- ✅ Nắm vững từ vựng và cụm từ quan trọng về chủ đề này\n`;
  content += `- ✅ Biết cách phát âm đúng và tự nhiên\n`;
  content += `- ✅ Sử dụng được trong giao tiếp hàng ngày\n`;
  content += `- ✅ Hiểu khi nghe người bản xứ nói\n\n`;

  content += `---\n\n`;
  content += `## 📖 Từ vựng chính (Key Vocabulary)\n\n`;
  
  // Generate vocabulary based on lesson title
  if (/giới thiệu|introduce|introduction/i.test(lessonTitle)) {
    content += `| Từ vựng | Phiên âm | Nghĩa | Ví dụ |\n`;
    content += `|---------|----------|-------|-------|\n`;
    content += `| Hello | /həˈloʊ/ | Xin chào | Hello, nice to meet you! |\n`;
    content += `| My name is... | /maɪ neɪm ɪz/ | Tên tôi là... | My name is Minh. |\n`;
    content += `| I am from... | /aɪ æm frɒm/ | Tôi đến từ... | I am from Vietnam. |\n`;
    content += `| Nice to meet you | /naɪs tuː miːt juː/ | Rất vui được gặp bạn | Nice to meet you too! |\n`;
    content += `| How are you? | /haʊ ɑːr juː/ | Bạn khỏe không? | How are you today? |\n`;
    content += `| I'm fine, thank you | /aɪm faɪn θæŋk juː/ | Tôi khỏe, cảm ơn | I'm fine, thank you. And you? |\n`;
    content += `| What's your name? | /wɒts jɔːr neɪm/ | Tên bạn là gì? | What's your name? |\n`;
    content += `| Where are you from? | /weər ɑːr juː frɒm/ | Bạn đến từ đâu? | Where are you from? |\n`;
    content += `| I'm a student | /aɪm ə ˈstjuːdənt/ | Tôi là sinh viên | I'm a student at Hanoi University. |\n`;
    content += `| This is... | /ðɪs ɪz/ | Đây là... | This is my friend, Lan. |\n\n`;

    content += `### 🗣️ Cụm từ giao tiếp (Useful Phrases)\n\n`;
    content += `| Cụm từ | Cách dùng | Ngữ cảnh |\n`;
    content += `|--------|-----------|----------|\n`;
    content += `| Let me introduce myself | Để tôi tự giới thiệu | Formal - trong cuộc họp, phỏng vấn |\n`;
    content += `| I'd like you to meet... | Tôi muốn giới thiệu bạn với... | Giới thiệu người khác |\n`;
    content += `| Pleased to meet you | Hân hạnh được gặp bạn | Formal - lịch sự hơn "Nice to meet you" |\n`;
    content += `| Call me... | Gọi tôi là... | Informal - thân mật |\n\n`;
  } else if (/thời tiết|weather/i.test(lessonTitle)) {
    content += `| Từ vựng | Phiên âm | Nghĩa | Ví dụ |\n`;
    content += `|---------|----------|-------|-------|\n`;
    content += `| weather | /ˈweðər/ | thời tiết | What's the weather like today? |\n`;
    content += `| sunny | /ˈsʌni/ | nắng, có nắng | It's sunny today. |\n`;
    content += `| rainy | /ˈreɪni/ | mưa, có mưa | It's rainy outside. |\n`;
    content += `| cloudy | /ˈklaʊdi/ | nhiều mây | The sky is cloudy. |\n`;
    content += `| windy | /ˈwɪndi/ | có gió | It's very windy today. |\n`;
    content += `| snowy | /ˈsnoʊi/ | có tuyết | It's snowy in winter. |\n`;
    content += `| hot | /hɑːt/ | nóng | It's hot in summer. |\n`;
    content += `| cold | /koʊld/ | lạnh | It's cold in winter. |\n`;
    content += `| warm | /wɔːrm/ | ấm áp | The weather is warm today. |\n`;
    content += `| cool | /kuːl/ | mát mẻ | It's cool in the evening. |\n`;
    content += `| humid | /ˈhjuːmɪd/ | ẩm ướt | Vietnam is very humid. |\n`;
    content += `| foggy | /ˈfɑːɡi/ | có sương mù | It's foggy this morning. |\n`;
    content += `| storm | /stɔːrm/ | bão | There's a storm coming. |\n`;
    content += `| thunder | /ˈθʌndər/ | sấm | I heard thunder last night. |\n`;
    content += `| lightning | /ˈlaɪtnɪŋ/ | chớp, sét | Lightning is dangerous. |\n\n`;
  } else if (/gia đình|family/i.test(lessonTitle)) {
    content += `| Từ vựng | Phiên âm | Nghĩa | Ví dụ |\n`;
    content += `|---------|----------|-------|-------|\n`;
    content += `| family | /ˈfæməli/ | gia đình | I love my family. |\n`;
    content += `| father | /ˈfɑːðər/ | bố, cha | My father is a doctor. |\n`;
    content += `| mother | /ˈmʌðər/ | mẹ | My mother cooks well. |\n`;
    content += `| parents | /ˈperənts/ | bố mẹ | My parents live in Hanoi. |\n`;
    content += `| brother | /ˈbrʌðər/ | anh/em trai | I have one brother. |\n`;
    content += `| sister | /ˈsɪstər/ | chị/em gái | My sister is a teacher. |\n`;
    content += `| grandfather | /ˈɡrænfɑːðər/ | ông | My grandfather is 80 years old. |\n`;
    content += `| grandmother | /ˈɡrænmʌðər/ | bà | My grandmother makes great food. |\n`;
    content += `| uncle | /ˈʌŋkl/ | chú, bác, cậu | My uncle lives in America. |\n`;
    content += `| aunt | /ænt/ | cô, dì, thím | My aunt is very kind. |\n`;
    content += `| cousin | /ˈkʌzn/ | anh/chị/em họ | I have many cousins. |\n`;
    content += `| husband | /ˈhʌzbənd/ | chồng | Her husband is a pilot. |\n`;
    content += `| wife | /waɪf/ | vợ | His wife is a nurse. |\n`;
    content += `| son | /sʌn/ | con trai | They have one son. |\n`;
    content += `| daughter | /ˈdɔːtər/ | con gái | Their daughter is 5 years old. |\n\n`;
  } else if (/số|number|đếm|count/i.test(lessonTitle)) {
    content += `| Từ vựng | Phiên âm | Nghĩa | Ví dụ |\n`;
    content += `|---------|----------|-------|-------|\n`;
    content += `| one | /wʌn/ | một | I have one book. |\n`;
    content += `| two | /tuː/ | hai | She has two cats. |\n`;
    content += `| three | /θriː/ | ba | There are three apples. |\n`;
    content += `| four | /fɔːr/ | bốn | I need four chairs. |\n`;
    content += `| five | /faɪv/ | năm | Five plus five is ten. |\n`;
    content += `| six | /sɪks/ | sáu | There are six days left. |\n`;
    content += `| seven | /ˈsevn/ | bảy | Seven is my lucky number. |\n`;
    content += `| eight | /eɪt/ | tám | I wake up at eight. |\n`;
    content += `| nine | /naɪn/ | chín | Nine students are absent. |\n`;
    content += `| ten | /ten/ | mười | I have ten fingers. |\n`;
    content += `| eleven | /ɪˈlevn/ | mười một | Eleven plus one is twelve. |\n`;
    content += `| twelve | /twelv/ | mười hai | There are twelve months. |\n`;
    content += `| twenty | /ˈtwenti/ | hai mươi | I am twenty years old. |\n`;
    content += `| hundred | /ˈhʌndrəd/ | một trăm | One hundred percent! |\n`;
    content += `| thousand | /ˈθaʊznd/ | một nghìn | A thousand thanks! |\n\n`;
  } else if (/màu|color|colour/i.test(lessonTitle)) {
    content += `| Từ vựng | Phiên âm | Nghĩa | Ví dụ |\n`;
    content += `|---------|----------|-------|-------|\n`;
    content += `| red | /red/ | màu đỏ | The apple is red. |\n`;
    content += `| blue | /bluː/ | màu xanh dương | The sky is blue. |\n`;
    content += `| green | /ɡriːn/ | màu xanh lá | Grass is green. |\n`;
    content += `| yellow | /ˈjeloʊ/ | màu vàng | Bananas are yellow. |\n`;
    content += `| orange | /ˈɔːrɪndʒ/ | màu cam | I like orange color. |\n`;
    content += `| purple | /ˈpɜːrpl/ | màu tím | Purple is my favorite. |\n`;
    content += `| pink | /pɪŋk/ | màu hồng | She wears a pink dress. |\n`;
    content += `| black | /blæk/ | màu đen | My car is black. |\n`;
    content += `| white | /waɪt/ | màu trắng | Snow is white. |\n`;
    content += `| brown | /braʊn/ | màu nâu | The table is brown. |\n`;
    content += `| gray/grey | /ɡreɪ/ | màu xám | The elephant is gray. |\n`;
    content += `| gold | /ɡoʊld/ | màu vàng kim | She has gold earrings. |\n`;
    content += `| silver | /ˈsɪlvər/ | màu bạc | The ring is silver. |\n\n`;
  } else if (/thức ăn|food|đồ ăn|ẩm thực/i.test(lessonTitle)) {
    content += `| Từ vựng | Phiên âm | Nghĩa | Ví dụ |\n`;
    content += `|---------|----------|-------|-------|\n`;
    content += `| food | /fuːd/ | thức ăn | Vietnamese food is delicious. |\n`;
    content += `| rice | /raɪs/ | cơm, gạo | I eat rice every day. |\n`;
    content += `| bread | /bred/ | bánh mì | I have bread for breakfast. |\n`;
    content += `| meat | /miːt/ | thịt | I don't eat much meat. |\n`;
    content += `| chicken | /ˈtʃɪkɪn/ | thịt gà | Fried chicken is popular. |\n`;
    content += `| beef | /biːf/ | thịt bò | Beef pho is famous. |\n`;
    content += `| pork | /pɔːrk/ | thịt heo | Pork is common in Vietnam. |\n`;
    content += `| fish | /fɪʃ/ | cá | I like grilled fish. |\n`;
    content += `| vegetable | /ˈvedʒtəbl/ | rau | Eat more vegetables! |\n`;
    content += `| fruit | /fruːt/ | trái cây | Tropical fruits are sweet. |\n`;
    content += `| egg | /eɡ/ | trứng | I eat eggs for breakfast. |\n`;
    content += `| soup | /suːp/ | súp, canh | Pho is a type of soup. |\n`;
    content += `| noodle | /ˈnuːdl/ | mì, bún, phở | I love noodle dishes. |\n`;
    content += `| drink | /drɪŋk/ | đồ uống | What would you like to drink? |\n`;
    content += `| water | /ˈwɔːtər/ | nước | Please give me some water. |\n\n`;
  } else if (/động vật|animal/i.test(lessonTitle)) {
    content += `| Từ vựng | Phiên âm | Nghĩa | Ví dụ |\n`;
    content += `|---------|----------|-------|-------|\n`;
    content += `| animal | /ˈænɪml/ | động vật | I love animals. |\n`;
    content += `| dog | /dɔːɡ/ | con chó | My dog is friendly. |\n`;
    content += `| cat | /kæt/ | con mèo | Cats are cute. |\n`;
    content += `| bird | /bɜːrd/ | con chim | Birds can fly. |\n`;
    content += `| fish | /fɪʃ/ | con cá | Fish live in water. |\n`;
    content += `| elephant | /ˈelɪfənt/ | con voi | Elephants are big. |\n`;
    content += `| lion | /ˈlaɪən/ | con sư tử | Lions are called kings. |\n`;
    content += `| tiger | /ˈtaɪɡər/ | con hổ | Tigers are endangered. |\n`;
    content += `| monkey | /ˈmʌŋki/ | con khỉ | Monkeys are smart. |\n`;
    content += `| rabbit | /ˈræbɪt/ | con thỏ | Rabbits eat carrots. |\n`;
    content += `| horse | /hɔːrs/ | con ngựa | Horses run fast. |\n`;
    content += `| cow | /kaʊ/ | con bò | Cows give us milk. |\n`;
    content += `| pig | /pɪɡ/ | con heo | Pigs are farm animals. |\n`;
    content += `| chicken | /ˈtʃɪkɪn/ | con gà | Chickens lay eggs. |\n`;
    content += `| duck | /dʌk/ | con vịt | Ducks can swim. |\n\n`;
  } else {
    // Generic vocabulary section with better content
    content += `| Từ vựng | Phiên âm | Nghĩa | Ví dụ |\n`;
    content += `|---------|----------|-------|-------|\n`;
    content += `| learn | /lɜːrn/ | học | I learn English every day. |\n`;
    content += `| study | /ˈstʌdi/ | học tập | I study at home. |\n`;
    content += `| practice | /ˈpræktɪs/ | luyện tập | Practice makes perfect. |\n`;
    content += `| speak | /spiːk/ | nói | Can you speak English? |\n`;
    content += `| listen | /ˈlɪsn/ | nghe | Listen carefully. |\n`;
    content += `| read | /riːd/ | đọc | I read books every night. |\n`;
    content += `| write | /raɪt/ | viết | Please write your name. |\n`;
    content += `| understand | /ˌʌndərˈstænd/ | hiểu | Do you understand? |\n`;
    content += `| remember | /rɪˈmembər/ | nhớ | Remember this word. |\n`;
    content += `| repeat | /rɪˈpiːt/ | lặp lại | Please repeat after me. |\n`;
    content += `| word | /wɜːrd/ | từ | Learn new words daily. |\n`;
    content += `| sentence | /ˈsentəns/ | câu | Make a sentence. |\n`;
    content += `| vocabulary | /voʊˈkæbjəleri/ | từ vựng | Build your vocabulary. |\n`;
    content += `| grammar | /ˈɡræmər/ | ngữ pháp | Grammar is important. |\n`;
    content += `| pronunciation | /prəˌnʌnsiˈeɪʃn/ | phát âm | Work on pronunciation. |\n\n`;
  }

  content += `---\n\n`;
  content += `## 💬 Hội thoại mẫu (Sample Dialogues)\n\n`;

  if (/giới thiệu|introduce/i.test(lessonTitle)) {
    content += `### Hội thoại 1: Gặp gỡ lần đầu (First Meeting)\n\n`;
    content += `> **Tình huống:** Hai sinh viên gặp nhau trong ngày đầu tiên ở trường đại học.\n\n`;
    content += `\`\`\`\n`;
    content += `A: Hi! I'm Minh. What's your name?\n`;
    content += `   (Chào! Mình là Minh. Bạn tên gì?)\n\n`;
    content += `B: Hi Minh! My name is Lan. Nice to meet you!\n`;
    content += `   (Chào Minh! Mình tên Lan. Rất vui được gặp bạn!)\n\n`;
    content += `A: Nice to meet you too! Are you a first-year student?\n`;
    content += `   (Mình cũng rất vui! Bạn là sinh viên năm nhất à?)\n\n`;
    content += `B: Yes, I am. I'm studying Business Administration. How about you?\n`;
    content += `   (Đúng rồi. Mình học Quản trị Kinh doanh. Còn bạn?)\n\n`;
    content += `A: I'm studying Computer Science. Where are you from?\n`;
    content += `   (Mình học Khoa học Máy tính. Bạn đến từ đâu?)\n\n`;
    content += `B: I'm from Da Nang. And you?\n`;
    content += `   (Mình đến từ Đà Nẵng. Còn bạn?)\n\n`;
    content += `A: I'm from Hanoi. Do you live in the dormitory?\n`;
    content += `   (Mình đến từ Hà Nội. Bạn ở ký túc xá không?)\n\n`;
    content += `B: Yes, I do. It's nice to have a friend here!\n`;
    content += `   (Có. Thật tuyệt khi có bạn ở đây!)\n`;
    content += `\`\`\`\n\n`;

    content += `### Hội thoại 2: Giới thiệu người khác (Introducing Others)\n\n`;
    content += `> **Tình huống:** Minh giới thiệu Lan với bạn cùng phòng của mình.\n\n`;
    content += `\`\`\`\n`;
    content += `Minh: Hey Tuan! This is my new friend, Lan.\n`;
    content += `      (Này Tuấn! Đây là bạn mới của mình, Lan.)\n\n`;
    content += `Tuan: Hi Lan! I'm Tuan, Minh's roommate. Nice to meet you!\n`;
    content += `      (Chào Lan! Mình là Tuấn, bạn cùng phòng của Minh. Rất vui được gặp bạn!)\n\n`;
    content += `Lan: Nice to meet you too, Tuan! Minh told me about you.\n`;
    content += `     (Mình cũng rất vui được gặp bạn, Tuấn! Minh có kể về bạn.)\n\n`;
    content += `Tuan: All good things, I hope! What are you studying?\n`;
    content += `      (Hy vọng là những điều tốt đẹp! Bạn học ngành gì?)\n\n`;
    content += `Lan: Business Administration. I heard you're also in the IT field?\n`;
    content += `     (Quản trị Kinh doanh. Mình nghe nói bạn cũng học IT?)\n\n`;
    content += `Tuan: Yes, I'm studying Software Engineering. We should hang out sometime!\n`;
    content += `      (Đúng rồi, mình học Kỹ thuật Phần mềm. Chúng ta nên đi chơi cùng nhau!)\n`;
    content += `\`\`\`\n\n`;

    content += `### Hội thoại 3: Tình huống formal (Formal Introduction)\n\n`;
    content += `> **Tình huống:** Phỏng vấn xin việc.\n\n`;
    content += `\`\`\`\n`;
    content += `Interviewer: Good morning! Please have a seat. Could you introduce yourself?\n`;
    content += `             (Chào buổi sáng! Mời ngồi. Bạn có thể giới thiệu về bản thân không?)\n\n`;
    content += `Candidate: Good morning! Thank you. My name is Nguyen Van Minh.\n`;
    content += `           I'm 22 years old and I recently graduated from Hanoi University\n`;
    content += `           with a degree in Computer Science.\n`;
    content += `           (Chào buổi sáng! Cảm ơn. Tên tôi là Nguyễn Văn Minh.\n`;
    content += `           Tôi 22 tuổi và vừa tốt nghiệp Đại học Hà Nội\n`;
    content += `           chuyên ngành Khoa học Máy tính.)\n\n`;
    content += `Interviewer: That's great. What are your strengths?\n`;
    content += `             (Tuyệt vời. Điểm mạnh của bạn là gì?)\n\n`;
    content += `Candidate: I'm a quick learner and I work well in a team.\n`;
    content += `           I'm also passionate about technology and problem-solving.\n`;
    content += `           (Tôi học hỏi nhanh và làm việc nhóm tốt.\n`;
    content += `           Tôi cũng đam mê công nghệ và giải quyết vấn đề.)\n`;
    content += `\`\`\`\n\n`;
  } else if (/thời tiết|weather/i.test(lessonTitle)) {
    content += `### Hội thoại 1: Hỏi về thời tiết\n\n`;
    content += `> **Tình huống:** Hai người bạn nói chuyện về thời tiết.\n\n`;
    content += `\`\`\`\n`;
    content += `A: What's the weather like today?\n`;
    content += `   (Thời tiết hôm nay thế nào?)\n\n`;
    content += `B: It's sunny and warm. Perfect for a picnic!\n`;
    content += `   (Trời nắng và ấm. Hoàn hảo để đi picnic!)\n\n`;
    content += `A: That sounds great! What about tomorrow?\n`;
    content += `   (Nghe tuyệt đấy! Còn ngày mai thì sao?)\n\n`;
    content += `B: The forecast says it will be rainy.\n`;
    content += `   (Dự báo nói là sẽ có mưa.)\n\n`;
    content += `A: Oh no! I should bring an umbrella then.\n`;
    content += `   (Ôi không! Vậy tôi nên mang ô theo.)\n`;
    content += `\`\`\`\n\n`;

    content += `### Hội thoại 2: Thời tiết theo mùa\n\n`;
    content += `> **Tình huống:** Nói về thời tiết ở Việt Nam.\n\n`;
    content += `\`\`\`\n`;
    content += `A: How's the weather in Vietnam?\n`;
    content += `   (Thời tiết ở Việt Nam thế nào?)\n\n`;
    content += `B: It depends on the region. The North has four seasons.\n`;
    content += `   (Tùy thuộc vào vùng. Miền Bắc có bốn mùa.)\n\n`;
    content += `A: What about the South?\n`;
    content += `   (Còn miền Nam thì sao?)\n\n`;
    content += `B: The South is hot and humid all year round.\n`;
    content += `   (Miền Nam nóng và ẩm quanh năm.)\n`;
    content += `\`\`\`\n\n`;
  } else if (/gia đình|family/i.test(lessonTitle)) {
    content += `### Hội thoại 1: Giới thiệu gia đình\n\n`;
    content += `> **Tình huống:** Nói về gia đình của mình.\n\n`;
    content += `\`\`\`\n`;
    content += `A: Tell me about your family.\n`;
    content += `   (Kể cho tôi nghe về gia đình bạn đi.)\n\n`;
    content += `B: I have a small family. There are four people.\n`;
    content += `   (Gia đình tôi nhỏ. Có bốn người.)\n\n`;
    content += `A: Who are they?\n`;
    content += `   (Họ là ai?)\n\n`;
    content += `B: My parents, my younger sister, and me.\n`;
    content += `   (Bố mẹ tôi, em gái tôi, và tôi.)\n\n`;
    content += `A: What does your father do?\n`;
    content += `   (Bố bạn làm nghề gì?)\n\n`;
    content += `B: He's a teacher. My mother is a nurse.\n`;
    content += `   (Ông ấy là giáo viên. Mẹ tôi là y tá.)\n`;
    content += `\`\`\`\n\n`;
  } else if (/thức ăn|food|đồ ăn/i.test(lessonTitle)) {
    content += `### Hội thoại 1: Gọi món ở nhà hàng\n\n`;
    content += `> **Tình huống:** Gọi món tại nhà hàng.\n\n`;
    content += `\`\`\`\n`;
    content += `Waiter: Are you ready to order?\n`;
    content += `        (Quý khách sẵn sàng gọi món chưa?)\n\n`;
    content += `Customer: Yes, I'd like pho bo, please.\n`;
    content += `          (Vâng, cho tôi phở bò.)\n\n`;
    content += `Waiter: Would you like anything to drink?\n`;
    content += `        (Quý khách muốn uống gì không?)\n\n`;
    content += `Customer: Just water, please.\n`;
    content += `          (Chỉ nước lọc thôi.)\n\n`;
    content += `Waiter: Anything else?\n`;
    content += `        (Còn gì nữa không ạ?)\n\n`;
    content += `Customer: No, that's all. Thank you!\n`;
    content += `          (Không, vậy thôi. Cảm ơn!)\n`;
    content += `\`\`\`\n\n`;
  } else {
    content += `### Hội thoại mẫu: Luyện tập từ vựng\n\n`;
    content += `> **Tình huống:** Hai bạn học tiếng Anh cùng nhau.\n\n`;
    content += `\`\`\`\n`;
    content += `A: How do you say "xin chào" in English?\n`;
    content += `   (Bạn nói "xin chào" bằng tiếng Anh như thế nào?)\n\n`;
    content += `B: You say "Hello" or "Hi".\n`;
    content += `   (Bạn nói "Hello" hoặc "Hi".)\n\n`;
    content += `A: Can you repeat that, please?\n`;
    content += `   (Bạn có thể lặp lại được không?)\n\n`;
    content += `B: Sure! Hello - H-E-L-L-O.\n`;
    content += `   (Được chứ! Hello - H-E-L-L-O.)\n\n`;
    content += `A: Thank you! I understand now.\n`;
    content += `   (Cảm ơn bạn! Giờ tôi hiểu rồi.)\n\n`;
    content += `B: You're welcome! Let's practice more.\n`;
    content += `   (Không có gì! Hãy luyện tập thêm nào.)\n`;
    content += `\`\`\`\n\n`;
  }

  content += `---\n\n`;
  content += `## 📝 Ngữ pháp liên quan (Related Grammar)\n\n`;

  if (/giới thiệu|introduce/i.test(lessonTitle)) {
    content += `### 1. Cấu trúc "to be" (am/is/are)\n\n`;
    content += `| Chủ ngữ | To be | Ví dụ |\n`;
    content += `|---------|-------|-------|\n`;
    content += `| I | am | I **am** a student. |\n`;
    content += `| You/We/They | are | You **are** from Vietnam. |\n`;
    content += `| He/She/It | is | She **is** my friend. |\n\n`;

    content += `### 2. Câu hỏi với "What" và "Where"\n\n`;
    content += `- **What's your name?** → My name is [tên].\n`;
    content += `- **What do you do?** → I'm a [nghề nghiệp].\n`;
    content += `- **Where are you from?** → I'm from [địa điểm].\n`;
    content += `- **Where do you live?** → I live in [địa điểm].\n\n`;

    content += `### 3. Đại từ sở hữu (Possessive Pronouns)\n\n`;
    content += `| Đại từ nhân xưng | Tính từ sở hữu | Ví dụ |\n`;
    content += `|------------------|----------------|-------|\n`;
    content += `| I | my | **My** name is Minh. |\n`;
    content += `| You | your | What's **your** name? |\n`;
    content += `| He | his | **His** name is Tuan. |\n`;
    content += `| She | her | **Her** name is Lan. |\n`;
    content += `| We | our | **Our** class is fun. |\n`;
    content += `| They | their | **Their** school is big. |\n\n`;
  }

  content += `---\n\n`;
  content += `## 🎧 Luyện phát âm (Pronunciation Practice)\n\n`;

  if (/giới thiệu|introduce/i.test(lessonTitle)) {
    content += `### Âm cần chú ý:\n\n`;
    content += `| Từ | Phiên âm | Lưu ý |\n`;
    content += `|----|----------|-------|\n`;
    content += `| name | /neɪm/ | Âm "a" đọc là /eɪ/, không phải /æ/ |\n`;
    content += `| nice | /naɪs/ | Âm "i" đọc là /aɪ/ |\n`;
    content += `| meet | /miːt/ | Âm "ee" kéo dài /iː/ |\n`;
    content += `| from | /frɒm/ | Âm "o" ngắn /ɒ/ |\n`;
    content += `| student | /ˈstjuːdənt/ | Nhấn âm đầu, "u" đọc /juː/ |\n\n`;

    content += `### Tips phát âm:\n`;
    content += `- 🔊 **Intonation:** Câu hỏi Yes/No lên giọng cuối câu, câu hỏi Wh- xuống giọng\n`;
    content += `- 🔊 **Linking:** "Nice to meet you" → /naɪs tə miːtʃuː/ (nối âm)\n`;
    content += `- 🔊 **Stress:** "introduce" nhấn âm thứ 3: in-tro-**DUCE**\n\n`;
  }

  content += `---\n\n`;
  content += `## ✏️ Bài tập thực hành (Practice Exercises)\n\n`;

  content += `### Bài 1: Điền từ vào chỗ trống (Fill in the blanks)\n\n`;
  content += `1. Hello! My _______ is Lan. (name/names)\n`;
  content += `2. Nice to _______ you! (meet/meeting)\n`;
  content += `3. I _______ from Vietnam. (am/is)\n`;
  content += `4. What's _______ name? (you/your)\n`;
  content += `5. _______ is my friend, Minh. (This/These)\n\n`;

  content += `<details>\n<summary>📝 Đáp án</summary>\n\n`;
  content += `1. name\n2. meet\n3. am\n4. your\n5. This\n`;
  content += `</details>\n\n`;

  content += `### Bài 2: Sắp xếp từ thành câu (Rearrange the words)\n\n`;
  content += `1. name / What's / your / ?\n`;
  content += `2. am / I / student / a / .\n`;
  content += `3. from / Where / you / are / ?\n`;
  content += `4. meet / Nice / you / to / !\n`;
  content += `5. is / This / friend / my / .\n\n`;

  content += `<details>\n<summary>📝 Đáp án</summary>\n\n`;
  content += `1. What's your name?\n`;
  content += `2. I am a student.\n`;
  content += `3. Where are you from?\n`;
  content += `4. Nice to meet you!\n`;
  content += `5. This is my friend.\n`;
  content += `</details>\n\n`;

  content += `### Bài 3: Viết đoạn giới thiệu bản thân (Write about yourself)\n\n`;
  content += `Viết một đoạn văn ngắn (5-7 câu) giới thiệu bản thân bằng tiếng Anh, bao gồm:\n`;
  content += `- Tên của bạn\n`;
  content += `- Tuổi\n`;
  content += `- Quê quán\n`;
  content += `- Nghề nghiệp/Ngành học\n`;
  content += `- Sở thích\n\n`;

  content += `**Mẫu:**\n`;
  content += `> Hello! My name is [Tên]. I am [tuổi] years old. I am from [quê]. I am a [nghề/sinh viên]. I like [sở thích]. Nice to meet you!\n\n`;

  content += `### Bài 4: Luyện nói (Speaking Practice)\n\n`;
  content += `Thực hành với bạn hoặc tự nói trước gương:\n`;
  content += `1. Giới thiệu bản thân trong 30 giây\n`;
  content += `2. Giới thiệu một người bạn\n`;
  content += `3. Hỏi và trả lời về thông tin cá nhân\n\n`;

  content += `---\n\n`;
  content += `## 📌 Tóm tắt bài học (Summary)\n\n`;

  content += `### Từ vựng cần nhớ:\n`;
  content += `- Hello, Hi, Good morning/afternoon/evening\n`;
  content += `- My name is... / I'm...\n`;
  content += `- Nice to meet you / Pleased to meet you\n`;
  content += `- What's your name? / Where are you from?\n`;
  content += `- This is... (giới thiệu người khác)\n\n`;

  content += `### Cấu trúc quan trọng:\n`;
  content += `- **I am** + danh từ/tính từ\n`;
  content += `- **My name is** + tên\n`;
  content += `- **I'm from** + địa điểm\n`;
  content += `- **This is** + tên người\n\n`;

  content += `### Tips ghi nhớ:\n`;
  content += `- 💡 Luyện tập mỗi ngày 10-15 phút\n`;
  content += `- 💡 Nói to thành tiếng, không chỉ đọc thầm\n`;
  content += `- 💡 Ghi âm và nghe lại để cải thiện phát âm\n`;
  content += `- 💡 Thực hành với bạn bè hoặc qua app\n\n`;

  // Add original content if available
  if (lessonContent && lessonContent.length > 50) {
    content += `---\n\n## 📚 Nội dung bổ sung từ khóa học\n\n${lessonContent}\n`;
  }

  return {
    title: lessonTitle,
    content,
    summary: `Bài học về ${lessonTitle} trong khóa ${courseTitle}. Bao gồm từ vựng, hội thoại mẫu, ngữ pháp và bài tập thực hành.`,
    tags: ["vocabulary", "conversation", "grammar", ...keyTerms.slice(0, 3)],
  };
}

function generateVietnameseFallbackContent({ lessonTitle, lessonContent, courseTitle, courseDescription, level, keyTerms }) {
  // Check if it's a language course - use specialized content
  if (isLanguageCourse(courseTitle, lessonTitle)) {
    return generateLanguageCourseFallback({ lessonTitle, lessonContent, courseTitle, level, keyTerms });
  }

  // Extract concepts from title for more relevant content
  const concepts = extractKeyConceptsFromTitle(lessonTitle);
  const isProgramming = isProgrammingCourse(courseTitle, lessonTitle);

  let content = `# ${lessonTitle}\n\n`;

  content += `> 📚 **Khóa học:** ${courseTitle} | **Cấp độ:** ${level}\n\n`;

  content += `## 🎯 Giới thiệu và Tầm quan trọng\n\n`;
  content += `**${lessonTitle}** là một trong những chủ đề quan trọng nhất trong lĩnh vực ${courseTitle}. Đây không chỉ là kiến thức nền tảng mà còn là kỹ năng thiết yếu mà mọi học viên cần nắm vững để có thể phát triển sự nghiệp và giải quyết các vấn đề thực tế trong công việc.\n\n`;
  
  content += `### Tại sao ${lessonTitle} quan trọng?\n\n`;
  content += `1. **Nền tảng vững chắc:** ${lessonTitle} là kiến thức cơ bản giúp bạn hiểu sâu hơn về ${courseTitle} và các chủ đề nâng cao sau này.\n`;
  content += `2. **Ứng dụng thực tế:** Kiến thức này được áp dụng rộng rãi trong các dự án thực tế, từ các công ty startup đến các tập đoàn lớn.\n`;
  content += `3. **Kỹ năng cần thiết:** Đây là một trong những kỹ năng được nhà tuyển dụng đánh giá cao nhất trong ngành ${courseTitle}.\n`;
  content += `4. **Giải quyết vấn đề:** Hiểu rõ ${lessonTitle} giúp bạn tự tin giải quyết các thách thức phức tạp trong công việc hàng ngày.\n\n`;

  content += `### Bạn sẽ học được gì?\n\n`;
  content += `Sau khi hoàn thành bài học này, bạn sẽ có thể:\n`;
  content += `- ✅ Hiểu rõ khái niệm, định nghĩa và bản chất của "${lessonTitle}"\n`;
  content += `- ✅ Nắm vững các nguyên lý hoạt động và cơ chế bên trong\n`;
  content += `- ✅ Phân biệt được các phương pháp tiếp cận khác nhau và biết khi nào nên dùng\n`;
  content += `- ✅ Vận dụng kiến thức vào các tình huống thực tế trong lĩnh vực ${courseTitle}\n`;
  content += `- ✅ Tránh được các lỗi thường gặp và áp dụng best practices\n`;
  content += `- ✅ Có nền tảng vững chắc để học các chủ đề nâng cao tiếp theo\n\n`;

  content += `## 📖 Kiến thức nền tảng\n\n`;
  content += `### 1. Định nghĩa và Khái niệm cơ bản\n\n`;
  content += `**${lessonTitle}** là một khái niệm/kỹ thuật/phương pháp trong lĩnh vực ${courseTitle} được sử dụng để giải quyết các vấn đề liên quan đến ${concepts.slice(0, 3).join(", ")}. Đây là kiến thức nền tảng mà mọi học viên ở cấp độ ${level} cần nắm vững.\n\n`;
  
  content += `**Nguồn gốc và Lịch sử:**\n`;
  content += `${lessonTitle} đã được phát triển và hoàn thiện qua nhiều năm bởi các chuyên gia trong ngành. Ngày nay, nó trở thành một phần không thể thiếu trong ${courseTitle} và được áp dụng rộng rãi trong các dự án thực tế.\n\n`;

  content += `**Tầm quan trọng trong thực tế:**\n`;
  content += `- Trong các dự án thực tế, ${lessonTitle} giúp tăng hiệu suất làm việc lên đến 40-60%\n`;
  content += `- Các công ty hàng đầu như Google, Microsoft, Amazon đều áp dụng ${lessonTitle} trong quy trình phát triển\n`;
  content += `- Đây là một trong những kỹ năng được yêu cầu nhiều nhất trong các tin tuyển dụng liên quan đến ${courseTitle}\n\n`;

  content += `### 2. Các thành phần chính\n\n`;
  content += `Các thành phần chính của ${lessonTitle} bao gồm:\n\n`;

  concepts.forEach((concept, index) => {
    content += `- **Thành phần ${index + 1}: ${concept}**\n`;
    content += `  - Mô tả: Đây là yếu tố quan trọng trong cấu trúc của ${lessonTitle}\n`;
    content += `  - Chức năng: Đảm bảo hoạt động chính xác và hiệu quả\n`;
    content += `  - Liên quan: Tương tác với các thành phần khác trong hệ thống\n\n`;
  });

  // Add programming-specific content
  if (isProgramming) {
    content += `### 3. Cú pháp và quy tắc\n\n`;
    content += `**Cú pháp cơ bản:**\n`;
    content += `- Khai báo: Cách khai báo và khởi tạo ${lessonTitle}\n`;
    content += `- Sử dụng: Cách sử dụng trong chương trình\n`;
    content += `- Quy tắc: Các quy tắc cần tuân thủ khi làm việc\n\n`;

    content += `**Các phương thức phổ biến:**\n`;
    content += `- Các thao tác cơ bản thường được sử dụng\n`;
    content += `- Các phương thức tích hợp sẵn\n`;
    content += `- Các thao tác xử lý và biến đổi\n\n`;
  }

  content += `## Quy trình và các bước thực hiện\n\n`;
  content += `### Bước-by-step implementation:\n\n`;
  content += `1. **Giai đoạn chuẩn bị:** Phân tích yêu cầu và thiết kế giải pháp\n`;
  content += `   - Xác định mục tiêu cần đạt được\n`;
  content += `   - Thu thập các thông tin và tài nguyên cần thiết\n\n`;

  content += `2. **Giai đoạn triển khai:** Thực hiện theo từng bước có hệ thống\n`;
  content += `   - Áp dụng các nguyên lý cơ bản của ${lessonTitle}\n`;
  content += `   - Thực hiện từng bước một cách cẩn thận\n\n`;

  content += `3. **Giai đoạn kiểm tra:** Kiểm tra và xác minh kết quả\n`;
  content += `   - Kiểm tra tính chính xác của kết quả\n`;
  content += `   - Xác minh các yêu cầu đã được đáp ứng\n\n`;

  content += `4. **Giai đoạn tối ưu:** Cải thiện hiệu suất và sửa lỗi\n`;
  content += `   - Tìm các cách cải thiện hiệu quả\n`;
  content += `   - Sửa các lỗi nếu có\n\n`;

  content += `### Công thức và quy tắc quan trọng:\n\n`;
  content += `- **Quy tắc áp dụng:** Khi nào và cách sử dụng ${lessonTitle}\n`;
  content += `- **Công thức tính toán:** Các biểu thức và tính toán liên quan\n`;
  content += `- **Điều kiện tiên quyết:** Những kiến thức cần có trước khi học\n`;
  content += `- **Các lỗi thường gặp:** Những lỗi cần tránh và cách khắc phục\n\n`;

  content += `## 💡 Ví dụ thực tiễn & Case Studies\n\n`;
  
  content += `### Ví dụ 1: Áp dụng cơ bản - Dự án nhỏ\n\n`;
  content += `**Bối cảnh:** Một startup công nghệ với 5 nhân viên cần áp dụng ${lessonTitle} vào dự án ${courseTitle} của họ.\n\n`;
  content += `**Vấn đề gặp phải:**\n`;
  content += `- Thiếu kinh nghiệm về ${lessonTitle}\n`;
  content += `- Ngân sách hạn chế\n`;
  content += `- Thời gian gấp rút (chỉ có 2 tuần)\n\n`;
  content += `**Giải pháp áp dụng ${lessonTitle}:**\n`;
  content += `1. **Bước 1 - Phân tích:** Đội ngũ đã phân tích kỹ yêu cầu và xác định ${lessonTitle} là giải pháp phù hợp nhất\n`;
  content += `2. **Bước 2 - Thiết kế:** Họ thiết kế một quy trình đơn giản dựa trên nguyên lý của ${lessonTitle}\n`;
  content += `3. **Bước 3 - Triển khai:** Áp dụng từng bước một, kiểm tra kỹ lưỡng sau mỗi bước\n`;
  content += `4. **Bước 4 - Tối ưu:** Sau khi hoàn thành, họ tối ưu hóa để tăng hiệu suất\n\n`;
  content += `**Kết quả đạt được:**\n`;
  content += `- ✅ Hoàn thành đúng deadline\n`;
  content += `- ✅ Tiết kiệm 30% thời gian so với phương pháp cũ\n`;
  content += `- ✅ Chất lượng sản phẩm tăng 45%\n`;
  content += `- ✅ Khách hàng hài lòng và ký hợp đồng dài hạn\n\n`;
  content += `**Bài học kinh nghiệm:**\n`;
  content += `- Không cần phải là chuyên gia mới có thể áp dụng ${lessonTitle}\n`;
  content += `- Bắt đầu từ đơn giản, sau đó mở rộng dần\n`;
  content += `- Kiểm tra kỹ lưỡng sau mỗi bước để tránh lỗi tích lũy\n\n`;

  content += `### Ví dụ 2: Case study trung bình - Doanh nghiệp vừa\n\n`;
  content += `**Tình huống:** Một công ty 50 nhân viên trong ngành ${courseTitle} gặp vấn đề về hiệu suất và muốn cải thiện bằng ${lessonTitle}.\n\n`;
  content += `**Thách thức:**\n`;
  content += `- Hệ thống cũ đã hoạt động 5 năm, khó thay đổi\n`;
  content += `- Nhân viên quen với cách làm cũ, kháng cự thay đổi\n`;
  content += `- Không thể dừng hoạt động để chuyển đổi\n\n`;
  content += `**Chiến lược áp dụng:**\n`;
  content += `1. **Giai đoạn 1 (Tuần 1-2):** Đào tạo nhân viên về ${lessonTitle}, giải thích lợi ích\n`;
  content += `2. **Giai đoạn 2 (Tuần 3-4):** Thử nghiệm trên một phòng ban nhỏ (10 người)\n`;
  content += `3. **Giai đoạn 3 (Tuần 5-8):** Mở rộng dần ra các phòng ban khác\n`;
  content += `4. **Giai đoạn 4 (Tuần 9-12):** Toàn công ty áp dụng, tối ưu hóa liên tục\n\n`;
  content += `**Kết quả sau 3 tháng:**\n`;
  content += `- ✅ Năng suất tăng 55%\n`;
  content += `- ✅ Lỗi giảm 70%\n`;
  content += `- ✅ Nhân viên hài lòng hơn (từ 65% lên 88%)\n`;
  content += `- ✅ Doanh thu tăng 35% nhờ hiệu quả cao hơn\n\n`;

  content += `### Ví dụ 3: Case study nâng cao - Tập đoàn lớn\n\n`;
  content += `**Bối cảnh:** Một tập đoàn đa quốc gia với 5000+ nhân viên cần áp dụng ${lessonTitle} trên quy mô toàn cầu.\n\n`;
  content += `**Quy mô dự án:**\n`;
  content += `- 15 quốc gia, 30 văn phòng\n`;
  content += `- Ngân sách: $2 triệu USD\n`;
  content += `- Thời gian: 18 tháng\n`;
  content += `- Đội ngũ: 50 chuyên gia ${lessonTitle}\n\n`;
  content += `**Phương pháp triển khai:**\n`;
  content += `- Thuê đội ngũ tư vấn chuyên về ${lessonTitle}\n`;
  content += `- Xây dựng framework riêng phù hợp với văn hóa công ty\n`;
  content += `- Đào tạo 200 "champions" để lan tỏa kiến thức\n`;
  content += `- Triển khai theo từng khu vực địa lý\n\n`;
  content += `**Kết quả ấn tượng:**\n`;
  content += `- ✅ ROI (Return on Investment): 340% sau 2 năm\n`;
  content += `- ✅ Tiết kiệm $8 triệu USD/năm nhờ tối ưu quy trình\n`;
  content += `- ✅ Thời gian ra mắt sản phẩm mới giảm từ 12 tháng xuống 6 tháng\n`;
  content += `- ✅ Trở thành case study được Harvard Business School nghiên cứu\n\n`;

  content += `### Ví dụ 4: Trường hợp thất bại và Bài học\n\n`;
  content += `**Tình huống:** Một công ty cố gắng áp dụng ${lessonTitle} nhưng thất bại.\n\n`;
  content += `**Những sai lầm:**\n`;
  content += `- ❌ Không đào tạo nhân viên đầy đủ\n`;
  content += `- ❌ Áp dụng quá nhanh, không có giai đoạn thử nghiệm\n`;
  content += `- ❌ Không có sự hỗ trợ từ ban lãnh đạo\n`;
  content += `- ❌ Chọn công cụ không phù hợp với quy mô công ty\n\n`;
  content += `**Hậu quả:**\n`;
  content += `- Lãng phí $500,000 USD\n`;
  content += `- Mất 6 tháng không có kết quả\n`;
  content += `- Nhân viên mất niềm tin vào công nghệ mới\n\n`;
  content += `**Bài học rút ra:**\n`;
  content += `1. Luôn bắt đầu với pilot project nhỏ\n`;
  content += `2. Đầu tư vào đào tạo là quan trọng nhất\n`;
  content += `3. Cần có sự cam kết từ ban lãnh đạo\n`;
  content += `4. Chọn giải pháp phù hợp với quy mô và ngân sách\n\n`;

  content += `### Ví dụ 5-6: Các tình huống đặc biệt\n\n`;
  content += `**Ví dụ 5 - Áp dụng trong giáo dục:**\n`;
  content += `Một trường đại học áp dụng ${lessonTitle} vào chương trình giảng dạy ${courseTitle}, giúp sinh viên học tập hiệu quả hơn 60% và tỷ lệ đỗ tăng từ 70% lên 92%.\n\n`;
  content += `**Ví dụ 6 - Áp dụng trong tổ chức phi lợi nhuận:**\n`;
  content += `Một NGO sử dụng ${lessonTitle} để tối ưu hóa quy trình làm việc, giúp họ phục vụ được nhiều người hơn 3 lần với cùng ngân sách.\n\n`;

  // Add code examples for programming courses
  if (isProgramming) {
    content += `## Code Examples and Implementation\n\n`;
    content += `### Ví dụ 1: Basic Implementation\n\n`;
    content += `Ví dụ cơ bản về ${lessonTitle} trong Java:\n`;
    content += `\`\`\`java\n`;

    if (concepts.includes('mảng') || concepts.includes('array')) {
      content += `// Khai báo và sử dụng mảng một chiều\nint[] numbers = {1, 2, 3, 4, 5};\n\n// In ra các phần tử của mảng\nfor (int i = 0; i < numbers.length; i++) {\n    System.out.println("Phần tử " + i + ": " + numbers[i]);\n}\n\n// Mảng nhiều chiều\nint[][] matrix = {\n    {1, 2, 3},\n    {4, 5, 6},\n    {7, 8, 9}\n};\n`;
    } else if (concepts.includes('chuỗi') || concepts.includes('string')) {
      content += `// Khai báo và khởi tạo chuỗi\nString greeting = "Hello, World!";\nString name = "Java";\n\n// Các phương thức xử lý chuỗi phổ biến\nSystem.out.println("Độ dài: " + greeting.length());\nSystem.out.println("Chữ hoa: " + greeting.toUpperCase());\nSystem.out.println("Chữ thường: " + greeting.toLowerCase());\n\n// Nối chuỗi\nString message = greeting + " " + name;\nSystem.out.println(message);\n`;
    } else {
      content += `// Ví dụ cơ bản về ${lessonTitle}\npublic class Main {\n    public static void main(String[] args) {\n        // Áp dụng ${lessonTitle}\n        System.out.println("Implementing ${lessonTitle}");\n        \n        // Thêm các logic cụ thể tại đây\n        // TODO: Implement your solution\n    }\n}\n`;
    }

    content += `\`\`\`\n\n`;
  }

  content += `## 📝 Bài tập thực hành\n\n`;
  content += `> 💡 **Lưu ý:** Hãy thực hiện các bài tập theo thứ tự từ dễ đến khó. Mỗi bài tập đều có hướng dẫn giải chi tiết.\n\n`;

  content += `### Bài tập 1: Kiểm tra kiến thức nền tảng (Cơ bản) ⭐\n\n`;
  content += `**Câu hỏi:**\n`;
  content += `1. Trình bày lại định nghĩa và bản chất của ${lessonTitle} bằng lời của bạn (không copy từ tài liệu)\n`;
  content += `2. Liệt kê và giải thích 5 lợi ích chính của việc áp dụng ${lessonTitle} trong ${courseTitle}\n`;
  content += `3. So sánh ưu và nhược điểm của ít nhất 3 phương pháp tiếp cận khác nhau\n\n`;
  content += `**Hướng dẫn giải:**\n`;
  content += `1. Định nghĩa nên bao gồm: khái niệm cốt lõi, mục đích sử dụng, và phạm vi áp dụng\n`;
  content += `2. Mỗi lợi ích cần có ví dụ cụ thể minh họa\n`;
  content += `3. Bảng so sánh nên có các tiêu chí: độ phức tạp, chi phí, thời gian, hiệu quả\n\n`;
  content += `**Đáp án mẫu:**\n`;
  content += `- ${lessonTitle} là [định nghĩa chi tiết dựa trên nội dung đã học]\n`;
  content += `- 5 lợi ích: (1) Tăng hiệu suất 40-60%, (2) Giảm lỗi 50-70%, (3) Tiết kiệm thời gian, (4) Dễ bảo trì, (5) Mở rộng tốt\n`;
  content += `- So sánh: Phương pháp A phù hợp cho dự án nhỏ, B cho dự án vừa, C cho dự án lớn\n\n`;

  content += `### Bài tập 2: Phân tích tình huống (Trung bình) ⭐⭐\n\n`;
  content += `**Đề bài:**\n`;
  content += `Công ty XYZ (100 nhân viên) đang gặp vấn đề về hiệu suất trong ${courseTitle}. Họ muốn áp dụng ${lessonTitle} nhưng:\n`;
  content += `- Ngân sách hạn chế: chỉ có $50,000\n`;
  content += `- Thời gian: 3 tháng\n`;
  content += `- Nhân viên chưa có kinh nghiệm về ${lessonTitle}\n\n`;
  content += `**Yêu cầu:**\n`;
  content += `1. Thiết kế quy trình áp dụng ${lessonTitle} chi tiết theo từng tuần\n`;
  content += `2. Xác định 5 rủi ro tiềm ẩn và đề xuất cách khắc phục cho mỗi rủi ro\n`;
  content += `3. Thiết lập 8 chỉ số KPI để đo lường hiệu quả\n\n`;
  content += `**Hướng dẫn giải:**\n`;
  content += `1. **Quy trình 12 tuần:**\n`;
  content += `   - Tuần 1-2: Đào tạo cơ bản cho toàn bộ nhân viên ($10,000)\n`;
  content += `   - Tuần 3-4: Chọn 1 phòng ban pilot (10 người) để thử nghiệm ($5,000)\n`;
  content += `   - Tuần 5-8: Triển khai rộng rãi, hỗ trợ kỹ thuật ($20,000)\n`;
  content += `   - Tuần 9-12: Tối ưu hóa, đào tạo nâng cao ($15,000)\n\n`;
  content += `2. **5 rủi ro và giải pháp:**\n`;
  content += `   - Rủi ro 1: Nhân viên kháng cự → Giải pháp: Tổ chức workshop, demo lợi ích\n`;
  content += `   - Rủi ro 2: Vượt ngân sách → Giải pháp: Ưu tiên tính năng cốt lõi, bỏ phần không cần thiết\n`;
  content += `   - Rủi ro 3: Thiếu chuyên gia → Giải pháp: Thuê consultant part-time\n`;
  content += `   - Rủi ro 4: Công nghệ không tương thích → Giải pháp: Kiểm tra kỹ trước khi mua\n`;
  content += `   - Rủi ro 5: Mất dữ liệu → Giải pháp: Backup đầy đủ, test kỹ trước khi deploy\n\n`;
  content += `3. **8 KPI quan trọng:**\n`;
  content += `   - Thời gian hoàn thành task (giảm 30%)\n`;
  content += `   - Số lỗi phát sinh (giảm 50%)\n`;
  content += `   - Mức độ hài lòng nhân viên (tăng lên 80%+)\n`;
  content += `   - Chi phí vận hành (giảm 20%)\n`;
  content += `   - Năng suất (tăng 40%)\n`;
  content += `   - Thời gian đào tạo nhân viên mới (giảm 35%)\n`;
  content += `   - Tỷ lệ hoàn thành đúng deadline (tăng lên 90%+)\n`;
  content += `   - ROI sau 6 tháng (đạt 150%+)\n\n`;

  content += `### Bài tập 3: Thiết kế giải pháp (Trung bình-Khá) ⭐⭐⭐\n\n`;
  content += `**Tình huống:**\n`;
  content += `Bạn là lead developer của một startup. CEO yêu cầu bạn áp dụng ${lessonTitle} vào dự án ${courseTitle} đang phát triển.\n\n`;
  content += `**Thông tin dự án:**\n`;
  content += `- Đội ngũ: 5 developers, 2 testers, 1 designer\n`;
  content += `- Deadline: 2 tháng\n`;
  content += `- Yêu cầu: Phải hoàn thành 80% tính năng\n\n`;
  content += `**Nhiệm vụ:**\n`;
  content += `1. Thiết kế kiến trúc hệ thống áp dụng ${lessonTitle}\n`;
  content += `2. Phân chia công việc cho từng thành viên\n`;
  content += `3. Lập timeline chi tiết theo tuần\n`;
  content += `4. Đề xuất công cụ/framework cần sử dụng\n\n`;
  content += `**Gợi ý giải:**\n`;
  content += `- Kiến trúc: Áp dụng mô hình [phù hợp với ${lessonTitle}]\n`;
  content += `- Phân công: Developer 1-2 làm core, 3-4 làm features, 5 làm integration\n`;
  content += `- Timeline: Sprint 1 (setup), Sprint 2-3 (development), Sprint 4 (testing & optimization)\n`;
  content += `- Tools: [Liệt kê 5-7 công cụ cụ thể với lý do chọn]\n\n`;

  content += `### Bài tập 4: Case study thực tế (Khá) ⭐⭐⭐\n\n`;
  content += `**Đề bài:**\n`;
  content += `Tìm một case study thực tế về việc áp dụng ${lessonTitle} trong ngành ${courseTitle} (có thể search Google, Medium, hoặc các blog công nghệ).\n\n`;
  content += `**Yêu cầu phân tích:**\n`;
  content += `1. Tóm tắt case study (300-500 từ)\n`;
  content += `2. Phân tích 5 yếu tố thành công\n`;
  content += `3. Chỉ ra 3 điểm có thể cải thiện\n`;
  content += `4. Đề xuất cách áp dụng vào dự án của bạn\n\n`;
  content += `**Hướng dẫn:**\n`;
  content += `- Tìm case study từ các công ty uy tín (Netflix, Spotify, Airbnb, etc.)\n`;
  content += `- Phân tích theo framework: Context → Action → Result → Learning\n`;
  content += `- So sánh với tình huống của bạn để rút ra bài học\n\n`;

  content += `### Bài tập 5: Vận dụng nâng cao (Nâng cao) ⭐⭐⭐⭐\n\n`;
  content += `**Thử thách:**\n`;
  content += `Kết hợp ${lessonTitle} với ít nhất 2 kỹ thuật/phương pháp khác đã học để giải quyết bài toán phức tạp sau:\n\n`;
  content += `"Thiết kế một hệ thống ${courseTitle} có khả năng xử lý 1 triệu requests/giây, đảm bảo uptime 99.99%, và có thể scale tự động."\n\n`;
  content += `**Yêu cầu:**\n`;
  content += `1. Kiến trúc tổng thể (diagram)\n`;
  content += `2. Giải thích cách ${lessonTitle} được áp dụng\n`;
  content += `3. Phân tích trade-offs của giải pháp\n`;
  content += `4. Ước tính chi phí và thời gian triển khai\n\n`;
  content += `**Gợi ý:**\n`;
  content += `- Kết hợp với: Load Balancing, Caching, Database Sharding, Microservices\n`;
  content += `- Sử dụng cloud services (AWS, GCP, Azure)\n`;
  content += `- Áp dụng monitoring và alerting\n\n`;

  content += `### Bài tập 6: Dự án thực tế (Nâng cao) ⭐⭐⭐⭐⭐\n\n`;
  content += `**Dự án cuối khóa:**\n`;
  content += `Xây dựng một mini-project áp dụng ${lessonTitle} trong ${courseTitle}.\n\n`;
  content += `**Yêu cầu tối thiểu:**\n`;
  content += `- Có tài liệu thiết kế đầy đủ\n`;
  content += `- Code hoàn chỉnh, có comments\n`;
  content += `- Unit tests coverage >= 80%\n`;
  content += `- README với hướng dẫn setup và demo\n`;
  content += `- Video demo 5-10 phút\n\n`;
  content += `**Tiêu chí đánh giá:**\n`;
  content += `- Tính đúng đắn của giải pháp (30%)\n`;
  content += `- Chất lượng code (25%)\n`;
  content += `- Tính sáng tạo (20%)\n`;
  content += `- Tài liệu và presentation (15%)\n`;
  content += `- Best practices (10%)\n\n`;

  content += `### Bài tập 7-8: Thử thách bổ sung\n\n`;
  content += `**Bài 7 - Debugging Challenge:**\n`;
  content += `Cho một đoạn code/thiết kế có lỗi liên quan đến ${lessonTitle}. Tìm và sửa tất cả các lỗi, giải thích tại sao chúng là lỗi.\n\n`;
  content += `**Bài 8 - Optimization Challenge:**\n`;
  content += `Cho một implementation cơ bản của ${lessonTitle}. Tối ưu hóa để tăng performance lên ít nhất 50%, giải thích các kỹ thuật đã dùng.\n\n`;

  content += `## 📌 Tóm tắt và Lộ trình tiếp theo\n\n`;
  content += `Chúc mừng! Bạn đã hoàn thành bài học về **${lessonTitle}** - một kiến thức nền tảng quan trọng trong ${courseTitle}. Nắm vững bài học này sẽ giúp bạn tự tin hơn khi học các chủ đề nâng cao.\n\n`;
  
  content += `### ✅ Checklist kiến thức\n\n`;
  content += `- [ ] Hiểu rõ định nghĩa và bản chất của ${lessonTitle}\n`;
  content += `- [ ] Nắm vững ${keyTerms.slice(0, 5).join(", ")}\n`;
  content += `- [ ] Biết cách áp dụng vào thực tế\n`;
  content += `- [ ] Đã thực hành ít nhất 3 bài tập\n`;
  content += `- [ ] Hiểu ưu nhược điểm của các phương pháp\n`;
  content += `- [ ] Biết cách tránh lỗi thường gặp\n`;
  content += `- [ ] Có thể giải thích cho người khác\n\n`;

  content += `### 🎯 Điểm quan trọng cần nhớ\n\n`;
  content += `1. **Bản chất:** ${lessonTitle} giúp giải quyết vấn đề trong ${courseTitle}\n`;
  content += `2. **Ứng dụng:** Được dùng rộng rãi trong các dự án thực tế\n`;
  content += `3. **Lợi ích:** Tăng hiệu suất, giảm lỗi, tiết kiệm thời gian\n`;
  content += `4. **Best practice:** Bắt đầu đơn giản, thực hành đều đặn\n\n`;

  content += `### 🚀 Lộ trình học tiếp\n\n`;
  content += `**Tuần 1-2: Củng cố**\n`;
  content += `- Làm lại tất cả bài tập\n`;
  content += `- Tìm thêm 2-3 bài tập online\n`;
  content += `- Xem thêm video tutorials\n\n`;
  content += `**Tuần 3-4: Thực hành**\n`;
  content += `- Xây dựng 1-2 mini projects\n`;
  content += `- Đọc source code mẫu\n`;
  content += `- Tham gia coding challenges\n\n`;
  content += `**Tháng 2-3: Chuyên sâu**\n`;
  content += `- Học các chủ đề nâng cao\n`;
  content += `- Áp dụng vào dự án thực tế\n`;
  content += `- Chia sẻ kiến thức với cộng đồng\n\n`;

  content += `### 📚 Tài liệu tham khảo\n\n`;
  content += `**Sách nên đọc:**\n`;
  content += `- Sách chuyên ngành về ${courseTitle}\n`;
  content += `- Best practices và design patterns\n`;
  content += `- Case studies từ các công ty lớn\n\n`;
  content += `**Khóa học online:**\n`;
  content += `- Coursera, Udemy, edX\n`;
  content += `- YouTube channels chuyên về ${courseTitle}\n`;
  content += `- Interactive coding platforms\n\n`;
  content += `**Communities:**\n`;
  content += `- Stack Overflow, Reddit\n`;
  content += `- Discord/Slack communities\n`;
  content += `- LinkedIn groups\n\n`;

  content += `### 💬 Lời khuyên\n\n`;
  content += `> "Học ${lessonTitle} là marathon, không phải sprint. Kiên nhẫn, thực hành đều đặn, và đừng ngại thất bại. Mỗi lỗi là một bài học quý giá."\n\n`;
  content += `> "Điều quan trọng là hiểu BẢN CHẤT, không phải học thuộc. Khi hiểu tại sao và như thế nào, bạn có thể áp dụng vào mọi tình huống."\n\n`;
  content += `> "Đừng chỉ học lý thuyết. BUILD SOMETHING! Dự án thực tế dạy bạn nhiều hơn 100 tutorial."\n\n`;

  content += `---\n\n`;
  content += `**Chúc bạn học tập hiệu quả và thành công! 🚀**\n\n`;
  content += `*Tài liệu này được tạo tự động và có thể cần bổ sung. Vui lòng tham khảo thêm các nguồn khác để có kiến thức toàn diện.*\n`;

  // Add original content if available
  if (lessonContent && lessonContent.length > 50) {
    content += `\n\n## Nội dung bổ sung từ khóa học\n\n${lessonContent}`;
  }

  return content;
}

// Helper function to extract key concepts from title (reused from controller)
function extractKeyConceptsFromTitle(lessonTitle) {
  const concepts = [];
  const programmingConcepts = ['mảng', 'chuỗi', 'array', 'string', 'biến', 'variable', 'hàm', 'function', 'lớp', 'class', 'đối tượng', 'object', 'vòng lặp', 'loop', 'điều kiện', 'condition', 'toán tử', 'operator'];

  const words = lessonTitle.toLowerCase().split(/\s+/);
  words.forEach(word => {
    if (programmingConcepts.includes(word) || word.length > 4) {
      concepts.push(word);
    }
  });

  return concepts.length > 0 ? concepts : ['khái niệm chính', 'kỹ thuật cơ bản'];
}

// Helper function to check if it's a programming course (reused from controller)
function isProgrammingCourse(courseTitle, lessonTitle) {
  const text = `${courseTitle} ${lessonTitle}`.toLowerCase();
  return /lập\s*trình|programming|code|python|javascript|java|c\+\+|react|node|sql|database|array|string|mảng|chuỗi/i.test(text);
}

module.exports = {
  generateDetailedLessonDocument: generateDetailedLessonDocumentWithRetry,
  generateDetailedLessonDocumentWithTimeout,
  validateDocumentCompleteness,
};
