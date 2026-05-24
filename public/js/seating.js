(function () {
  const configs = {
    "cinema-1": [
      { row: "A", count: 12, state: "selected" },
      { row: "B", count: 12, state: "selected" },
      { row: "C", count: 12 },
      { row: "D", count: 12 },
      { row: "E", count: 10 },
      { row: "F", count: 12 },
      { row: "G", count: 11 },
      { row: "H", count: 12 },
      { row: "I", count: 11 },
      { row: "J", count: 12 },
      { row: "K", count: 11 },
      { row: "L", count: 11 },
      { row: "M", count: 10, state: "couple" }
    ],
    "cinema-2": [
      { row: "A", count: 16, state: "selected" },
      { row: "B", count: 17, state: "selected" },
      { row: "C", count: 14 },
      { row: "D", count: 15 },
      { row: "E", count: 13 },
      { row: "F", count: 15 },
      { row: "G", count: 14 },
      { row: "H", count: 15 },
      { row: "I", count: 14 },
      { row: "J", count: 14 },
      { row: "K", count: 13 },
      { row: "L", count: 11 },
      { row: "M", count: 10, state: "couple" }
    ]
  };

  function createModal() {
    const modal = document.createElement("div");
    modal.className = "booking-modal";
    modal.innerHTML = `
      <form class="booking-form">
        <h2>Thông tin đăng ký</h2>
        <div class="booking-top">
          <label>
            Account CBNV
            <input name="account" autocomplete="off" required>
          </label>
          <label>
            Đơn vị
            <input name="unit" autocomplete="off" required>
          </label>
        </div>
        <div class="booking-attendees" data-booking-attendees></div>
        <p class="booking-error" data-booking-error></p>
        <div class="booking-actions">
          <button class="booking-cancel" type="button">Hủy</button>
          <button class="booking-submit" type="submit">Xác nhận</button>
        </div>
      </form>
    `;
    document.body.appendChild(modal);
    return modal;
  }

  const modal = createModal();
  const modalForm = modal.querySelector(".booking-form");
  const modalAttendees = modal.querySelector("[data-booking-attendees]");
  const modalError = modal.querySelector("[data-booking-error]");
  let modalResolve = null;

  function getCinemaKey(root) {
    return root.classList.contains("cinema-2") ? "cinema-2" : "cinema-1";
  }

  function openBookingModal(seats) {
    modalForm.reset();
    modalError.textContent = "";
    modalAttendees.innerHTML = `
      ${seats.map((seat) => `
        <label class="booking-attendee-row">
          <span class="booking-seat-code">${seat.textContent}</span>
          <input name="attendeeName" data-seat="${seat.textContent}" autocomplete="off" placeholder="Nhập họ và tên" required>
        </label>
      `).join("")}
    `;
    modal.classList.add("open");
    modal.querySelector("input").focus();

    return new Promise((resolve) => {
      modalResolve = resolve;
    });
  }

  function closeBookingModal(result) {
    modal.classList.remove("open");
    if (modalResolve) {
      modalResolve(result);
      modalResolve = null;
    }
  }

  async function validateBooking(formData) {
    const attendees = Array.from(modal.querySelectorAll('[name="attendeeName"]')).map((input) => ({
      seat: input.dataset.seat,
      name: input.value
    }));

    const response = await fetch("/api/validate-booking", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        cinema: document.querySelector(".fit") ? getCinemaKey(document.querySelector(".fit")) : "cinema-1",
        account: formData.get("account"),
        unit: formData.get("unit"),
        attendees
      })
    });

    return response.json();
  }

  modalForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    let result;

    try {
      result = await validateBooking(new FormData(modalForm));
    } catch (error) {
      modalError.textContent = "Không kết nối được server kiểm tra đăng ký.";
      return;
    }

    if (!result.valid) {
      modalError.textContent = result.message || "Thông tin đăng ký không hợp lệ.";
      return;
    }

    closeBookingModal(true);
  });

  modal.querySelector(".booking-cancel").addEventListener("click", () => {
    closeBookingModal(false);
  });

  function renderSeats(root) {
    const key = getCinemaKey(root);
    const seating = root.querySelector("[data-seating]");
    const labels = root.querySelector("[data-labels]");

    configs[key].forEach((row, rowIndex) => {
      const rowEl = document.createElement("div");
      rowEl.className = "seat-row";

      for (let i = 1; i <= row.count; i += 1) {
        const seat = document.createElement("button");
        seat.type = "button";
        seat.className = "seat";
        seat.dataset.seatCode = `${row.row}${i}`;

        if (row.state === "selected") {
          seat.classList.add("selected", "logo-seat");
          seat.disabled = true;
          seat.setAttribute("aria-label", `${row.row}${i} da chon`);
        } else if (row.state === "couple") {
          seat.classList.add("couple");
          seat.classList.add(i % 2 === 1 ? "couple-left" : "couple-right");
          seat.dataset.pair = String(Math.ceil(i / 2));
          seat.textContent = seat.dataset.seatCode;
          seat.setAttribute("aria-label", `${row.row}${i}`);
        } else {
          seat.textContent = seat.dataset.seatCode;
          seat.setAttribute("aria-label", `${row.row}${i}`);
        }

        rowEl.appendChild(seat);
      }

      seating.appendChild(rowEl);

      const label = document.createElement("div");
      label.className = "row-label";
      label.style.setProperty("--i", rowIndex);
      label.textContent = row.row;
      labels.appendChild(label);
    });
  }

  async function loadBookedSeats(root) {
    const cinema = getCinemaKey(root);

    try {
      const response = await fetch(`/api/bookings?cinema=${cinema}`);
      const data = await response.json();

      (data.seats || []).forEach((seatCode) => {
        const seat = root.querySelector(`.seat[data-seat-code="${seatCode}"]`);
        if (!seat) return;

        seat.classList.remove("current");
        seat.classList.add("selected", "logo-seat");
        seat.disabled = true;
        seat.textContent = "";
        seat.setAttribute("aria-label", `${seatCode} da chon`);
      });
    } catch (error) {
      window.console.error("Failed to load bookings", error);
    }
  }

  function getSeatGroup(root, seat) {
    if (!seat.classList.contains("couple")) {
      return [seat];
    }

    return Array.from(root.querySelectorAll(`.seat.couple[data-pair="${seat.dataset.pair}"]`));
  }

  function setSeatGroupCurrent(seats, shouldSelect) {
    seats.forEach((seat) => {
      seat.classList.toggle("current", shouldSelect);
    });
  }

  function bindSeatSelection(root) {
    root.querySelector("[data-seating]").addEventListener("click", (event) => {
      const seat = event.target.closest(".seat");
      if (!seat || seat.disabled) return;

      const seats = getSeatGroup(root, seat);
      setSeatGroupCurrent(seats, !seat.classList.contains("current"));
    });
  }

  function bindSave(root) {
    const save = root.querySelector(".action.save");
    if (!save) return;

    save.addEventListener("click", async () => {
      const seats = Array.from(root.querySelectorAll(".seat.current"));

      if (seats.length === 0) {
        window.alert("Vui lòng chọn ghế trước khi lưu.");
        return;
      }

      const isValid = await openBookingModal(seats);
      if (!isValid) return;

      seats.forEach((seat) => {
        const seatCode = seat.dataset.seatCode || seat.textContent;
        seat.classList.remove("current");
        seat.classList.add("selected", "logo-seat");
        seat.disabled = true;
        seat.textContent = "";
        seat.setAttribute("aria-label", `${seatCode} da chon`);
      });
    });
  }

  function bindNext(root) {
    const next = root.querySelector(".action.next");
    if (!next) return;

    next.addEventListener("click", () => {
      const target = root.classList.contains("cinema-1") ? "cinema2.html" : "cinema1.html";
      window.location.href = `./${target}`;
    });
  }

  function bindList(root) {
    const list = root.querySelector(".action.list");
    if (!list) return;

    list.addEventListener("click", () => {
      window.location.href = "./monitoring.html";
    });
  }

  function setScale() {
    const stage = document.querySelector(".stage");
    if (!stage) return;
    const scale = Math.min(stage.clientWidth / 1920, stage.clientHeight / 1080);
    stage.style.setProperty("--scale", scale);
  }

  document.querySelectorAll(".fit").forEach((root) => {
    renderSeats(root);
    loadBookedSeats(root);
    bindSeatSelection(root);
    bindSave(root);
    bindList(root);
    bindNext(root);
  });
  window.addEventListener("resize", setScale);
  setScale();
})();
