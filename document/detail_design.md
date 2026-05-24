# TÀI LIỆU THIẾT KẾ CHI TIẾT (DETAIL DESIGN) - DỰ ÁN PICKSEATVTI

Tài liệu này mô tả chi tiết về cấu trúc thư mục, đặc tả các API, thiết kế cơ sở dữ liệu dạng JSON, thuật toán xử lý và cài đặt mã nguồn cho dự án **PickSeatVti**.

---

## 1. Cấu trúc thư mục dự án (Project Folder Structure)

Dự án có cấu trúc thư mục dạng Single-page/Multi-page tĩnh kết hợp máy chủ Node.js cơ bản như sau:

```
PickSeatVti/
├── data/                               # Thư mục lưu trữ dữ liệu JSON (Cơ sở dữ liệu cục bộ)
│   ├── registrations.local.json        # Dữ liệu CBNV đăng ký tham gia gốc
│   └── bookings.local.json             # Lịch sử các ghế đã được đặt thực tế
├── public/                             # Thư mục chứa các file tĩnh (Frontend)
│   ├── assets/                         # Hình ảnh, tài nguyên của trang web
│   ├── css/
│   │   └── app.css                     # File CSS chính định dạng giao diện ứng dụng
│   ├── fonts/                          # Các font chữ sử dụng trong ứng dụng
│   ├── js/
│   │   ├── seating.js                  # Logic hiển thị sơ đồ ghế, đăng ký đặt ghế
│   │   └── monitoring.js               # Logic trang đối soát và tìm kiếm
│   ├── cinema1.html                    # Giao diện chọn ghế phòng chiếu Cinema 1
│   ├── cinema2.html                    # Giao diện chọn ghế phòng chiếu Cinema 2
│   └── monitoring.html                 # Giao diện đối soát dữ liệu của Admin
├── package.json                        # Cấu hình dự án & scripts khởi chạy Node.js
└── server.js                           # Backend server (HTTP API & Static File Server)
```

---

## 2. Đặc tả dữ liệu JSON (Data Schemas)

Ứng dụng sử dụng 2 tệp JSON chính để lưu giữ trạng thái hệ thống:

### 2.1. Danh sách đăng ký ban đầu (`registrations.local.json`)
Lưu trữ thông tin của các CBNV đã hoàn tất thủ tục đăng ký tham gia sự kiện trước đó. Định dạng là một JSON Object với các key chính là tài khoản của nhân viên (viết thường).

*   **Schema chi tiết:**
    *   `employeeName` (String): Họ và tên của CBNV đăng ký.
    *   `account` (String): Tài khoản viết tắt của CBNV (ví dụ: `minh.phamthihong`).
    *   `unit` (String): Đơn vị làm việc (ví dụ: `VTI.D2`).
    *   `relatives` (Array of Strings): Danh sách họ và tên của người thân đi cùng.

*   **Ví dụ dữ liệu:**
    ```json
    {
      "minh.phamthihong": {
        "employeeName": "Phạm Thị Hồng Minh",
        "account": "minh.phamthihong",
        "unit": "VTI.D2",
        "relatives": [
          "Chu Tường Vy",
          "Chu Thúy Quỳnh"
        ]
      }
    }
    ```

### 2.2. Danh sách đặt ghế (`bookings.local.json`)
Lưu trữ toàn bộ thông tin các vị trí ghế đã được giữ chỗ thành công theo thời gian thực.
JSON Object gồm 2 nhóm chính: `cinema-1` và `cinema-2`.

*   **Schema chi tiết của từng Rạp:**
    *   Key: Mã ghế (ví dụ: `C1`, `M2`).
    *   Value: Object chứa thông tin chi tiết:
        *   `seat` (String): Mã số ghế.
        *   `name` (String): Tên người tham gia ngồi ghế đó (có thể là tên CBNV hoặc tên người thân).
        *   `account` (String): Tài khoản CBNV đứng tên đăng ký.
        *   `unit` (String): Đơn vị của CBNV.
        *   `cinema` (String): Rạp chiếu (`cinema-1` hoặc `cinema-2`).
        *   `savedAt` (String - ISO Date): Thời điểm đặt ghế thành công.

*   **Ví dụ dữ liệu:**
    ```json
    {
      "cinema-1": {
        "C3": {
          "seat": "C3",
          "name": "Chu Tường Vy",
          "account": "minh.phamthihong",
          "unit": "VTI.D2",
          "cinema": "cinema-1",
          "savedAt": "2026-05-24T13:00:00.000Z"
        }
      },
      "cinema-2": {}
    }
    ```

---

## 3. Thiết kế API Endpoints (API Specification)

Server Node.js tiếp nhận các request thông qua module HTTP tích hợp sẵn và phân luồng xử lý theo các endpoint sau:

### 3.1. Lấy danh sách ghế đã được đặt
*   **Endpoint:** `/api/bookings`
*   **Method:** `GET`
*   **Query Parameters:**
    *   `cinema` (String): Tên rạp cần lấy thông tin (`cinema-1` hoặc `cinema-2`).
*   **Phản hồi thành công (200 OK):**
    ```json
    {
      "seats": ["C3", "C4"]
    }
    ```

### 3.2. Đặt ghế & Xác thực thông tin
*   **Endpoint:** `/api/validate-booking`
*   **Method:** `POST`
*   **Request Payload (JSON):**
    ```json
    {
      "cinema": "cinema-1",
      "account": "minh.phamthihong",
      "unit": "VTI.D2",
      "attendees": [
        {
          "seat": "C3",
          "name": "Chu Tường Vy"
        }
      ]
    }
    ```
*   **Phản hồi thành công (Lưu thành công - 200 OK):**
    ```json
    {
      "valid": true,
      "seats": ["C3"]
    }
    ```
*   **Phản hồi lỗi nghiệp vụ (200 OK nhưng `valid: false`):**
    *   *Trường hợp CBNV chưa đăng ký chương trình:*
        ```json
        {
          "valid": false,
          "message": "Cán bộ nhân viên chưa đăng ký tham gia chương trình."
        }
        ```
    *   *Trường hợp vượt quá số lượng đăng ký tối đa:*
        ```json
        {
          "valid": false,
          "message": "Tài khoản này đã đăng ký X người, thêm Y người sẽ vượt quá số lượng ban đầu (Z người)."
        }
        ```
    *   *Trường hợp ghế đã được đặt:*
        ```json
        {
          "valid": false,
          "message": "Ghế C3 đã được đăng ký."
        }
        ```
*   **Phản hồi lỗi máy chủ (500 Internal Server Error):**
    ```json
    {
      "valid": false,
      "message": "Không kiểm tra được thông tin đăng ký."
    }
    ```

### 3.3. Lấy dữ liệu đối soát sự kiện
*   **Endpoint:** `/api/monitoring`
*   **Method:** `GET`
*   **Phản hồi thành công (200 OK):**
    Trả về danh sách 2 bảng thông tin đối soát:
    ```json
    {
      "mappedRows": [
        {
          "stt": 1,
          "participantName": "Chu Tường Vy",
          "employeeName": "Phạm Thị Hồng Minh",
          "account": "minh.phamthihong",
          "unit": "VTI.D2",
          "seat": "C3",
          "cinema": "cinema-1"
        }
      ],
      "unmappedRows": [
        {
          "stt": 1,
          "participantName": "Nguyễn Văn A",
          "employeeName": "",
          "account": "nguyen.vana",
          "unit": "VTI.D1",
          "seat": "A5",
          "cinema": "cinema-1",
          "note": "Không có trong danh sách đăng ký ban đầu"
        }
      ]
    }
    ```

---

## 4. Xử lý Logic Backend (`server.js`)

### 4.1. Chuẩn hóa chuỗi dữ liệu (`normalizeText`)
Nhằm loại bỏ sự khác biệt về chữ hoa/thường, khoảng trắng thừa hoặc lỗi gõ phím khi đối chiếu chuỗi:
```javascript
function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}
```

### 4.2. Routing tĩnh và bảo mật (`serveStatic`)
*   Máy chủ tự phân tích đường dẫn URL để phục vụ các file HTML, CSS, JS trong thư mục `public`.
*   **Bảo mật:** Ngăn cản truy cập bất hợp pháp các file cấu hình và dữ liệu nhạy cảm cục bộ bằng cách kiểm tra:
    ```javascript
    if (!filePath.startsWith(publicDir) || filePath.endsWith(".local.json")) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    ```

### 4.3. Logic Đối soát (`getMonitoring`)
1.  Đọc toàn bộ file `registrations.local.json` và `bookings.local.json`.
2.  Tạo một bản đồ ánh xạ nhanh (`bookedByPerson`) từ các ghế đã đặt, khóa ánh xạ là sự kết hợp: `normalizeText(Account) + "::" + normalizeText(Họ tên người tham gia)`.
3.  **Duyệt qua danh sách Đăng ký gốc**:
    *   Lấy ra CBNV và toàn bộ người thân đi kèm.
    *   Tìm kiếm trong bản đồ `bookedByPerson` xem họ đã chọn ghế chưa.
    *   Đẩy thông tin vào danh sách `mappedRows`. Nếu đã chọn ghế, ghi nhận mã ghế & rạp. Nếu chưa chọn, mã ghế & rạp để trống.
4.  **Duyệt qua danh sách Ghế đã đặt thực tế**:
    *   Tìm xem có lượt đặt nào có khóa `Account::Tên người tham gia` không nằm trong danh sách đăng ký gốc hay không.
    *   Nếu không tìm thấy, đẩy đối tượng này vào nhóm `unmappedRows` để làm bằng chứng đối soát sai lệch thông tin.

---

## 5. Xử lý Logic Frontend

### 5.1. Trang chọn ghế (`public/js/seating.js`)

#### A. Cấu hình sơ đồ phòng chiếu (`configs`)
Từng hàng ghế được cấu hình số lượng và trạng thái đặc biệt:
*   `selected`: Khóa mặc định (Ví dụ hàng A, B của Cinema 1 & 2 đã bị khóa do mục đích kỹ thuật / BTC đặt trước).
*   `couple`: Ghế đôi nằm ở hàng M cuối cùng.
```javascript
const configs = {
  "cinema-1": [
    { row: "A", count: 12, state: "selected" },
    //...
    { row: "M", count: 10, state: "couple" }
  ]
}
```

#### B. Cơ chế chọn ghế đôi (`getSeatGroup` & `setSeatGroupCurrent`)
Khi bấm vào một ghế thuộc loại `couple`, hệ thống tự động tìm ghế đi kèm dựa vào thuộc tính `data-pair` (được tính bằng cách làm tròn `Math.ceil(vị trí ghế / 2)`).
Cả hai ghế trong cặp sẽ cùng thay đổi trạng thái chọn (`current`) đồng thời.

#### C. Responsive Sơ đồ ghế (`setScale`)
Để sơ đồ ghế luôn hiển thị trọn vẹn và không bị vỡ bố cục trên các màn hình khác nhau, hệ thống sử dụng thuật toán tính toán tỷ lệ scale động dựa trên kích thước cửa sổ so với khung hình chuẩn 1920x1080:
```javascript
function setScale() {
  const stage = document.querySelector(".stage");
  if (!stage) return;
  const scale = Math.min(stage.clientWidth / 1920, stage.clientHeight / 1080);
  stage.style.setProperty("--scale", scale);
}
```
Tại CSS, khung hiển thị sẽ biến đổi tương ứng: `transform: scale(var(--scale))`.

### 5.2. Trang đối soát (`public/js/monitoring.js`)

#### A. Tìm kiếm Realtime (`filterRows`)
Khi người dùng nhập từ khóa tìm kiếm, frontend sẽ tự động gộp tất cả các trường dữ liệu của một hàng thành một chuỗi duy nhất đã được chuẩn hóa thông qua hàm `normalizeText`. Sau đó thực hiện tìm kiếm chuỗi con bằng phương thức `.includes(keyword)`.
```javascript
const haystack = [
  row.stt,
  row.participantName,
  row.employeeName,
  row.account,
  row.unit,
  row.seat,
  row.cinema
].map(normalizeText).join(" ");
```
Phương pháp này giúp tìm kiếm đa tiêu chí nhanh chóng mà không cần gọi lại API server.
