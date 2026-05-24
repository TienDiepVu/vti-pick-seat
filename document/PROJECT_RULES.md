# QUY TẮC PHÁT TRIỂN DỰ ÁN (PROJECT RULES)

Tài liệu này định nghĩa quy trình bắt buộc khi tiếp nhận yêu cầu chức năng mới hoặc thay đổi mã nguồn trong dự án **PickSeatVti**.

---

## Quy trình xử lý yêu cầu chức năng (Mandatory Workflow)

Mỗi khi người dùng yêu cầu một chức năng mới, thay đổi thiết kế hoặc sửa lỗi, AI **bắt buộc** phải tuân thủ quy trình sau trước khi thực hiện bất kỳ chỉnh sửa mã nguồn nào:

### 1. Phân tích và Đề xuất (Analysis & Proposal)
AI cần phản hồi lại người dùng với đầy đủ 3 phần:
*   **Nguyên nhân (Reason/Cause)**: Tại sao cần thực hiện thay đổi này? Vấn đề hiện tại là gì?
*   **Giải pháp (Solution)**: Phương án giải quyết cụ thể, chi tiết các file sẽ chỉnh sửa và nội dung thay đổi (thuật toán, giao diện, dữ liệu).
*   **Kết quả mong đợi (Expected Result)**: Sau khi thực hiện, giao diện/hệ thống hoạt động thế nào? Cách xác minh (Verification).

### 2. Chờ phê duyệt (Approval Gate)
*   AI **không được tự ý sửa đổi code** ngay lập tức.
*   AI phải dừng lại và yêu cầu người dùng xác nhận phê duyệt phương án đề xuất.
*   Chỉ khi người dùng gửi phản hồi đồng ý hoặc duyệt phương án, AI mới được tiến hành chỉnh sửa mã nguồn.
