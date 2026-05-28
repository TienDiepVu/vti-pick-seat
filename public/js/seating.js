(function () {
  const CINEMA_ID = "rap1";

  let sessionId = sessionStorage.getItem("vti_seat_session_id");
  if (sessionId) {
    navigator.sendBeacon("/api/release-all-session", JSON.stringify({ sessionId }));
  }

  sessionId = "session_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  sessionStorage.setItem("vti_seat_session_id", sessionId);

  window.addEventListener("beforeunload", () => {
    navigator.sendBeacon("/api/release-all-session", JSON.stringify({ sessionId }));
  });

  const configs = {
    rap1: [
      { row: "B", count: 16 },
      { row: "C", count: 16 },
      { row: "D", count: 16 },
      { row: "E", count: 16 },
      { row: "F", count: 16 },
      { row: "G", count: 16 },
      { row: "H", count: 16 },
      { row: "J", count: 16 },

      { row: "K", count: 8, state: "leather" },
      { row: "L", count: 8, state: "leather" },
      { row: "M", count: 4, start: 5, state: "leather", rightOnly: true }
    ]
  };

  function createModal() {
    const modal = document.createElement("div");
    modal.className = "booking-modal";
    modal.innerHTML = `
      <form class="booking-form">
        <h2 class="inter-font">Thông tin đăng ký</h2>
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
          <button class="booking-cancel inter-font" type="button">Hủy</button>
          <button class="booking-submit inter-font" type="submit">Xác nhận</button>
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
    return CINEMA_ID;
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

  async function validateBooking(formData, allowUnregistered = false) {
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
        cinema: CINEMA_ID,
        account: formData.get("account"),
        unit: formData.get("unit"),
        attendees,
        sessionId,
        allowUnregistered
      })
    });

    return response.json();
  }

  modalForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    let result;
    const formData = new FormData(modalForm);

    try {
      result = await validateBooking(formData, false);
    } catch (error) {
      modalError.textContent = "Không kết nối được server kiểm tra đăng ký.";
      return;
    }

    if (!result.valid) {
      if (result.needsConfirm) {
        const confirmUnregistered = window.confirm(
          `${result.message}\nBạn có muốn đăng ký dưới dạng vé phát sinh không?`
        );
        if (confirmUnregistered) {
          try {
            result = await validateBooking(formData, true);
            if (!result.valid) {
              modalError.textContent = result.message || "Thông tin đăng ký không hợp lệ.";
              return;
            }
          } catch (error) {
            modalError.textContent = "Không kết nối được server để đăng ký phát sinh.";
            return;
          }
        } else {
          return;
        }
      } else {
        modalError.textContent = result.message || "Thông tin đăng ký không hợp lệ.";
        return;
      }
    }

    closeBookingModal(true);
  });

  modal.querySelector(".booking-cancel").addEventListener("click", () => {
    closeBookingModal(false);
  });

  function createSeat(row, seatNumber, isViewOnly) {
    const seat = document.createElement("button");
    seat.type = "button";
    seat.className = "seat";
    seat.dataset.seatCode = `${row.row}${seatNumber}`;

    if (row.state === "selected") {
      seat.classList.add("selected", "logo-seat");
      seat.disabled = true;
      seat.setAttribute("aria-label", `${row.row}${seatNumber} da chon`);
      seat.dataset.defaultSelected = "true";
    } else if (row.state === "leather") {
      seat.classList.add("leather");
      seat.textContent = seat.dataset.seatCode;
      seat.setAttribute("aria-label", `${row.row}${seatNumber}`);
    } else {
      seat.textContent = seat.dataset.seatCode;
      seat.setAttribute("aria-label", `${row.row}${seatNumber}`);
    }

    if (isViewOnly) {
      seat.disabled = true;
      seat.style.cursor = "default";
    }

    return seat;
  }

  function createPlaceholderSeat(withAisle = false) {
    const seat = document.createElement("button");
    seat.type = "button";
    seat.className = "seat seat-placeholder";
    seat.disabled = true;
    seat.setAttribute("aria-hidden", "true");
    seat.tabIndex = -1;
    seat.textContent = "";

    if (withAisle) {
      seat.classList.add("aisle-right");
    }

    return seat;
  }

  function renderSeats(root) {
    const key = getCinemaKey(root);
    const seating = root.querySelector("[data-seating]");
    const labels = root.querySelector("[data-labels]");
    const isViewOnly = root.classList.contains("view-only");
    const config = configs[key];

    if (!config) {
      window.console.error(`Không tìm thấy cấu hình sơ đồ ghế cho rạp: ${key}`);
      return;
    }

    seating.innerHTML = "";
    labels.innerHTML = "";

    config.forEach((row, rowIndex) => {
      const rowEl = document.createElement("div");
      rowEl.className = "seat-row";

      // Hàng M chỉ có M5-M8, nên thêm 4 ghế placeholder bên trái để đẩy sang phải
      if (row.rightOnly) {
        for (let placeholderIndex = 1; placeholderIndex <= 4; placeholderIndex += 1) {
          const placeholder = createPlaceholderSeat(placeholderIndex === 4);
          rowEl.appendChild(placeholder);
        }
      }

      for (let i = 1; i <= row.count; i += 1) {
        const seatNumber = (row.start || 1) + i - 1;
        const seat = createSeat(row, seatNumber, isViewOnly);

        // Hàng thường 16 ghế: lối đi sau ghế số 8
        if (!row.state && seatNumber === 8 && row.count >= 16) {
          seat.classList.add("aisle-right");
        }

        // Hàng ghế da K/L: lối đi sau ghế số 4
        if (row.state === "leather" && !row.rightOnly && seatNumber === 4) {
          seat.classList.add("aisle-right");
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
      const response = await fetch(`/api/bookings?cinema=${cinema}&sessionId=${sessionId}`);
      const data = await response.json();
      const bookedSet = new Set(data.seats || []);
      const heldSet = new Set(data.heldSeats || []);
      const isViewOnly = root.classList.contains("view-only");

      root.querySelectorAll(".seat").forEach((seat) => {
        if (seat.classList.contains("seat-placeholder")) {
          return;
        }

        if (seat.dataset.defaultSelected === "true") {
          return;
        }

        const seatCode = seat.dataset.seatCode;

        if (bookedSet.has(seatCode)) {
          seat.classList.remove("current", "held");
          seat.classList.add("selected", "logo-seat");
          seat.disabled = true;
          seat.textContent = "";
          seat.setAttribute("aria-label", `${seatCode} da chon`);
        } else if (heldSet.has(seatCode) && !isViewOnly) {
          if (seat.classList.contains("current")) {
            return;
          }
          seat.classList.remove("selected", "logo-seat");
          seat.classList.add("held");
          seat.disabled = isViewOnly;
          seat.textContent = seatCode;
          seat.setAttribute("aria-label", `${seatCode} dang giu cho`);
        } else {
          if (seat.classList.contains("current")) {
            return;
          }
          seat.classList.remove("selected", "logo-seat", "held");
          seat.disabled = isViewOnly;
          seat.textContent = seatCode;
          seat.setAttribute("aria-label", seatCode);
        }
      });
    } catch (error) {
      window.console.error("Failed to load bookings", error);
    }
  }

  function getSeatGroup(root, seat) {
    return [seat];
  }

  function setSeatGroupCurrent(seats, shouldSelect) {
    seats.forEach((seat) => {
      seat.classList.toggle("current", shouldSelect);
    });

    const seatCodes = seats.map((seat) => seat.dataset.seatCode || seat.textContent);
    if (seatCodes.length === 0) return;

    const root = seats[0].closest(".cinema");
    const cinema = root ? getCinemaKey(root) : CINEMA_ID;

    if (shouldSelect) {
      fetch("/api/hold-seats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cinema, seats: seatCodes, sessionId })
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.valid === false) {
            seats.forEach((seat) => seat.classList.remove("current"));
            window.alert(data.message);
          }
        })
        .catch((err) => window.console.error("Lỗi khi giữ ghế:", err));
    } else {
      fetch("/api/release-seats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cinema, seats: seatCodes, sessionId })
      }).catch((err) => window.console.error("Lỗi khi hủy giữ ghế:", err));
    }
  }

  function bindSeatSelection(root) {
    if (root.classList.contains("view-only")) return;

    root.querySelector("[data-seating]").addEventListener("click", (event) => {
      const seat = event.target.closest(".seat");
      if (!seat || seat.disabled || seat.classList.contains("seat-placeholder")) return;

      const seats = getSeatGroup(root, seat);
      setSeatGroupCurrent(seats, !seat.classList.contains("current"));
    });
  }

  function bindSave(root) {
    if (root.classList.contains("view-only")) return;
    const save = root.querySelector(".action.save");
    if (!save) return;

    save.addEventListener("click", async () => {
      const seats = Array.from(root.querySelectorAll(".seat.current"));

      if (seats.length === 0) {
        window.alert("Vui lòng chọn ghế trước khi lưu.");
        return;
      }

      const seatCodes = seats.map((seat) => seat.dataset.seatCode || seat.textContent);
      const cinema = getCinemaKey(root);

      try {
        const response = await fetch("/api/hold-seats", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            cinema,
            seats: seatCodes,
            sessionId
          })
        });

        if (response.status === 409) {
          const result = await response.json();
          window.alert(result.message || "Ghế đang được người khác chọn, vui lòng chọn ghế khác.");

          seats.forEach((seat) => {
            seat.classList.remove("current");
          });

          loadBookedSeats(root);
          return;
        }

        if (!response.ok) {
          throw new Error("Không thể giữ ghế tạm thời.");
        }
      } catch (error) {
        window.alert("Không thể kết nối đến server để giữ ghế tạm thời.");
        return;
      }

      const isValid = await openBookingModal(seats);

      if (!isValid) {
        try {
          await fetch("/api/release-seats", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              cinema,
              seats: seatCodes,
              sessionId
            })
          });
        } catch (error) {
          window.console.error("Failed to release seats:", error);
        }

        seats.forEach((seat) => {
          seat.classList.remove("current");
        });

        return;
      }

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
      const isViewOnly = root.classList.contains("view-only");
      const target = isViewOnly ? "view-cinema.html" : "cinema.html";
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

  function bindView(root) {
    const view = root.querySelector(".action.view");
    if (!view) return;

    view.addEventListener("click", () => {
      const target = "view-cinema.html";
      window.location.href = `./${target}`;
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

    if (!root.classList.contains("custom-flow")) {
      bindSeatSelection(root);
      bindSave(root);
      bindList(root);
      bindNext(root);
      bindView(root);
    }

    setInterval(() => {
      loadBookedSeats(root);
    }, 3000);
  });

  window.addEventListener("resize", setScale);
  setScale();

  window.SeatingApp = {
    cinemaId: CINEMA_ID,
    renderSeats,
    loadBookedSeats,
    getSeatGroup,
    setSeatGroupCurrent,
    sessionId,
    configs
  };
})();