(function () {
  let registrations = [];
  let currentReg = null;
  let selectedAttendees = [];
  let selectedSeats = [];

  const stepList = document.getElementById("step-list");
  const stepConfirm = document.getElementById("step-confirm");
  const stepSeats = document.getElementById("step-seats");
  const listBody = document.getElementById("list-body");
  const searchInput = document.getElementById("search-input");

  function normalizeText(value) {
    return String(value || "").toLowerCase();
  }

  function showModalHTML(html, isConfirm) {
    return new Promise(resolve => {
      const modal = document.getElementById("custom-modal");
      const msgEl = document.getElementById("custom-modal-message");
      const btnCancel = document.getElementById("custom-modal-cancel");
      const btnOk = document.getElementById("custom-modal-ok");

      msgEl.innerHTML = html;
      btnCancel.style.display = isConfirm ? "inline-block" : "none";

      const close = (result) => {
        modal.classList.remove("open");
        btnCancel.onclick = null;
        btnOk.onclick = null;
        resolve(result);
      };

      btnCancel.onclick = () => close(false);
      btnOk.onclick = () => close(true);

      modal.classList.add("open");
    });
  }

  const showAlert = (msg) => showModalHTML(`<p style="white-space: pre-wrap; font-size: 18px; color: #13216a; font-weight: bold; margin: 0; text-align: center;">${msg}</p>`, false);
  const showConfirm = (msg) => showModalHTML(`<p style="white-space: pre-wrap; font-size: 18px; color: #13216a; font-weight: bold; margin: 0; text-align: center;">${msg}</p>`, true);

  async function showBookingConfirmModal(reg, attendeePayload) {
    const html = `
      <h2 class="inter-font" style="color: #090083; text-align: center; font-size: 24px; margin-top: 0; margin-bottom: 24px;">XÁC NHẬN ĐẶT GHẾ</h2>
      <div class="confirm-content" style="padding: 0;">
        <label class="confirm-label inter-font">
          Họ và tên CBNV đăng ký
          <input class="confirm-input inter-font" type="text" value="${reg.employeeName || ''}" disabled>
        </label>
        
        <div class="confirm-row-2">
          <label class="confirm-label inter-font">
            Account CBNV
            <input class="confirm-input inter-font" type="text" value="${reg.account || ''}" disabled>
          </label>
          <label class="confirm-label inter-font">
            Đơn vị
            <input class="confirm-input inter-font" type="text" value="${reg.unit || 'N/A'}" disabled>
          </label>
        </div>
        
        <div class="attendees-section">
          ${attendeePayload.map((a, idx) => `
            <label class="confirm-label inter-font">
              Người xem ${idx + 1}
              <div class="attendee-input-group">
                <input class="confirm-input inter-font" type="text" value="${a.name}" disabled>
                <div class="inter-font booking-seat-code" style="margin-top: 8px;">${a.seat}</div>
              </div>
            </label>
          `).join("")}
        </div>
      </div>
    `;
    return await showModalHTML(html, true);
  }

  function showStep(stepId) {
    document.querySelectorAll(".step-section").forEach(el => el.classList.remove("active"));
    document.getElementById(stepId).classList.add("active");
  }

  async function loadRegistrations() {
    try {
      const response = await fetch("/api/registrations");
      registrations = await response.json();
      renderList(registrations);
    } catch (error) {
      listBody.innerHTML = '<tr><td colspan="7">Không tải được dữ liệu.</td></tr>';
    }
  }

  function renderList(data) {
    if (data.length === 0) {
      listBody.innerHTML = '<tr><td colspan="7">Không có dữ liệu phù hợp.</td></tr>';
      return;
    }

    listBody.innerHTML = data.map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${row.employeeName || ""}</td>
        <td>${row.account || ""} ${row.isExtra ? '<span class="extra-badge inter-font">Phát sinh</span>' : ""}</td>
        <td>${row.unit || ""}</td>
        <td>${row.allowedCount}</td>
        <td>
          ${row.hasBooking 
            ? `<span class="status-badge status-booked">Đã đặt ${row.bookedSeats.length} ghế</span>` 
            : `<span class="status-badge status-pending">Chưa đặt</span>`}
        </td>
        <td>
          ${row.hasBooking
            ? `<button class="btn-action btn-cancel inter-font" data-account="${row.account}">Hủy vé</button>`
            : (row.allowedCount > 0 ? `<button class="btn-action btn-register inter-font" data-account="${row.account}">Đăng ký chỗ</button>` : `<button class="btn-action btn-cancel inter-font" disabled>Không có vé</button>`)
          }
        </td>
      </tr>
    `).join("");
  }

  function filterList() {
    const keyword = normalizeText(searchInput.value).trim();
    if (!keyword) {
      renderList(registrations);
      return;
    }
    const filtered = registrations.filter(row => {
      const haystack = [row.employeeName, row.account].map(normalizeText).join(" ");
      return haystack.includes(keyword);
    });
    renderList(filtered);
  }

  searchInput.addEventListener("input", filterList);

  listBody.addEventListener("click", async (e) => {
    if (e.target.classList.contains("btn-register")) {
      const account = e.target.dataset.account;
      currentReg = registrations.find(r => r.account === account);
      openConfirmStep(currentReg);
    } else if (e.target.classList.contains("btn-cancel")) {
      const account = e.target.dataset.account;
      if (await showConfirm(`Bạn có chắc chắn muốn hủy toàn bộ ghế của tài khoản ${account} không?`)) {
        await cancelBooking(account);
      }
    }
  });

  async function cancelBooking(account) {
    try {
      const response = await fetch("/api/cancel-by-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account, cinema: "cinema" })
      });
      const result = await response.json();
      if (result.success) {
        await loadRegistrations();
      } else {
        await showAlert(result.message || "Không thể hủy vé.");
      }
    } catch (error) {
      await showAlert("Lỗi kết nối khi hủy vé.");
    }
  }

  // --- Step 2: Confirm Attendees ---
  function openConfirmStep(reg) {
    document.getElementById("confirm-emp-name").value = reg.employeeName || "";
    document.getElementById("confirm-emp-account").value = reg.account || "";
    document.getElementById("confirm-emp-unit").value = reg.unit || "N/A";

    const attendeeList = document.getElementById("attendee-list");
    attendeeList.innerHTML = reg.relatives.map((name, idx) => `
      <label class="confirm-label inter-font">
        Người xem ${idx + 1}
        <div class="attendee-input-group">
          <input class="confirm-input inter-font" type="text" value="${name}" disabled>
          <label class="inter-font" style="display: flex; align-items: center; gap: 8px; cursor: pointer; color: #0a1a4e; font-weight: 700; font-size: 16px; white-space: nowrap; text-shadow: 0 1px 3px rgba(255,255,255,0.4);">
            <input type="checkbox" class="attendee-checkbox" value="${name}" checked style="margin: 0; width: 24px; height: 24px;">
            Có mặt
          </label>
        </div>
      </label>
    `).join("");

    updateNextButtonState();
    showStep("step-confirm");
  }

  document.getElementById("attendee-list").addEventListener("change", updateNextButtonState);

  function updateNextButtonState() {
    const checked = document.querySelectorAll(".attendee-checkbox:checked");
    const btnNext = document.getElementById("btn-next-step3");
    btnNext.disabled = checked.length === 0;
    btnNext.textContent = checked.length > 0 ? `Tiếp tục chọn ghế (${checked.length} người)` : "Tiếp tục chọn ghế";
  }

  document.getElementById("btn-back-step1").addEventListener("click", () => {
    currentReg = null;
    showStep("step-list");
  });

  document.getElementById("btn-next-step3").addEventListener("click", () => {
    const checkboxes = document.querySelectorAll(".attendee-checkbox:checked");
    selectedAttendees = Array.from(checkboxes).map(cb => cb.value);
    openSeatsStep();
  });

  // --- Step 3: Seating ---
  function openSeatsStep() {
    selectedSeats = [];
    document.getElementById("seating-status-text").textContent = `Cần chọn: ${selectedAttendees.length} ghế`;
    
    const root = document.getElementById("cinema-container");
    // Dọn dẹp state chọn ghế cũ
    root.querySelectorAll(".seat.current").forEach(seat => seat.classList.remove("current"));
    
    // Tải lại ghế đã đặt
    if (window.SeatingApp) {
      window.SeatingApp.loadBookedSeats(root);
    }
    
    showStep("step-seats");
    window.dispatchEvent(new Event("resize"));
  }

  document.getElementById("btn-back-step2").addEventListener("click", () => {
    showStep("step-confirm");
  });

  document.getElementById("btn-confirm-seats").addEventListener("click", async () => {
    const root = document.getElementById("cinema-container");
    const currentSeatEls = Array.from(root.querySelectorAll(".seat.current"));
    
    if (currentSeatEls.length !== selectedAttendees.length) {
      await showAlert(`Vui lòng chọn ĐÚNG ${selectedAttendees.length} ghế! (Bạn đang chọn ${currentSeatEls.length} ghế)`);
      return;
    }

    const seatCodes = currentSeatEls.map(s => s.dataset.seatCode || s.textContent);

    // Ghép attendee với ghế theo thứ tự
    const attendeePayload = selectedAttendees.map((name, index) => ({
      name: name,
      seat: seatCodes[index]
    }));

    if (!(await showBookingConfirmModal(currentReg, attendeePayload))) {
      return;
    }

    try {
      // 1. Giữ chỗ
      const holdRes = await fetch("/api/hold-seats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cinema: "cinema", seats: seatCodes, sessionId: window.SeatingApp.sessionId })
      });
      
      if (holdRes.status === 409) {
        const holdData = await holdRes.json();
        await showAlert(holdData.message || "Ghế đã bị chọn.");
        window.SeatingApp.loadBookedSeats(root);
        return;
      }

      if (!holdRes.ok) throw new Error("Lỗi giữ ghế.");

      // 2. Book
      const bookRes = await fetch("/api/validate-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cinema: "cinema",
          account: currentReg.account,
          unit: currentReg.unit,
          attendees: attendeePayload,
          sessionId: window.SeatingApp.sessionId,
          allowUnregistered: false
        })
      });

      const bookData = await bookRes.json();
      
      if (!bookData.valid) {
        await showAlert(bookData.message || "Lỗi khi lưu ghế.");
        // Release holds
        await fetch("/api/release-seats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cinema: "cinema", seats: seatCodes, sessionId: window.SeatingApp.sessionId })
        });
        return;
      }

      await showAlert("Đặt ghế thành công!");
      await loadRegistrations();
      showStep("step-list");
    } catch (err) {
      await showAlert("Lỗi kết nối.");
    }
  });

  // Bind custom click for seats to limit selection
  document.getElementById("cinema-container").querySelector("[data-seating]").addEventListener("click", async (e) => {
    const seat = e.target.closest(".seat");
    if (!seat || seat.disabled) return;

    const root = document.getElementById("cinema-container");
    const group = window.SeatingApp.getSeatGroup(root, seat);
    const isSelecting = !seat.classList.contains("current");
    
    if (isSelecting) {
      const currentSelected = root.querySelectorAll(".seat.current").length;
      if (currentSelected + group.length > selectedAttendees.length) {
        await showAlert(`Bạn chỉ được chọn tối đa ${selectedAttendees.length} ghế!`);
        return;
      }
    }
    
    window.SeatingApp.setSeatGroupCurrent(group, isSelecting);
  });

  // Init
  loadRegistrations();

  // --- Tạo đăng ký mới ---
  function clearNewRegErrors() {
    document.querySelectorAll("#create-reg-modal .error-msg").forEach(el => {
      el.textContent = "";
      el.style.display = "none";
    });
  }

  document.getElementById("btn-create-reg").addEventListener("click", () => {
    document.getElementById("new-reg-name").value = "";
    document.getElementById("new-reg-account").value = "";
    document.getElementById("new-reg-unit").value = "";
    document.querySelectorAll("#new-reg-relatives-wrap input[data-relative]").forEach(i => i.value = "");
    clearNewRegErrors();
    document.getElementById("create-reg-modal").classList.add("open");
  });

  document.getElementById("create-reg-cancel").addEventListener("click", () => {
    clearNewRegErrors();
    document.getElementById("create-reg-modal").classList.remove("open");
  });

  document.getElementById("create-reg-ok").addEventListener("click", async () => {
    const employeeName = document.getElementById("new-reg-name").value.trim();
    const account = document.getElementById("new-reg-account").value.trim();
    const unit = document.getElementById("new-reg-unit").value.trim();
    const relatives = Array.from(document.querySelectorAll("#new-reg-relatives-wrap input[data-relative]"))
      .map(i => i.value.trim())
      .filter(v => v !== "");

    clearNewRegErrors();
    let hasError = false;

    if (!employeeName) {
      const err = document.getElementById("err-new-reg-name");
      err.textContent = "Vui lòng nhập Họ và tên CBNV.";
      err.style.display = "block";
      hasError = true;
    }

    if (!account) {
      const err = document.getElementById("err-new-reg-account");
      err.textContent = "Vui lòng nhập Account CBNV.";
      err.style.display = "block";
      hasError = true;
    }

    if (!unit) {
      const err = document.getElementById("err-new-reg-unit");
      err.textContent = "Vui lòng nhập Đơn vị.";
      err.style.display = "block";
      hasError = true;
    }

    if (relatives.length === 0) {
      const err = document.getElementById("err-new-reg-relatives");
      err.textContent = "Vui lòng nhập tối thiểu 1 người xem.";
      err.style.display = "block";
      hasError = true;
    }

    if (hasError) {
      return;
    }

    try {
      const res = await fetch("/api/create-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeName, account, unit, relatives })
      });
      const result = await res.json();
      if (result.success) {
        document.getElementById("create-reg-modal").classList.remove("open");
        await showAlert("Tạo đăng ký thành công!");
        await loadRegistrations();
      } else {
        const err = document.getElementById("err-new-reg-account");
        err.textContent = result.message || "Không thể tạo đăng ký.";
        err.style.display = "block";
      }
    } catch (err) {
      await showAlert("Lỗi kết nối server.");
    }
  });

  // Tự động xóa lỗi khi người dùng gõ nhập liệu
  document.getElementById("new-reg-name").addEventListener("input", () => {
    const err = document.getElementById("err-new-reg-name");
    err.textContent = "";
    err.style.display = "none";
  });
  document.getElementById("new-reg-account").addEventListener("input", () => {
    const err = document.getElementById("err-new-reg-account");
    err.textContent = "";
    err.style.display = "none";
  });
  document.getElementById("new-reg-unit").addEventListener("input", () => {
    const err = document.getElementById("err-new-reg-unit");
    err.textContent = "";
    err.style.display = "none";
  });
  document.querySelectorAll("#new-reg-relatives-wrap input[data-relative]").forEach(input => {
    input.addEventListener("input", () => {
      const err = document.getElementById("err-new-reg-relatives");
      err.textContent = "";
      err.style.display = "none";
    });
  });

  // --- Xuất Excel (CSV) ---
  document.getElementById("btn-export-excel").addEventListener("click", () => {
    if (!registrations || registrations.length === 0) {
      showAlert("Chưa có dữ liệu để xuất.");
      return;
    }

    const rows = [["STT", "Họ và tên CBNV", "Account", "Đơn vị", "Người xem", "Số lượng", "Ghế đã đặt", "Trạng thái"]];
    registrations.forEach((reg, idx) => {
      const relatives = (reg.relatives || []).join(", ");
      const seats = (reg.bookedSeats || []).join(", ");
      const status = reg.hasBooking ? "Đã đặt ghế" : "Chưa đặt";
      rows.push([
        idx + 1,
        reg.employeeName || "",
        reg.account || "",
        reg.unit || "",
        relatives,
        (reg.relatives || []).length,
        seats,
        status
      ]);
    });

    const csvContent = rows.map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ).join("\n");

    const bom = "\uFEFF"; // UTF-8 BOM để Excel đọc đúng tiếng Việt
    const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `danh-sach-dang-ky-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
  });

})();
