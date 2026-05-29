(function () {
  // --- Session Management ---
  let sessionId = sessionStorage.getItem("vti_seat_session_id");
  if (sessionId) {
    navigator.sendBeacon("/api/release-all-session", JSON.stringify({ sessionId }));
  }
  sessionId = "session_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  sessionStorage.setItem("vti_seat_session_id", sessionId);

  window.addEventListener("beforeunload", () => {
    navigator.sendBeacon("/api/release-all-session", JSON.stringify({ sessionId }));
  });

  // --- Cinema Config (fetched from server) ---
  let cinemaConfig = null;

  async function fetchCinemaConfig() {
    const res = await fetch("/api/cinema-config");
    cinemaConfig = await res.json();
    return cinemaConfig;
  }

  // --- Modal ---
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
  let modalCinema = "cinema"; // cinema key active khi modal mở

  function getCinemaKey(root) {
    return root.dataset.cinema || (cinemaConfig && cinemaConfig.cinemas && cinemaConfig.cinemas[0]) || "cinema";
  }

  function openBookingModal(seats) {
    const root = seats[0].closest(".cinema");
    if (root) modalCinema = getCinemaKey(root);

    modalForm.reset();
    modalError.textContent = "";
    modalAttendees.innerHTML = seats.map((seat) => `
      <label class="booking-attendee-row">
        <span class="booking-seat-code">${seat.dataset.seatCode || seat.textContent}</span>
        <input name="attendeeName" data-seat="${seat.dataset.seatCode || seat.textContent}" autocomplete="off" placeholder="Nhập họ và tên" required>
      </label>
    `).join("");
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
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cinema: modalCinema,
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

  // --- Seat Rendering ---
  function renderSeats(root) {
    const key = getCinemaKey(root);
    const cfg = cinemaConfig && cinemaConfig.seats && cinemaConfig.seats[key];
    if (!cfg) return;

    const { rows, aisleAfter: defaultAisle } = cfg;
    const seating = root.querySelector("[data-seating]");
    const labels = root.querySelector("[data-labels]");
    if (!seating || !labels) return;
    const isViewOnly = root.classList.contains("view-only");

    // Xóa nội dung cũ (hỗ trợ re-render khi đổi cinema)
    seating.innerHTML = "";
    labels.innerHTML = "";

    let maxCount = 0;
    rows.forEach(r => {
      const count = r.count + (r.leftEmpty || 0);
      if (count > maxCount) maxCount = count;
    });

    const totalWidth = maxCount * 64 + (maxCount - 1) * 14 + 54;
    const groupWidth = totalWidth + 112; // 112 = 32px khoảng cách + 80px row-labels
    const startLeft = (1920 - groupWidth) / 2;
    
    seating.style.width = `${totalWidth}px`;
    if (key === "cinema-1") {
      seating.style.left = `${startLeft + 112}px`;
      labels.style.left = `${startLeft}px`;
    } else {
      seating.style.left = `${startLeft}px`;
      labels.style.left = `${startLeft + totalWidth + 32}px`;
    }

    // Căn giữa theo chiều dọc có tính toán marginTop
    let totalHeight = 0;
    rows.forEach(r => {
      if (r.marginTop) totalHeight += parseInt(r.marginTop);
      totalHeight += 50;
    });
    seating.style.top = `calc(50% - ${totalHeight / 2}px)`;
    labels.style.top = `calc(50% - ${totalHeight / 2}px)`;

    const cinemaNameLabel = document.createElement("div");
    cinemaNameLabel.className = "row-label cinema-name-label";
    cinemaNameLabel.style.top = "-50px";
    cinemaNameLabel.style.left = "50%";
    cinemaNameLabel.style.transform = "translateX(-50%)";
    cinemaNameLabel.style.width = "160px";
    cinemaNameLabel.style.fontSize = "32px";
    cinemaNameLabel.textContent = key === "cinema" ? "Cinema" : key.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
    labels.appendChild(cinemaNameLabel);

    let currentTop = 0;

    rows.forEach((row, rowIndex) => {
      const rowEl = document.createElement("div");
      rowEl.className = "seat-row";
      
      if (row.marginTop) {
        rowEl.style.marginTop = row.marginTop;
        currentTop += parseInt(row.marginTop);
      }

      const rowAisleAfter = row.aisleAfter !== undefined ? row.aisleAfter : defaultAisle;
      const offset = row.offset || 0;

      // Thêm ô trống bên trái (hàng chỉ có ghế bên phải, ví dụ hàng M rạp 1)
      if (row.leftEmpty) {
        for (let e = 1; e <= row.leftEmpty; e++) {
          const spacer = document.createElement("div");
          spacer.className = "seat seat-spacer";
          if (row.state === "couple") spacer.classList.add("couple");
          if (row.state === "leather") spacer.classList.add("leather");
          if (e === rowAisleAfter) spacer.classList.add("aisle-right");
          rowEl.appendChild(spacer);
        }
      }

      for (let i = 1; i <= row.count; i++) {
        const seatNum = i + offset;
        const seat = document.createElement("button");
        seat.type = "button";
        seat.className = "seat";
        seat.dataset.seatCode = `${row.row}${seatNum}`;

        if (row.state === "selected") {
          seat.classList.add("selected", "logo-seat");
          seat.disabled = true;
          seat.setAttribute("aria-label", `${row.row}${seatNum} da chon`);
          seat.dataset.defaultSelected = "true";
        } else if (row.state === "couple") {
          const pairIndex = Math.ceil(i / 2);
          seat.classList.add("couple");
          seat.classList.add(i % 2 === 1 ? "couple-left" : "couple-right");
          // Prefix pair bằng tên hàng để tránh nhầm lẫn giữa các hàng couple khác nhau
          seat.dataset.pair = `${row.row}-${pairIndex}`;
          seat.textContent = seat.dataset.seatCode;
          seat.setAttribute("aria-label", `${row.row}${seatNum}`);
        } else if (row.state === "leather") {
          seat.classList.add("leather");
          seat.textContent = seat.dataset.seatCode;
          seat.setAttribute("aria-label", `${row.row}${seatNum}`);
        } else {
          seat.textContent = seat.dataset.seatCode;
          seat.setAttribute("aria-label", `${row.row}${seatNum}`);
        }

        // Đánh dấu lối đi (chỉ khi không có leftEmpty, vì leftEmpty đã xử lý rồi)
        if (!row.leftEmpty && i === rowAisleAfter) {
          seat.classList.add("aisle-right");
        }

        if (isViewOnly) {
          seat.disabled = true;
          seat.style.cursor = "default";
        }

        rowEl.appendChild(seat);
      }

      seating.appendChild(rowEl);

      const label = document.createElement("div");
      label.className = "row-label";
      // Đặt top trực tiếp bằng giá trị currentTop thay vì dùng biến css --i
      label.style.top = `${currentTop}px`;
      label.textContent = row.row;
      labels.appendChild(label);
      
      currentTop += 50;
    });

    // Cập nhật legend động dựa trên các loại ghế thực tế có trong rạp
    const legend = root.querySelector(".legend");
    if (legend) {
      const hasCouple = rows.some(r => r.state === "couple");
      const hasLeather = rows.some(r => r.state === "leather");
      
      const coupleSwatch = legend.querySelector(".legend-swatch.couple");
      if (coupleSwatch) {
        const coupleItem = coupleSwatch.closest(".legend-item");
        if (coupleItem) coupleItem.style.display = hasCouple ? "" : "none";
      }
      
      const leatherSwatch = legend.querySelector(".legend-swatch.leather");
      if (leatherSwatch) {
        const leatherItem = leatherSwatch.closest(".legend-item");
        if (leatherItem) leatherItem.style.display = hasLeather ? "" : "none";
      }
    }
  }

  // --- Load Booked Seats ---
  async function loadBookedSeats(root) {
    const cinema = getCinemaKey(root);

    try {
      const response = await fetch(`/api/bookings?cinema=${cinema}&sessionId=${sessionId}`);
      const data = await response.json();
      const bookedSet = new Set(data.seats || []);
      const heldSet = new Set(data.heldSeats || []);
      const isViewOnly = root.classList.contains("view-only");

      root.querySelectorAll(".seat:not(.seat-spacer)").forEach((seat) => {
        if (seat.dataset.defaultSelected === "true") return;

        const seatCode = seat.dataset.seatCode;

        if (bookedSet.has(seatCode)) {
          seat.classList.remove("current", "held");
          seat.classList.add("selected", "logo-seat");
          seat.disabled = true;
          seat.textContent = "";
          seat.setAttribute("aria-label", `${seatCode} da chon`);
        } else if (heldSet.has(seatCode) && !isViewOnly) {
          if (seat.classList.contains("current")) return;
          seat.classList.remove("selected", "logo-seat");
          seat.classList.add("held");
          seat.disabled = isViewOnly;
          seat.textContent = seatCode;
          seat.setAttribute("aria-label", `${seatCode} dang giu cho`);
        } else {
          if (seat.classList.contains("current")) return;
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

  // --- Couple Seat Grouping ---
  function getSeatGroup(root, seat) {
    if (!seat.classList.contains("couple")) return [seat];
    return Array.from(root.querySelectorAll(`.seat.couple[data-pair="${seat.dataset.pair}"]`));
  }

  function setSeatGroupCurrent(seats, shouldSelect) {
    seats.forEach((seat) => {
      seat.classList.toggle("current", shouldSelect);
    });

    const seatCodes = seats.map(s => s.dataset.seatCode || s.textContent);
    if (seatCodes.length === 0) return;

    const root = seats[0].closest(".cinema");
    const cinema = root ? getCinemaKey(root) : (cinemaConfig && cinemaConfig.cinemas && cinemaConfig.cinemas[0]) || "cinema";

    if (shouldSelect) {
      fetch("/api/hold-seats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cinema, seats: seatCodes, sessionId })
      }).then(res => res.json()).then(data => {
        if (data.valid === false) {
          seats.forEach(seat => seat.classList.remove("current"));
          window.alert(data.message);
        }
      }).catch(err => window.console.error("Lỗi khi giữ ghế:", err));
    } else {
      fetch("/api/release-seats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cinema, seats: seatCodes, sessionId })
      }).catch(err => window.console.error("Lỗi khi hủy giữ ghế:", err));
    }
  }

  // --- Event Bindings ---
  function bindSeatSelection(root) {
    if (root.classList.contains("view-only")) return;
    root.querySelector("[data-seating]").addEventListener("click", (event) => {
      const seat = event.target.closest(".seat:not(.seat-spacer)");
      if (!seat || seat.disabled) return;
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

      const seatCodes = seats.map(s => s.dataset.seatCode || s.textContent);
      const cinema = getCinemaKey(root);

      try {
        const response = await fetch("/api/hold-seats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cinema, seats: seatCodes, sessionId })
        });

        if (response.status === 409) {
          const result = await response.json();
          window.alert(result.message || "Ghế đang được người khác chọn, vui lòng chọn ghế khác.");
          seats.forEach((seat) => seat.classList.remove("current"));
          loadBookedSeats(root);
          return;
        }

        if (!response.ok) throw new Error("Không thể giữ ghế tạm thời.");
      } catch (error) {
        window.alert("Không thể kết nối đến server để giữ ghế tạm thời.");
        return;
      }

      const isValid = await openBookingModal(seats);

      if (!isValid) {
        try {
          await fetch("/api/release-seats", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cinema, seats: seatCodes, sessionId })
          });
        } catch (error) {
          window.console.error("Failed to release seats:", error);
        }
        seats.forEach((seat) => seat.classList.remove("current"));
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
      window.location.href = "./cinema.html";
    });
  }

  function bindList(root) {
    // monitoring.html đã được gỡ bỏ
  }

  function bindView(root) {
    const view = root.querySelector(".action.view");
    if (!view) return;
    view.addEventListener("click", () => {
      window.location.href = "./cinema.html";
    });
  }

  // --- Scale ---
  function setScale() {
    const stage = document.querySelector(".stage");
    if (!stage) return;
    const scale = Math.min(stage.clientWidth / 1920, stage.clientHeight / 1080);
    stage.style.setProperty("--scale", scale);
  }

  // --- Cinema View Only Page (cinema.html) ---
  function initViewCinemas(container) {
    const { cinemas, labels } = cinemaConfig;

    // Dual mode: thêm tab switcher
    if (cinemas.length > 1) {
      const tabs = document.createElement("div");
      tabs.className = "cinema-tabs";
      cinemas.forEach((cinemaKey, index) => {
        const btn = document.createElement("button");
        btn.className = `cinema-tab inter-font${index === 0 ? " active" : ""}`;
        btn.dataset.cinemaKey = cinemaKey;
        btn.textContent = labels[cinemaKey] || cinemaKey;
        tabs.appendChild(btn);
      });
      container.appendChild(tabs);

      tabs.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-cinema-key]");
        if (!btn) return;
        const key = btn.dataset.cinemaKey;
        tabs.querySelectorAll(".cinema-tab").forEach(b => b.classList.toggle("active", b === btn));
        container.querySelectorAll(".fit.cinema[data-view-managed]").forEach(sec => {
          sec.style.display = sec.dataset.cinema === key ? "" : "none";
        });
      });
    }

    // Tạo section cho mỗi rạp
    cinemas.forEach((cinemaKey, index) => {
      const section = document.createElement("section");
      section.className = "fit cinema view-only";
      section.dataset.cinema = cinemaKey;
      section.dataset.viewManaged = "true";
      section.setAttribute("aria-label", `${labels[cinemaKey] || cinemaKey} seating layout`);
      if (cinemas.length > 1 && index > 0) section.style.display = "none";

      section.innerHTML = `
        <div class="seating" data-seating></div>
        <div class="row-labels" data-labels aria-hidden="true"></div>
        <div class="legend" aria-label="Seat legend">
          <div class="legend-item inter-font"><span class="legend-swatch logo-seat"></span>Đã đặt</div>
          <div class="legend-item inter-font"><span class="legend-swatch couple"></span>Ghế đôi</div>
          <div class="legend-item inter-font"><span class="legend-swatch leather"></span>Ghế da</div>
          <div class="legend-item inter-font"><span class="legend-swatch"></span>Còn trống</div>
        </div>
      `;
      container.appendChild(section);

      renderSeats(section);
      loadBookedSeats(section);
      setInterval(() => loadBookedSeats(section), 3000);
    });
  }

  // --- Main Init ---
  async function init() {
    try {
      await fetchCinemaConfig();
    } catch (err) {
      window.console.error("Failed to fetch cinema config:", err);
      return;
    }

    // Trang cinema.html: tạo sections động
    const viewRoot = document.getElementById("view-cinemas-root");
    if (viewRoot) {
      initViewCinemas(viewRoot);
    }

    // Các .fit sections tĩnh trong HTML (index.html step-seats, v.v.)
    // Bỏ qua các section do initViewCinemas tạo (data-view-managed)
    document.querySelectorAll(".fit:not([data-view-managed])").forEach((root) => {
      renderSeats(root);
      loadBookedSeats(root);

      if (!root.classList.contains("custom-flow")) {
        bindSeatSelection(root);
        bindSave(root);
        bindList(root);
        bindNext(root);
        bindView(root);
      }

      setInterval(() => loadBookedSeats(root), 3000);
    });

    window.addEventListener("resize", setScale);
    setScale();

    window.SeatingApp = {
      renderSeats,
      loadBookedSeats,
      getSeatGroup,
      setSeatGroupCurrent,
      sessionId,
      cinemaConfig,
      getCinemaKey
    };
  }

  init().catch(err => window.console.error("SeatingApp init error:", err));
})();
