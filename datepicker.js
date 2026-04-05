/**
 * Custom Date Picker
 * Replaces all native date/month inputs with elegant custom pickers.
 * Values remain compatible with the existing backend format:
 *   - Full date fields : YYYY-MM-DD
 *   - Month fields     : YYYY-MM
 */
(function () {
  'use strict';

  var MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December'
  ];
  var MONTHS_SHORT = [
    'Jan','Feb','Mar','Apr','May','Jun',
    'Jul','Aug','Sep','Oct','Nov','Dec'
  ];
  var WEEKDAYS = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  // Capture the native value descriptor so we can bypass our own override
  var nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

  // Only one picker popup should be visible at a time
  var activeClose = null;

  document.addEventListener('mousedown', function (e) {
    if (activeClose && !e.target.closest('.cdp-wrapper')) {
      activeClose();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && activeClose) {
      activeClose();
    }
  });

  // ─── Utility helpers ──────────────────────────────────────────────────────

  function parseDate(val) {
    if (!val) return null;
    var m = String(val).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? { year: +m[1], month: +m[2] - 1, day: +m[3] } : null;
  }

  function parseMonth(val) {
    if (!val) return null;
    var m = String(val).match(/^(\d{4})-(\d{2})$/);
    return m ? { year: +m[1], month: +m[2] - 1 } : null;
  }

  function toDateString(y, m, d) {
    return y + '-' + pad(m + 1) + '-' + pad(d);
  }

  function toMonthString(y, m) {
    return y + '-' + pad(m + 1);
  }

  function pad(n) {
    return String(n).padStart(2, '0');
  }

  function displayDate(val) {
    var d = parseDate(val);
    return d ? pad(d.day) + ' ' + MONTHS_SHORT[d.month] + ' ' + d.year : '';
  }

  function displayMonth(val) {
    var d = parseMonth(val);
    return d ? MONTHS[d.month] + ' ' + d.year : '';
  }

  function daysInMonth(y, m) {
    return new Date(y, m + 1, 0).getDate();
  }

  function firstWeekday(y, m) {
    return new Date(y, m, 1).getDay();
  }

  var CAL_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"' +
    ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"' +
    ' stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/>' +
    '<line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>' +
    '<line x1="3" y1="10" x2="21" y2="10"/></svg>';

  // ─── Build shared wrapper UI ───────────────────────────────────────────────

  function buildWrapper() {
    var wrapper = document.createElement('div');
    wrapper.className = 'cdp-wrapper';

    var field = document.createElement('div');
    field.className = 'cdp-field';
    field.tabIndex = 0;
    field.setAttribute('role', 'button');
    field.setAttribute('aria-haspopup', 'true');
    field.setAttribute('aria-expanded', 'false');

    var icon = document.createElement('span');
    icon.className = 'cdp-icon';
    icon.innerHTML = CAL_ICON;

    var display = document.createElement('span');
    display.className = 'cdp-display cdp-placeholder';

    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'cdp-clear';
    clearBtn.innerHTML = '&times;';
    clearBtn.style.display = 'none';
    clearBtn.setAttribute('aria-label', 'Clear');

    field.appendChild(icon);
    field.appendChild(display);
    field.appendChild(clearBtn);

    var popup = document.createElement('div');
    popup.className = 'cdp-popup';
    popup.style.display = 'none';

    wrapper.appendChild(field);
    wrapper.appendChild(popup);

    return { wrapper: wrapper, field: field, display: display, clearBtn: clearBtn, popup: popup };
  }

  // Position popup below (or above if not enough space) the wrapper
  function positionPopup(wrapper, popup) {
    var rect = wrapper.getBoundingClientRect();
    var isMonth = popup.classList.contains('cdp-month-popup');
    var popupH = isMonth ? 260 : 320;
    var popupW = isMonth ? 240 : 280;

    // Vertical
    if (window.innerHeight - rect.bottom < popupH && rect.top > popupH) {
      popup.style.top = 'auto';
      popup.style.bottom = 'calc(100% + 4px)';
    } else {
      popup.style.top = 'calc(100% + 4px)';
      popup.style.bottom = 'auto';
    }

    // Horizontal
    if (rect.left + popupW > window.innerWidth - 8) {
      popup.style.left = 'auto';
      popup.style.right = '0';
    } else {
      popup.style.left = '0';
      popup.style.right = 'auto';
    }
  }

  // ─── Full Date Picker ─────────────────────────────────────────────────────

  function initDatePicker(input) {
    var compact = input.classList.contains('history-filter-date');
    var ui = buildWrapper();

    if (compact) ui.wrapper.classList.add('cdp-compact');

    // Insert wrapper before the input, then move input inside (hidden)
    input.parentNode.insertBefore(ui.wrapper, input);
    input.style.display = 'none';
    input.type = 'hidden';
    ui.wrapper.appendChild(input);

    var vy = new Date().getFullYear();
    var vm = new Date().getMonth();
    var isOpen = false;

    function getVal()     { return nativeValue.get.call(input); }
    function setNative(v) { nativeValue.set.call(input, v); }

    function refreshDisplay(val) {
      var txt = displayDate(val);
      if (txt) {
        ui.display.textContent = txt;
        ui.display.classList.remove('cdp-placeholder');
        ui.clearBtn.style.display = '';
      } else {
        ui.display.textContent = compact ? 'Filter by date' : 'Select date';
        ui.display.classList.add('cdp-placeholder');
        ui.clearBtn.style.display = 'none';
      }
    }

    function renderCalendar() {
      var sel   = parseDate(getVal());
      var today = new Date();
      ui.popup.innerHTML = '';

      // Header
      var hdr   = document.createElement('div');
      hdr.className = 'cdp-cal-header';

      var prev  = document.createElement('button');
      prev.type = 'button'; prev.className = 'cdp-nav-btn'; prev.innerHTML = '&#8249;';
      prev.onclick = function (e) {
        e.stopPropagation();
        vm--;
        if (vm < 0) { vm = 11; vy--; }
        renderCalendar();
      };

      var titleEl = document.createElement('span');
      titleEl.className = 'cdp-cal-title';
      titleEl.textContent = MONTHS[vm] + ' ' + vy;

      var nxt   = document.createElement('button');
      nxt.type  = 'button'; nxt.className = 'cdp-nav-btn'; nxt.innerHTML = '&#8250;';
      nxt.onclick = function (e) {
        e.stopPropagation();
        vm++;
        if (vm > 11) { vm = 0; vy++; }
        renderCalendar();
      };

      hdr.appendChild(prev); hdr.appendChild(titleEl); hdr.appendChild(nxt);

      // Weekday row
      var wRow = document.createElement('div');
      wRow.className = 'cdp-week-row';
      WEEKDAYS.forEach(function (d) {
        var s = document.createElement('span');
        s.className = 'cdp-week-day'; s.textContent = d;
        wRow.appendChild(s);
      });

      // Day grid
      var grid = document.createElement('div');
      grid.className = 'cdp-day-grid';

      var start = firstWeekday(vy, vm);
      var days  = daysInMonth(vy, vm);

      for (var i = 0; i < start; i++) {
        var emp = document.createElement('span');
        emp.className = 'cdp-day-cell cdp-day-empty';
        grid.appendChild(emp);
      }

      for (var d = 1; d <= days; d++) {
        (function (day) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'cdp-day-cell';
          btn.textContent = day;

          if (day === today.getDate() && vm === today.getMonth() && vy === today.getFullYear()) {
            btn.classList.add('cdp-day-today');
          }
          if (sel && day === sel.day && vm === sel.month && vy === sel.year) {
            btn.classList.add('cdp-day-selected');
          }

          btn.onclick = function (e) {
            e.stopPropagation();
            setValue(toDateString(vy, vm, day));
            closePopup();
          };
          grid.appendChild(btn);
        })(d);
      }

      // Footer
      var footer = document.createElement('div');
      footer.className = 'cdp-footer';
      var clr = document.createElement('button');
      clr.type = 'button'; clr.className = 'cdp-footer-clear'; clr.textContent = 'Clear';
      clr.onclick = function (e) { e.stopPropagation(); setValue(''); closePopup(); };
      footer.appendChild(clr);

      ui.popup.appendChild(hdr);
      ui.popup.appendChild(wRow);
      ui.popup.appendChild(grid);
      ui.popup.appendChild(footer);
    }

    function openPopup() {
      if (activeClose && activeClose !== closePopup) activeClose();
      var d = parseDate(getVal());
      if (d) { vy = d.year; vm = d.month; }
      renderCalendar();
      ui.popup.style.display = '';
      ui.field.setAttribute('aria-expanded', 'true');
      positionPopup(ui.wrapper, ui.popup);
      isOpen = true;
      activeClose = closePopup;
    }

    function closePopup() {
      ui.popup.style.display = 'none';
      ui.field.setAttribute('aria-expanded', 'false');
      isOpen = false;
      if (activeClose === closePopup) activeClose = null;
    }

    function setValue(val) {
      setNative(val);
      refreshDisplay(val);
      input.dispatchEvent(new Event('input',  { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Allow existing script.js code to set/get the value seamlessly
    Object.defineProperty(input, 'value', {
      configurable: true,
      get: function () { return nativeValue.get.call(this); },
      set: function (val) {
        nativeValue.set.call(this, val);
        refreshDisplay(val);
      }
    });

    ui.field.addEventListener('click', function (e) {
      e.stopPropagation();
      isOpen ? closePopup() : openPopup();
    });
    ui.field.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        isOpen ? closePopup() : openPopup();
      }
    });
    ui.clearBtn.addEventListener('click', function (e) {
      e.stopPropagation(); setValue('');
    });
    ui.popup.addEventListener('mousedown', function (e) { e.stopPropagation(); });

    refreshDisplay(getVal());
  }

  // ─── Month / Year Picker ──────────────────────────────────────────────────

  function initMonthPicker(input) {
    var ui = buildWrapper();
    ui.popup.classList.add('cdp-month-popup');

    input.parentNode.insertBefore(ui.wrapper, input);
    input.style.display = 'none';
    input.type = 'hidden';
    ui.wrapper.appendChild(input);

    var vy = new Date().getFullYear();
    var isOpen = false;

    function getVal()     { return nativeValue.get.call(input); }
    function setNative(v) { nativeValue.set.call(input, v); }

    function refreshDisplay(val) {
      var txt = displayMonth(val);
      if (txt) {
        ui.display.textContent = txt;
        ui.display.classList.remove('cdp-placeholder');
        ui.clearBtn.style.display = '';
      } else {
        ui.display.textContent = 'Select month';
        ui.display.classList.add('cdp-placeholder');
        ui.clearBtn.style.display = 'none';
      }
    }

    function renderMonthPicker() {
      var sel = parseMonth(getVal());
      ui.popup.innerHTML = '';

      // Header (year navigation)
      var hdr = document.createElement('div');
      hdr.className = 'cdp-cal-header';

      var prev = document.createElement('button');
      prev.type = 'button'; prev.className = 'cdp-nav-btn'; prev.innerHTML = '&#8249;';
      prev.onclick = function (e) { e.stopPropagation(); vy--; renderMonthPicker(); };

      var titleEl = document.createElement('span');
      titleEl.className = 'cdp-cal-title';
      titleEl.textContent = vy;

      var nxt = document.createElement('button');
      nxt.type = 'button'; nxt.className = 'cdp-nav-btn'; nxt.innerHTML = '&#8250;';
      nxt.onclick = function (e) { e.stopPropagation(); vy++; renderMonthPicker(); };

      hdr.appendChild(prev); hdr.appendChild(titleEl); hdr.appendChild(nxt);

      // Month grid (3 columns × 4 rows)
      var grid = document.createElement('div');
      grid.className = 'cdp-month-grid';

      MONTHS_SHORT.forEach(function (name, i) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cdp-month-cell';
        btn.textContent = name;
        if (sel && sel.month === i && sel.year === vy) btn.classList.add('cdp-month-selected');
        btn.onclick = function (e) {
          e.stopPropagation();
          setValue(toMonthString(vy, i));
          closePopup();
        };
        grid.appendChild(btn);
      });

      // Footer
      var footer = document.createElement('div');
      footer.className = 'cdp-footer';
      var clr = document.createElement('button');
      clr.type = 'button'; clr.className = 'cdp-footer-clear'; clr.textContent = 'Clear';
      clr.onclick = function (e) { e.stopPropagation(); setValue(''); closePopup(); };
      footer.appendChild(clr);

      ui.popup.appendChild(hdr);
      ui.popup.appendChild(grid);
      ui.popup.appendChild(footer);
    }

    function openPopup() {
      if (activeClose && activeClose !== closePopup) activeClose();
      var d = parseMonth(getVal());
      if (d) vy = d.year;
      renderMonthPicker();
      ui.popup.style.display = '';
      ui.field.setAttribute('aria-expanded', 'true');
      positionPopup(ui.wrapper, ui.popup);
      isOpen = true;
      activeClose = closePopup;
    }

    function closePopup() {
      ui.popup.style.display = 'none';
      ui.field.setAttribute('aria-expanded', 'false');
      isOpen = false;
      if (activeClose === closePopup) activeClose = null;
    }

    function setValue(val) {
      setNative(val);
      refreshDisplay(val);
      input.dispatchEvent(new Event('input',  { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    Object.defineProperty(input, 'value', {
      configurable: true,
      get: function () { return nativeValue.get.call(this); },
      set: function (val) {
        nativeValue.set.call(this, val);
        refreshDisplay(val);
      }
    });

    ui.field.addEventListener('click', function (e) {
      e.stopPropagation();
      isOpen ? closePopup() : openPopup();
    });
    ui.field.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        isOpen ? closePopup() : openPopup();
      }
    });
    ui.clearBtn.addEventListener('click', function (e) {
      e.stopPropagation(); setValue('');
    });
    ui.popup.addEventListener('mousedown', function (e) { e.stopPropagation(); });

    refreshDisplay(getVal());
  }

  // ─── Bootstrap ────────────────────────────────────────────────────────────

  function initAll() {
    document.querySelectorAll('input[type="month"]').forEach(initMonthPicker);
    document.querySelectorAll('input[type="date"]').forEach(initDatePicker);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();
