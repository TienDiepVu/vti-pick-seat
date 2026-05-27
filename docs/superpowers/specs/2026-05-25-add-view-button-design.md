# Spec: Thêm nút "Chỉ xem" vào màn hình chọn ghế

## 1. Yêu cầu chung
Thêm nút chuyển đến màn hình "Chỉ xem" (View) ở cả hai màn hình chọn ghế (Rạp 1 và Rạp 2). Nút này sẽ hoạt động với cơ chế tương tự như nút "Rạp 1/Rạp 2" hiện tại.

## 2. Giao diện (HTML)
- **File tác động**: `public/cinema1.html` và `public/cinema2.html`
- **Vị trí**: Nằm trong thẻ `<div class="actions">`, ngay sau hoặc bên cạnh các nút `action` hiện có.
- **Mã HTML cần thêm**: `<button class="action view inter-font" type="button">Chỉ xem</button>`

## 3. Logic (JavaScript)
- **File tác động**: `public/js/seating.js`
- **Mô tả thay đổi**:
  - Tạo một hàm mới `bindView(root)` với cấu trúc tương tự `bindNext(root)`.
  - Hàm `bindView` sẽ tìm nút `.action.view`.
  - Khi click, hàm kiểm tra xem màn hình hiện tại là rạp 1 (`root.classList.contains("cinema-1")`) hay rạp 2.
  - Nếu là rạp 1: chuyển hướng (`window.location.href`) sang `./view-cinema1.html`.
  - Nếu là rạp 2: chuyển hướng sang `./view-cinema2.html`.
  - Gọi hàm `bindView(root)` trong khối khởi tạo `document.querySelectorAll(".fit").forEach((root) => { ... })`.

## 4. Phạm vi (Scope)
Thay đổi chỉ tác động đến UI thêm nút "Chỉ xem" trên trang chọn ghế chính, không ảnh hưởng đến các logic chọn ghế, giữ ghế, hay socket/polling hiện tại. Màn hình View (`view-cinema1.html`, `view-cinema2.html`) đã có sẵn và không cần chỉnh sửa trong yêu cầu này.
