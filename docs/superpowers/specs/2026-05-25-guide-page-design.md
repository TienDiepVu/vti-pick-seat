# Spec: Trang Hướng dẫn sử dụng (Guide)

## 1. Yêu cầu chung
Tạo một trang HTML hoàn toàn mới tên là `guide.html` đóng vai trò là tài liệu hướng dẫn sử dụng chi tiết cho hệ thống đặt ghế PickSeatVti. 

## 2. Giao diện & Kiến trúc
- **File**: `public/guide.html`
- **UI/UX**: 
  - Kế thừa CSS hiện có từ `app.css` để giữ sự đồng nhất về phông chữ (Irish Grover / Times New Roman) và màu sắc.
  - Bố cục dạng bài viết (Article layout), chia các đề mục rõ ràng, có container chứa văn bản (background bán trong suốt hoặc tối để dễ đọc trên nền rạp chiếu phim).
- **Điều hướng**: 
  - KHÔNG chứa nút bấm hay link để quay về màn hình đặt ghế.
  - Các màn hình đặt ghế cũng KHÔNG gắn link dẫn tới trang `guide.html` này. Trang này được thiết kế để truy cập độc lập.

## 3. Nội dung chi tiết
Trang Hướng dẫn sẽ bao gồm 2 phần chính như đã chốt với người dùng:

### 3.1. Hướng dẫn sử dụng từng màn hình
- **Màn hình Chọn ghế (Cinema 1 & Cinema 2)**:
  - Giải thích ý nghĩa màu sắc/icon của ghế: Ghế chưa chọn, Ghế đang chọn, Ghế đã chọn (có logo), Ghế đôi.
  - Hướng dẫn các bước thao tác: Click vào ghế trống -> Nhấn nút "Chọn ghế" -> Điền form thông tin.
- **Màn hình Chỉ xem (View Only)**:
  - Giải thích mục đích: Dùng để trình chiếu tiến độ đặt ghế lên màn hình lớn hoặc cho ban tổ chức theo dõi real-time.
  - Đặc điểm: Không cho phép click tương tác, tránh việc vô tình thay đổi dữ liệu.
- **Màn hình Danh sách (Monitoring)**:
  - Mục đích: Xem bảng tổng hợp những người đã đăng ký vé thành công.

### 3.2. Các trường hợp không đăng ký được vé
Phần này cần liệt kê thật chi tiết và in đậm cảnh báo để người dùng lưu ý:
1. **Chưa chọn ghế**: Người dùng quên nhấp chọn ghế mà đã nhấn nút "Chọn ghế". (Hệ thống sẽ báo "Vui lòng chọn ghế trước khi lưu.")
2. **Trùng ghế (Lỗi 409)**: Ghế đã bị người khác thao tác "giữ" trước một bước. Hệ thống sẽ báo "Ghế đang được người khác chọn..." và yêu cầu chọn lại.
3. **Form thiếu thông tin**: Bỏ trống các trường bắt buộc như Account CBNV, Đơn vị, hoặc bỏ trống tên người tham gia ở từng ghế.
4. **Sai Account / Từ chối vé phát sinh**: Account nhập vào không có trong danh sách được cấp phép đăng ký trước. Hệ thống sẽ hỏi có muốn đăng ký dưới dạng "vé phát sinh" không, nếu người dùng ấn "Hủy" hoặc từ chối thì tiến trình bị huỷ bỏ.
5. **Lỗi mạng / Mất kết nối**: Trình duyệt không thể giao tiếp với máy chủ trong quá trình submit.

## 4. Phạm vi (Scope)
Công việc chỉ giới hạn ở việc tạo mới file `public/guide.html` và viết mã HTML/CSS nội tuyến (nếu cần) hoặc tận dụng class có sẵn để hiển thị nội dung trên. Không làm thay đổi logic các file `.js` và `.html` hiện có.