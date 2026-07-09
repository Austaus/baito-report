const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const STORAGE_KEY = "arubaito-report-settings";
const DEFAULT_TIME_FROM = "09:00";
const DEFAULT_TIME_TO = "12:00";
const YEN_FORMATTER = new Intl.NumberFormat("ja-JP");

const FORM_FIELD_IDS = [
  "restaurant", "name", "wage", "salaryLimit", "targetSalary", "weeklyLimit",
  "minHours", "maxHours", "startFrom", "startTo", "offDay"
];

const ELEMENT_IDS = [
  ...FORM_FIELD_IDS,
  "month", "year",
  "shiftRows", "validation", "summaryHours", "summarySalary", "summaryRemaining",
  "summaryDays", "generateSchedule", "generatePdf", "printPdf", "downloadPdf",
  "saveDefaults", "resetReport", "resetMonth", "clearDefaults", "pdfPreview", "mobileHint", "saveStatus",
  "appStatus", "pdfStatus", "tableStatus", "previewStatus", "salaryProgressText",
  "salaryProgressBar", "targetProgressText", "targetProgressBar", "salaryNotice", "fileNamePreview"
];

let pdfBlob = null;
let lastDoc = null;
let lastPdfUrl = null;

const els = {};

/* App setup */
document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  initSelectors();
  loadDefaults();
  bindEvents();
  generateSchedule();
  updateFileNamePreview();
});

function cacheElements() {
  ELEMENT_IDS.forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function initSelectors() {
  const now = new Date();

  MONTH_NAMES.forEach((month, index) => {
    const opt = document.createElement("option");
    opt.value = index;
    opt.textContent = month;
    if (index === now.getMonth()) opt.selected = true;
    els.month.appendChild(opt);
  });

  const currentYear = now.getFullYear();
  for (let y = currentYear - 2; y <= currentYear + 2; y++) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    if (y === currentYear) opt.selected = true;
    els.year.appendChild(opt);
  }
}

function bindEvents() {
  els.generateSchedule.addEventListener("click", generateSchedule);
  els.generatePdf.addEventListener("click", generatePDF);
  els.printPdf.addEventListener("click", printPDF);
  els.downloadPdf.addEventListener("click", downloadPDF);
  els.saveDefaults.addEventListener("click", saveDefaultsFromButton);
  els.resetReport.addEventListener("click", resetReportOnly);
  els.resetMonth.addEventListener("click", resetMonth);
  els.clearDefaults.addEventListener("click", clearSavedDefaults);

  FORM_FIELD_IDS.forEach((id) => {
    const eventName = els[id].tagName === "SELECT" ? "change" : "input";
    els[id].addEventListener(eventName, () => {
      saveDefaults();
      if (id === "wage" || id === "salaryLimit") {
        enforceSalaryLimitForAllRows(getSettings());
      }
      updateSummary();
      invalidatePdf();
      updateFileNamePreview();
    });
  });

  document.querySelectorAll('input[name="shiftLength"]').forEach((input) => {
    input.addEventListener("change", () => {
      saveDefaults();
      updateSummary();
      invalidatePdf();
      updateFileNamePreview();
    });
  });

  [els.month, els.year].forEach((input) => {
    input.addEventListener("change", () => {
      updateSummary();
      invalidatePdf();
      updateFileNamePreview();
    });
  });

  els.shiftRows.addEventListener("input", handleShiftEdit);
  els.shiftRows.addEventListener("change", handleShiftEdit);
}

function loadDefaults() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    FORM_FIELD_IDS.forEach((id) => {
      if (saved[id] !== undefined && els[id]) els[id].value = saved[id];
    });

    if (Array.isArray(saved.shiftLengths)) {
      document.querySelectorAll('input[name="shiftLength"]').forEach((input) => {
        input.checked = saved.shiftLengths.includes(Number(input.value)) || input.value === "1" || input.value === "2";
      });
    }

    if (!saved.minHours || Number(saved.minHours) > 1) {
      els.minHours.value = "1";
    }
  } catch (error) {
    console.warn("Could not load saved report settings.", error);
  }
}

function saveDefaults() {
  const data = {};
  FORM_FIELD_IDS.forEach((id) => {
    if (els[id]) data[id] = els[id].value;
  });
  data.shiftLengths = getAllowedLengths();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  els.saveStatus.textContent = "Defaults saved locally";
  els.saveStatus.className = "badge badgeMuted";
}

function saveDefaultsFromButton() {
  saveDefaults();
  setBadge(els.saveStatus, "Defaults saved", "badge badgeSuccess");
}

function getSettings() {
  const wage = readNumber("wage");
  const salaryLimit = readNumber("salaryLimit");
  const minimumSalaryInput = readNumber("targetSalary");
  const weeklyLimit = readNumber("weeklyLimit");
  const minHours = readNumber("minHours");
  const maxHours = readNumber("maxHours");
  const minimumSalary = minimumSalaryInput > 0 ? Math.min(minimumSalaryInput, salaryLimit || minimumSalaryInput) : 0;

  return {
    restaurant: els.restaurant.value.trim(),
    name: els.name.value.trim(),
    monthIndex: Number(els.month.value),
    year: Number(els.year.value),
    wage,
    salaryLimit,
    minimumSalary,
    minimumSalaryInput,
    weeklyLimit,
    minHours,
    maxHours,
    startFrom: els.startFrom.value || DEFAULT_TIME_FROM,
    startTo: els.startTo.value || DEFAULT_TIME_TO,
    offDay: els.offDay.value,
    allowedLengths: getAllowedLengths()
  };
}

function readNumber(id) {
  const value = els[id].value.trim();
  if (value === "") return 0;
  return Number(value);
}

function getAllowedLengths() {
  return [...document.querySelectorAll('input[name="shiftLength"]:checked')]
    .map((input) => Number(input.value))
    .filter((hours) => hours > 0);
}

function getEffectiveLengths(settings) {
  return settings.allowedLengths
    .filter((hours) => hours >= settings.minHours && hours <= settings.maxHours)
    .sort((a, b) => b - a);
}

/* Validation and summaries */
function validateSettings(requireName = false, checkCurrentRows = true) {
  const settings = getSettings();
  const messages = [];
  const warnings = [];
  const lengths = getEffectiveLengths(settings);

  if (requireName && !settings.name) messages.push("Your name is required before generating the PDF.");
  if (!Number.isFinite(settings.wage) || settings.wage <= 0) messages.push("Hourly wage must be greater than 0.");
  if (!Number.isFinite(settings.salaryLimit)) messages.push("Monthly salary limit must be a valid number.");
  if (!Number.isFinite(settings.minimumSalaryInput)) messages.push("Minimum salary must be a valid number.");
  if (!Number.isFinite(settings.weeklyLimit) || settings.weeklyLimit <= 0) messages.push("Weekly work limit must be greater than 0.");
  if (!Number.isFinite(settings.minHours) || !Number.isFinite(settings.maxHours)) messages.push("Daily min/max hours must be valid numbers.");
  if (settings.salaryLimit < 0) messages.push("Monthly salary limit cannot be negative.");
  if (settings.minimumSalaryInput < 0) messages.push("Minimum salary cannot be negative.");
  if (settings.salaryLimit > 0 && settings.minimumSalaryInput > settings.salaryLimit) {
    messages.push("Minimum salary must be less than or equal to the monthly salary limit.");
  }
  if (settings.minHours < 0 || settings.maxHours < 0) messages.push("Daily hours cannot be negative.");
  if (settings.maxHours < settings.minHours) messages.push("Daily max hours must be greater than or equal to daily min hours.");
  if (!lengths.length) messages.push("Select at least one shift length within the daily min/max range.");

  const lowestShiftPay = lengths.length ? settings.wage * Math.min(...lengths) : 0;
  if (settings.salaryLimit > 0 && lengths.length && settings.salaryLimit < lowestShiftPay) {
    warnings.push(`Monthly salary limit is lower than one minimum shift (${formatYen(lowestShiftPay)}).`);
  }

  if (checkCurrentRows) {
    const currentSalary = getShiftRows().reduce((sum, row) => sum + row.hours * Math.max(0, settings.wage || 0), 0);
    if (settings.salaryLimit > 0 && currentSalary > settings.salaryLimit) {
      messages.push(`Estimated salary exceeds the monthly limit by ${formatYen(currentSalary - settings.salaryLimit)}.`);
    }
    const hasValidSalaryRange = !settings.salaryLimit || settings.minimumSalaryInput <= settings.salaryLimit;
    if (hasValidSalaryRange && settings.minimumSalaryInput > 0 && currentSalary < settings.minimumSalaryInput && getShiftRows().some((row) => row.hours > 0)) {
      warnings.push(`Estimated salary is below the minimum by ${formatYen(settings.minimumSalaryInput - currentSalary)}.`);
    }
  }

  const weeklyOverages = getWeeklyOverages(settings.weeklyLimit);
  if (weeklyOverages.length) {
    warnings.push(`Weekly hour warning: ${weeklyOverages.join(", ")} exceed ${settings.weeklyLimit}h.`);
  }

  renderValidation(messages, warnings);
  return { settings, messages, warnings, isValid: messages.length === 0 };
}

function renderValidation(errors, warnings) {
  const items = [
    ...errors.map((text) => `<li class="error">${text}</li>`),
    ...warnings.map((text) => `<li class="warning">${text}</li>`)
  ];

  els.validation.innerHTML = items.length ? `<ul>${items.join("")}</ul>` : "";
  updateStatusBadges(errors, warnings);
}

function updateStatusBadges(errors = [], warnings = []) {
  const hasName = getSettings().name.length > 0;
  const overWeekly = warnings.some((message) => message.includes("Weekly hour warning"));

  if (errors.length) {
    setBadge(els.appStatus, "Needs fix", "badge badgeDanger");
  } else if (!hasName) {
    setBadge(els.appStatus, "Needs name", "badge badgeWarning");
  } else if (overWeekly) {
    setBadge(els.appStatus, "Over weekly limit", "badge badgeWarning");
  } else {
    setBadge(els.appStatus, "Ready", "badge badgeSuccess");
  }
}

/* Shift generation and editing */
function generateSchedule() {
  const { settings, isValid } = validateSettings(false, false);
  if (!isValid) return;
  hideSalaryNotice();

  const daysInMonth = new Date(settings.year, settings.monthIndex + 1, 0).getDate();
  const offDays = buildOffDays(settings, daysInMonth);
  const lengths = getEffectiveLengths(settings);
  const targetHours = getTargetHours(settings);
  const weeklyHours = new Map();
  let totalHours = 0;

  els.shiftRows.innerHTML = "";

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(settings.year, settings.monthIndex, day);
    const weekKey = getWeekKey(date);
    const currentWeekHours = weeklyHours.get(weekKey) || 0;
    const remainingTarget = Math.max(0, targetHours - totalHours);
    const remainingWeekly = Math.max(0, settings.weeklyLimit - currentWeekHours);
    const isOff = offDays.has(day) || remainingTarget <= 0;
    let hours = 0;
    let time = "OFF";

    if (!isOff) {
      hours = chooseHours(lengths, remainingTarget, remainingWeekly, settings.minimumSalary > 0);
      if (hours > 0) {
        time = buildTimeRange(settings, hours);
        totalHours += hours;
        weeklyHours.set(weekKey, currentWeekHours + hours);
      }
    }

    els.shiftRows.appendChild(createShiftRow(date, day, time, hours));
  }

  updateSummary();
  invalidatePdf();
  setBadge(els.tableStatus, "Ready to edit", "badge badgeSuccess");
}

function buildOffDays(settings, daysInMonth) {
  const offDays = new Set();

  if (settings.offDay !== "random") {
    const targetWeekday = Number(settings.offDay);
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(settings.year, settings.monthIndex, day);
      if (date.getDay() === targetWeekday) offDays.add(day);
    }
    return offDays;
  }

  for (let start = 1; start <= daysInMonth; start += 7) {
    const end = Math.min(start + 6, daysInMonth);
    offDays.add(randomInt(start, end));
  }

  return offDays;
}

function getTargetHours(settings) {
  if (settings.wage <= 0) return 0;
  const salaryCap = settings.salaryLimit > 0 ? Math.floor(settings.salaryLimit / settings.wage) : Infinity;
  const targetCap = settings.minimumSalary > 0 ? Math.ceil(settings.minimumSalary / settings.wage) : salaryCap;
  return Math.max(0, Math.min(salaryCap, targetCap));
}

function chooseHours(lengths, remainingTarget, remainingWeekly, prioritizeTarget = false) {
  const options = lengths.filter((hours) => hours <= remainingTarget && hours <= remainingWeekly);
  if (!options.length) return 0;

  const exactOrLargest = options.find((hours) => hours === remainingTarget) || Math.max(...options);
  if (prioritizeTarget) return exactOrLargest;

  const softerChoices = options.filter((hours) => hours <= exactOrLargest);
  return softerChoices[randomInt(0, softerChoices.length - 1)];
}

function buildTimeRange(settings, hours) {
  const startMin = timeToMinutes(settings.startFrom);
  const endMin = Math.max(startMin, timeToMinutes(settings.startTo));
  const latestStart = Math.min(endMin, (24 - hours) * 60);
  const randomStart = randomInt(Math.floor(startMin / 60), Math.floor(latestStart / 60)) * 60;
  const end = randomStart + hours * 60;
  return `${minutesToTime(randomStart)}-${minutesToTime(end)}`;
}

function parseShiftRanges(value) {
  if (!value || value.toUpperCase() === "OFF") {
    return [
      { start: DEFAULT_TIME_FROM, end: DEFAULT_TIME_TO, enabled: false },
      { start: "17:00", end: "20:00", enabled: false }
    ];
  }

  const ranges = value.split("/").map((item) => item.trim()).filter(Boolean);
  const parsed = ranges.map((range) => {
    const [start, end] = range.split("-");
    return {
      start: start || DEFAULT_TIME_FROM,
      end: end || DEFAULT_TIME_TO,
      enabled: true
    };
  });

  return [
    parsed[0] || { start: DEFAULT_TIME_FROM, end: DEFAULT_TIME_TO, enabled: false },
    parsed[1] || { start: "17:00", end: "20:00", enabled: false }
  ];
}

function createShiftRow(date, day, time, hours) {
  const tr = document.createElement("tr");
  tr.dataset.day = String(day);
  tr.dataset.weekday = WEEKDAY_NAMES[date.getDay()];
  tr.className = hours === 0 ? "offDay" : "workDay";
  const shifts = parseShiftRanges(time);
  const isOff = hours === 0;

  tr.innerHTML = `
    <td>${String(day).padStart(2, "0")} ${MONTH_NAMES[date.getMonth()]}</td>
    <td>${WEEKDAY_NAMES[date.getDay()]}</td>
    <td>
      <div class="shiftStack">
        <div class="timeRange">
          <span class="shiftLabel">1</span>
          <input class="shift1Start" type="time" value="${shifts[0].start}" aria-label="Shift 1 start for day ${day}" ${isOff ? "disabled" : ""} />
          <span>-</span>
          <input class="shift1End" type="time" value="${shifts[0].end}" aria-label="Shift 1 end for day ${day}" ${isOff ? "disabled" : ""} />
        </div>
        <div class="timeRange optionalShift">
          <label class="secondShiftToggle">
            <input class="shift2Enabled" type="checkbox" aria-label="Use shift 2 for day ${day}" ${shifts[1].enabled && !isOff ? "checked" : ""} ${isOff ? "disabled" : ""} />
            <span>2</span>
          </label>
          <input class="shift2Start" type="time" value="${shifts[1].start}" aria-label="Shift 2 start for day ${day}" ${!shifts[1].enabled || isOff ? "disabled" : ""} />
          <span>-</span>
          <input class="shift2End" type="time" value="${shifts[1].end}" aria-label="Shift 2 end for day ${day}" ${!shifts[1].enabled || isOff ? "disabled" : ""} />
        </div>
      </div>
    </td>
    <td><input class="hoursInput" type="number" min="0" step="0.5" value="${hours}" aria-label="Hours for day ${day}" readonly /></td>
    <td><input class="offInput" type="checkbox" ${isOff ? "checked" : ""} aria-label="Mark day ${day} off" /></td>
  `;

  return tr;
}

function handleShiftEdit(event) {
  const row = event.target.closest("tr");
  if (!row) return;

  const hoursInput = row.querySelector(".hoursInput");
  const offInput = row.querySelector(".offInput");
  const shift2Enabled = row.querySelector(".shift2Enabled");
  const settings = getSettings();

  if (event.target === offInput) {
    if (offInput.checked) {
      setRowOff(row, true);
    } else if (Number(hoursInput.value) <= 0) {
      const lengths = getEffectiveLengths(settings);
      setRowOff(row, false);
      setShiftDuration(row, 1, lengths[lengths.length - 1] || Math.max(settings.minHours, 1), settings);
    }
  }

  if (event.target === shift2Enabled) {
    setShift2Enabled(row, shift2Enabled.checked);
  }

  if (event.target.matches('input[type="time"]')) {
    offInput.checked = false;
    setRowOff(row, false);
  }

  syncHoursFromShiftInputs(row);
  normalizeShiftDurations(row, settings);
  enforceSalaryLimitForRow(row, settings);
  updateSummary();
  invalidatePdf();
}

function enforceSalaryLimitForRow(row, settings) {
  const wage = Number.isFinite(settings.wage) ? Math.max(0, settings.wage) : 0;
  const salaryLimit = Number.isFinite(settings.salaryLimit) ? Math.max(0, settings.salaryLimit) : 0;
  if (!wage || !salaryLimit) return;

  const day = Number(row.dataset.day);
  const requestedHours = getRowTotalHours(row);
  const otherHours = getShiftRows()
    .filter((shift) => shift.day !== day)
    .reduce((sum, shift) => sum + shift.hours, 0);

  const maxAffordableHours = Math.floor(((salaryLimit / wage) - otherHours) * 2) / 2;
  let cappedHours = Math.max(0, Math.min(requestedHours, maxAffordableHours));
  if (cappedHours > 0 && cappedHours < settings.minHours) cappedHours = 0;

  if (cappedHours < requestedHours) setRowTotalHours(row, cappedHours, settings);

  if (cappedHours < requestedHours) {
    setBadge(els.tableStatus, "Adjusted to salary limit", "badge badgeWarning");
    showSalaryNotice();
  } else if (els.salaryNotice.hidden) {
    setBadge(els.tableStatus, "Ready to edit", "badge badgeSuccess");
  }
}

function enforceSalaryLimitForAllRows(settings) {
  const wage = Number.isFinite(settings.wage) ? Math.max(0, settings.wage) : 0;
  const salaryLimit = Number.isFinite(settings.salaryLimit) ? Math.max(0, settings.salaryLimit) : 0;
  if (!wage || !salaryLimit) return;

  const maxTotalHours = Math.floor((salaryLimit / wage) * 2) / 2;
  let usedHours = 0;
  let adjusted = false;

  [...els.shiftRows.querySelectorAll("tr")].forEach((row) => {
    const requestedHours = getRowTotalHours(row);
    const remainingHours = Math.max(0, Math.floor((maxTotalHours - usedHours) * 2) / 2);
    let allowedHours = Math.min(requestedHours, remainingHours);
    if (allowedHours > 0 && allowedHours < settings.minHours) allowedHours = 0;

    if (allowedHours < requestedHours) {
      setRowTotalHours(row, allowedHours, settings);
      adjusted = true;
    }

    usedHours += allowedHours;
  });

  if (adjusted) {
    setBadge(els.tableStatus, "Adjusted to salary limit", "badge badgeWarning");
    showSalaryNotice();
  }
}

function setRowTotalHours(row, hours, settings) {
  const shift1Hours = getShiftDuration(row, 1);
  const shift2Hours = getShiftDuration(row, 2);
  const minimumShiftHours = getMinimumShiftHours(settings);
  let remainingHours = hours;

  if (remainingHours <= 0) {
    setRowOff(row, true);
    return;
  }

  setRowOff(row, false);

  if (shift2Hours > 0) {
    const shift1Target = Math.min(shift1Hours, remainingHours);
    setShiftDuration(row, 1, shift1Target, settings);
    remainingHours -= shift1Target;
    if (remainingHours >= minimumShiftHours) {
      setShift2Enabled(row, true);
      setShiftDuration(row, 2, remainingHours, settings);
    } else {
      setShift2Enabled(row, false);
    }
  } else {
    setShiftDuration(row, 1, remainingHours, settings);
    setShift2Enabled(row, false);
  }

  syncHoursFromShiftInputs(row);
}

function setRowOff(row, isOff) {
  const offInput = row.querySelector(".offInput");
  const shift2Enabled = row.querySelector(".shift2Enabled");
  const timeInputs = row.querySelectorAll('input[type="time"]');

  offInput.checked = isOff;
  timeInputs.forEach((input) => {
    input.disabled = isOff || (input.classList.contains("shift2Start") || input.classList.contains("shift2End")) && !shift2Enabled.checked;
  });
  shift2Enabled.disabled = isOff;

  if (isOff) {
    row.querySelector(".hoursInput").value = 0;
    shift2Enabled.checked = false;
  }
}

function setShift2Enabled(row, enabled) {
  const shift2Enabled = row.querySelector(".shift2Enabled");
  const shift2Start = row.querySelector(".shift2Start");
  const shift2End = row.querySelector(".shift2End");
  const isOff = row.querySelector(".offInput").checked;

  shift2Enabled.checked = enabled && !isOff;
  shift2Start.disabled = isOff || !shift2Enabled.checked;
  shift2End.disabled = isOff || !shift2Enabled.checked;
}

function setShiftDuration(row, shiftNumber, hours, settings) {
  const startInput = row.querySelector(`.shift${shiftNumber}Start`);
  const endInput = row.querySelector(`.shift${shiftNumber}End`);
  if (hours <= 0) return;

  const startMinutes = timeToMinutes(startInput.value || settings.startFrom || DEFAULT_TIME_FROM);
  startInput.value = minutesToTime(startMinutes);
  endInput.value = minutesToTime(startMinutes + hours * 60);
}

function getRowTotalHours(row) {
  if (row.querySelector(".offInput").checked) return 0;
  return getShiftDuration(row, 1) + getShiftDuration(row, 2);
}

function getShiftDuration(row, shiftNumber) {
  if (shiftNumber === 2 && !row.querySelector(".shift2Enabled").checked) return 0;

  const startInput = row.querySelector(`.shift${shiftNumber}Start`);
  const endInput = row.querySelector(`.shift${shiftNumber}End`);
  if (!startInput.value || !endInput.value) return 0;

  const startMinutes = timeToMinutes(startInput.value);
  let endMinutes = timeToMinutes(endInput.value);
  if (endMinutes <= startMinutes) endMinutes += 24 * 60;

  return Math.max(0, (endMinutes - startMinutes) / 60);
}

function syncHoursFromShiftInputs(row) {
  const hoursInput = row.querySelector(".hoursInput");
  const totalHours = getRowTotalHours(row);
  hoursInput.value = formatHours(totalHours);
  if (totalHours > 0) row.querySelector(".offInput").checked = false;
}

function normalizeShiftDurations(row, settings) {
  if (row.querySelector(".offInput").checked) return;

  const minimumShiftHours = getMinimumShiftHours(settings);
  const shift1Hours = getShiftDuration(row, 1);
  const shift2Hours = getShiftDuration(row, 2);

  if (shift1Hours > 0 && shift1Hours < minimumShiftHours) {
    setShiftDuration(row, 1, minimumShiftHours, settings);
  }

  if (shift2Hours > 0 && shift2Hours < minimumShiftHours) {
    setShiftDuration(row, 2, minimumShiftHours, settings);
  }

  syncHoursFromShiftInputs(row);
}

function getMinimumShiftHours(settings) {
  const lengths = getEffectiveLengths(settings);
  if (lengths.length) return Math.min(...lengths);
  return Math.max(1, settings.minHours || 1);
}

function getShiftRows() {
  return [...els.shiftRows.querySelectorAll("tr")].map((row) => {
    const day = Number(row.dataset.day);
    const ranges = [];
    const shift1Hours = getShiftDuration(row, 1);
    const shift2Hours = getShiftDuration(row, 2);
    if (shift1Hours > 0) ranges.push(`${row.querySelector(".shift1Start").value}-${row.querySelector(".shift1End").value}`);
    if (shift2Hours > 0) ranges.push(`${row.querySelector(".shift2Start").value}-${row.querySelector(".shift2End").value}`);
    const hours = shift1Hours + shift2Hours;
    const off = row.querySelector(".offInput").checked || hours === 0;
    return {
      day,
      weekday: row.dataset.weekday,
      time: off ? "OFF" : ranges.join(" / "),
      hours: off ? 0 : hours
    };
  });
}

function updateSummary() {
  const { settings } = validateSettings(false);
  const rows = getShiftRows();
  const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
  const workDays = rows.filter((row) => row.hours > 0).length;
  const offDays = rows.length - workDays;
  const wage = Number.isFinite(settings.wage) ? Math.max(0, settings.wage) : 0;
  const salaryLimit = Number.isFinite(settings.salaryLimit) ? Math.max(0, settings.salaryLimit) : 0;
  const salary = totalHours * wage;
  const remaining = Math.max(0, salaryLimit - salary);

  els.summaryHours.textContent = formatHours(totalHours);
  els.summarySalary.textContent = formatYen(salary);
  els.summaryRemaining.textContent = formatYen(remaining);
  els.summaryDays.textContent = `${workDays} / ${offDays}`;
  updateProgressBars(settings, salary);
  updateRowStates(rows, settings);
  updateFileNamePreview();
}

function updateProgressBars(settings, salary) {
  const salaryLimit = Number.isFinite(settings.salaryLimit) ? Math.max(0, settings.salaryLimit) : 0;
  const minimumSalary = Number.isFinite(settings.minimumSalaryInput) ? Math.max(0, settings.minimumSalaryInput) : 0;

  updateProgress(els.salaryProgressBar, els.salaryProgressText, salary, salaryLimit, "No limit");
  updateProgress(els.targetProgressBar, els.targetProgressText, salary, minimumSalary, "No minimum", false);
}

function updateProgress(bar, label, current, max, emptyText, overIsBad = true) {
  if (!max) {
    bar.style.width = "0%";
    bar.classList.remove("nearLimit", "overLimit");
    label.textContent = emptyText;
    return;
  }

  const percent = Math.round((current / max) * 100);
  const clamped = Math.min(percent, 100);
  bar.style.width = `${clamped}%`;
  label.textContent = `${percent}%`;
  bar.classList.toggle("nearLimit", overIsBad ? percent >= 90 && percent < 100 : percent >= 75 && percent < 100);
  bar.classList.toggle("overLimit", overIsBad && percent >= 100);
}

function updateRowStates(rows, settings) {
  const weeklyTotals = new Map();
  let runningSalary = 0;
  const wage = Number.isFinite(settings.wage) ? Math.max(0, settings.wage) : 0;
  const salaryLimit = Number.isFinite(settings.salaryLimit) ? Math.max(0, settings.salaryLimit) : 0;

  rows.forEach((row) => {
    const date = new Date(settings.year, settings.monthIndex, row.day);
    const key = getWeekKey(date);
    weeklyTotals.set(key, (weeklyTotals.get(key) || 0) + row.hours);
  });

  rows.forEach((row) => {
    const tableRow = els.shiftRows.querySelector(`tr[data-day="${row.day}"]`);
    if (!tableRow) return;

    const date = new Date(settings.year, settings.monthIndex, row.day);
    const key = getWeekKey(date);
    runningSalary += row.hours * wage;

    tableRow.classList.toggle("offDay", row.hours === 0);
    tableRow.classList.toggle("workDay", row.hours > 0);
    tableRow.classList.toggle("overWeekly", settings.weeklyLimit > 0 && weeklyTotals.get(key) > settings.weeklyLimit);
    tableRow.classList.toggle("nearLimit", salaryLimit > 0 && runningSalary / salaryLimit >= 0.9);
  });
}

function getWeeklyOverages(limit) {
  if (!limit) return [];
  const settings = getSettings();
  const weekly = new Map();

  getShiftRows().forEach((row) => {
    const date = new Date(settings.year, settings.monthIndex, row.day);
    const key = getWeekKey(date);
    weekly.set(key, (weekly.get(key) || 0) + row.hours);
  });

  return [...weekly.entries()]
    .filter(([, hours]) => hours > limit)
    .map(([week, hours]) => `${week} (${formatHours(hours)}h)`);
}

/* PDF output */
function generatePDF() {
  const { jsPDF } = window.jspdf;
  const { settings, isValid } = validateSettings(true);
  const rows = getShiftRows();

  if (!isValid) return;
  if (!rows.length) {
    alert("Generate editable shifts first.");
    return;
  }

  const doc = new jsPDF();
  lastDoc = doc;

  const monthName = MONTH_NAMES[settings.monthIndex];
  const totalHours = rows.reduce((sum, row) => sum + row.hours, 0);
  const totalSalary = totalHours * settings.wage;

  let y = 14;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("ARUBAITO REPORT", 105, y, { align: "center" });

  y += 7;
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Restaurant Name:", 105, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(` ${settings.restaurant || "Restaurant"}`, 105, y, { align: "left" });

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Name:", 105, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.text(` ${settings.name}`, 105, y, { align: "left" });

  y += 6;
  doc.setFontSize(10);
  doc.text(`${monthName} ${settings.year}`, 105, y, { align: "center" });

  y += 8;
  y = drawTableHeader(doc, y);

  rows.forEach((row) => {
    if (y > 270) {
      doc.addPage();
      y = 14;
      y = drawTableHeader(doc, y);
    }

    y = drawShiftRow(doc, y, row, monthName, settings.year);
  });

  y += 5;
  if (y > 260) {
    doc.addPage();
    y = 18;
  }

  doc.setFont("helvetica", "bold");
  doc.text(`Total Hours: ${formatHours(totalHours)}`, 15, y);
  y += 6;
  doc.text(`Total Salary: ${formatYen(totalSalary)}`, 15, y);

  pdfBlob = doc.output("blob");
  const url = URL.createObjectURL(pdfBlob);
  if (lastPdfUrl) URL.revokeObjectURL(lastPdfUrl);
  lastPdfUrl = url;
  const previewUrl = `${url}#zoom=125&view=FitH`;

  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    window.open(previewUrl, "_blank");
    els.mobileHint.hidden = false;
  } else {
    els.pdfPreview.src = previewUrl;
  }

  setPdfButtons(true);
  setBadge(els.pdfStatus, "PDF generated", "badge badgeSuccess");
  setBadge(els.previewStatus, "Preview ready", "badge badgeSuccess");
}

function drawTableHeader(doc, y) {
  const x = 15;
  const rowH = 6;
  const colDate = 50;
  const colWeekday = 80;
  const colTime = 152;
  const colHours = 180;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.rect(x, y, colHours - x, rowH);
  doc.line(colDate, y, colDate, y + rowH);
  doc.line(colWeekday, y, colWeekday, y + rowH);
  doc.line(colTime, y, colTime, y + rowH);
  doc.text("Date", x + 2, y + 4.3);
  doc.text("Weekday", colDate + 2, y + 4.3);
  doc.text("Time", colWeekday + 2, y + 4.3);
  doc.text("Hours", colTime + 2, y + 4.3);
  return y + rowH;
}

function drawShiftRow(doc, y, row, monthName, year) {
  const x = 15;
  const rowH = 6;
  const colDate = 50;
  const colWeekday = 80;
  const colTime = 152;
  const colHours = 180;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(row.time.includes("/") ? 8 : 9);
  doc.rect(x, y, colHours - x, rowH);
  doc.line(colDate, y, colDate, y + rowH);
  doc.line(colWeekday, y, colWeekday, y + rowH);
  doc.line(colTime, y, colTime, y + rowH);
  doc.text(`${String(row.day).padStart(2, "0")} ${monthName} ${year}`, x + 2, y + 4.3);
  doc.text(row.weekday, colDate + 2, y + 4.3);
  doc.text(row.time, colWeekday + 2, y + 4.3);
  doc.text(formatHours(row.hours), colTime + 13, y + 4.3, { align: "right" });
  doc.setFontSize(9);
  return y + rowH;
}

function printPDF() {
  if (!pdfBlob) return alert("Generate PDF first.");
  const printWindow = window.open(URL.createObjectURL(pdfBlob));
  printWindow.onload = () => printWindow.print();
}

function downloadPDF() {
  if (!lastDoc) return alert("Generate PDF first.");
  lastDoc.save(getReportFileName());
}

function invalidatePdf() {
  pdfBlob = null;
  lastDoc = null;
  setPdfButtons(false);
  setBadge(els.pdfStatus, "PDF not generated", "badge badgeMuted");
  setBadge(els.previewStatus, "Waiting", "badge badgeMuted");
}

function setPdfButtons(enabled) {
  els.printPdf.disabled = !enabled;
  els.downloadPdf.disabled = !enabled;
}

function resetReportOnly() {
  els.shiftRows.innerHTML = "";
  if (lastPdfUrl) URL.revokeObjectURL(lastPdfUrl);
  lastPdfUrl = null;
  pdfBlob = null;
  lastDoc = null;
  els.pdfPreview.removeAttribute("src");
  els.summaryHours.textContent = "0";
  els.summarySalary.textContent = formatYen(0);
  els.summaryRemaining.textContent = formatYen(Math.max(0, getSettings().salaryLimit || 0));
  els.summaryDays.textContent = "0 / 0";
  updateProgressBars(getSettings(), 0);
  setPdfButtons(false);
  hideSalaryNotice();
  setBadge(els.tableStatus, "Report reset", "badge badgeMuted");
  setBadge(els.pdfStatus, "PDF not generated", "badge badgeMuted");
  setBadge(els.previewStatus, "Waiting", "badge badgeMuted");
}

function resetMonth() {
  const now = new Date();
  els.month.value = String(now.getMonth());
  els.year.value = String(now.getFullYear());
  saveDefaults();
  generateSchedule();
}

function clearSavedDefaults() {
  localStorage.removeItem(STORAGE_KEY);
  const now = new Date();
  els.restaurant.value = "";
  els.name.value = "";
  els.wage.value = "1150";
  els.salaryLimit.value = "100000";
  els.targetSalary.value = "";
  els.weeklyLimit.value = "28";
  els.minHours.value = "1";
  els.maxHours.value = "4";
  els.startFrom.value = DEFAULT_TIME_FROM;
  els.startTo.value = DEFAULT_TIME_TO;
  els.offDay.value = "random";
  document.querySelectorAll('input[name="shiftLength"]').forEach((input) => {
    input.checked = ["1", "2", "3", "4"].includes(input.value);
  });
  els.month.value = String(now.getMonth());
  els.year.value = String(now.getFullYear());
  generateSchedule();
  setBadge(els.saveStatus, "Defaults cleared", "badge badgeWarning");
}

function setBadge(element, text, className) {
  element.textContent = text;
  element.className = className;
}

function showSalaryNotice() {
  els.salaryNotice.textContent = "Shift adjusted to stay within monthly salary limit.";
  els.salaryNotice.hidden = false;
}

function hideSalaryNotice() {
  els.salaryNotice.hidden = true;
  els.salaryNotice.textContent = "";
}

function updateFileNamePreview() {
  els.fileNamePreview.textContent = getReportFileName();
}

/* Utilities */
function getReportFileName() {
  const settings = getSettings();
  const safeName = (settings.name || "Name").trim().replace(/\s+/g, "_");
  return `${safeName}_${MONTH_NAMES[settings.monthIndex]}_${settings.year}_Arubaito_Report.pdf`;
}

function getWeekKey(date) {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
  copy.setDate(diff);
  return `${copy.getFullYear()}-${String(copy.getMonth() + 1).padStart(2, "0")}-${String(copy.getDate()).padStart(2, "0")}`;
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

function minutesToTime(totalMinutes) {
  const minutes = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatYen(value) {
  return `¥${YEN_FORMATTER.format(Math.round(value))}`;
}

function formatHours(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
