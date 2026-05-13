const zones = [
  ["Asia/Seoul", "Seoul / ICN"],
  ["America/New_York", "New York / JFK"],
  ["America/Los_Angeles", "Los Angeles / LAX"],
  ["Europe/London", "London / LHR"],
  ["Europe/Paris", "Paris / CDG"],
  ["Asia/Tokyo", "Tokyo / HND"],
  ["Asia/Singapore", "Singapore / SIN"],
  ["Asia/Dubai", "Dubai / DXB"],
  ["Australia/Sydney", "Sydney / SYD"],
  ["Pacific/Honolulu", "Honolulu / HNL"]
];

const airportZones = {
  ICN: "Asia/Seoul",
  GMP: "Asia/Seoul",
  PUS: "Asia/Seoul",
  JFK: "America/New_York",
  LAX: "America/Los_Angeles",
  SFO: "America/Los_Angeles",
  LHR: "Europe/London",
  CDG: "Europe/Paris",
  HND: "Asia/Tokyo",
  NRT: "Asia/Tokyo",
  SIN: "Asia/Singapore",
  DXB: "Asia/Dubai",
  SYD: "Australia/Sydney",
  HNL: "Pacific/Honolulu"
};

const presets = {
  international: {
    label: "국제선 출두 프리셋",
    rules: [
      { title: "집 출발 준비", minutes: 180, kind: "duty" },
      { title: "베이스 공항 출두", minutes: 150, kind: "base" },
      { title: "브리핑 준비", minutes: 70, kind: "duty" },
      { title: "게이트 이동 확인", minutes: 40, kind: "duty" }
    ],
    checklist: ["여권/승무원증", "유니폼", "브리핑 자료", "교통편", "비상 연락망"]
  },
  domestic: {
    label: "국내선 출두 프리셋",
    rules: [
      { title: "집 출발 준비", minutes: 130, kind: "duty" },
      { title: "베이스 공항 출두", minutes: 90, kind: "base" },
      { title: "브리핑 준비", minutes: 45, kind: "duty" }
    ],
    checklist: ["승무원증", "유니폼", "브리핑 자료", "교통편"]
  },
  longhaul: {
    label: "장거리 비행 프리셋",
    rules: [
      { title: "수면 종료", minutes: 300, kind: "wake" },
      { title: "식사", minutes: 180, kind: "duty" },
      { title: "공항 이동", minutes: 150, kind: "base" },
      { title: "브리핑 준비", minutes: 85, kind: "duty" },
      { title: "백업 알람", minutes: 75, kind: "backup" }
    ],
    checklist: ["여권/비자", "승무원증", "수면 계획", "식사", "유니폼", "현지 교통"]
  },
  layover: {
    label: "현지 체류 출발 프리셋",
    rules: [
      { title: "기상", minutes: 100, kind: "wake" },
      { title: "식사", minutes: 80, kind: "duty" },
      { title: "호텔 출발", minutes: 65, kind: "base" },
      { title: "브리핑 준비", minutes: 45, kind: "duty" }
    ],
    checklist: ["여권", "객실 키 반납", "픽업 시간", "유니폼", "비행 서류"]
  }
};

const state = {
  alarms: JSON.parse(localStorage.getItem("flightAlarms") || "[]"),
  checklist: JSON.parse(localStorage.getItem("flightChecklist") || "[]"),
  manualMode: "clock",
  lastScan: null
};

const $ = (id) => document.getElementById(id);
const today = new Date();
const pad = (value) => String(value).padStart(2, "0");

function init() {
  $("flightDate").value = toDateInput(today);
  $("manualDate").value = toDateInput(today);
  fillSelect($("originTz"), zones, "Asia/Seoul");
  fillSelect($("baseTz"), zones, "Asia/Seoul");
  fillSelect(
    $("presetSelect"),
    Object.entries(presets).map(([value, preset]) => [value, preset.label]),
    "international"
  );
  bindEvents();
  render();
  window.setInterval(updateClock, 1000);
}

function fillSelect(select, options, selected) {
  select.innerHTML = "";
  options.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === selected;
    select.append(option);
  });
}

function bindEvents() {
  $("flightForm").addEventListener("submit", (event) => {
    event.preventDefault();
    generatePresetAlarms();
  });

  $("manualForm").addEventListener("submit", (event) => {
    event.preventDefault();
    addManualAlarm();
  });

  document.querySelectorAll("[data-manual-tab]").forEach((button) => {
    button.addEventListener("click", () => setManualMode(button.dataset.manualTab));
  });

  $("origin").addEventListener("change", syncAirportZone);
  $("destination").addEventListener("change", syncAirportZone);
  $("backupBtn").addEventListener("click", addBackupAlarms);
  $("exportBtn").addEventListener("click", exportCalendar);
  $("resetBtn").addEventListener("click", resetAll);
  $("scanBtn").addEventListener("click", () => scanScheduleImage());
  $("applyScanBtn").addEventListener("click", applyScanResult);
  $("scheduleImage").addEventListener("change", previewImage);
}

function syncAirportZone(event) {
  const code = event.target.value.trim().toUpperCase();
  event.target.value = code;
  const zone = airportZones[code];
  if (zone && event.target.id === "origin") $("originTz").value = zone;
}

function generatePresetAlarms() {
  const flight = getFlightInput();
  const preset = presets[$("presetSelect").value];
  const alarms = preset.rules.map((rule) => createRelativeAlarm(flight, rule));
  state.alarms = [...state.alarms, ...alarms].sort(byTime);
  state.checklist = preset.checklist.map((text) => ({ text, done: false }));
  save();
  render();
}

function createRelativeAlarm(flight, rule) {
  const alarmTime = new Date(flight.departure.getTime() - rule.minutes * 60 * 1000);
  return {
    id: makeId(),
    title: rule.title,
    kind: rule.kind,
    done: false,
    time: alarmTime.toISOString(),
    flightNo: flight.flightNo,
    route: `${flight.origin}-${flight.destination}`,
    zone: flight.originTz,
    description: `${flight.flightNo} ${flight.origin}-${flight.destination} 출발 ${formatInZone(
      flight.departure,
      flight.originTz
    )} 기준 ${minutesLabel(rule.minutes)} 전`
  };
}

function addManualAlarm() {
  const title = $("manualTitle").value.trim() || "수동 알람";
  let time;
  if (state.manualMode === "clock") {
    time = zonedTimeToDate($("manualDate").value, $("manualTime").value, Intl.DateTimeFormat().resolvedOptions().timeZone);
  } else {
    const hours = Number($("manualHours").value) || 0;
    const minutes = Number($("manualMinutes").value) || 0;
    time = new Date(Date.now() + (hours * 60 + minutes) * 60 * 1000);
  }
  state.alarms.push({
    id: makeId(),
    title,
    kind: "manual",
    done: false,
    time: time.toISOString(),
    flightNo: "MANUAL",
    route: "직접 설정",
    zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    description: state.manualMode === "clock" ? "특정 시각 지정" : "타이머 방식"
  });
  state.alarms.sort(byTime);
  save();
  render();
}

function setManualMode(mode) {
  state.manualMode = mode;
  document.querySelectorAll("[data-manual-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.manualTab === mode);
  });
  document.querySelectorAll("[data-clock-field]").forEach((field) => {
    field.hidden = mode !== "clock";
  });
  document.querySelectorAll("[data-timer-field]").forEach((field) => {
    field.hidden = mode !== "timer";
  });
}

function getFlightInput() {
  const origin = $("origin").value.trim().toUpperCase() || "ICN";
  const destination = $("destination").value.trim().toUpperCase() || "JFK";
  const originTz = $("originTz").value;
  return {
    flightNo: $("flightNo").value.trim().toUpperCase() || "FLIGHT",
    origin,
    destination,
    originTz,
    baseTz: $("baseTz").value,
    departure: zonedTimeToDate($("flightDate").value, $("flightTime").value, originTz)
  };
}

function zonedTimeToDate(dateValue, timeValue, timeZone) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const offset = getTimeZoneOffset(utcGuess, timeZone);
  const firstPass = new Date(utcGuess.getTime() - offset);
  const correctedOffset = getTimeZoneOffset(firstPass, timeZone);
  return new Date(utcGuess.getTime() - correctedOffset);
}

function getTimeZoneOffset(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return asUtc - date.getTime();
}

function addBackupAlarms() {
  const active = state.alarms.filter((alarm) => !alarm.done && alarm.kind !== "backup");
  const backups = active.map((alarm) => ({
    ...alarm,
    id: makeId(),
    title: `${alarm.title} 백업`,
    kind: "backup",
    time: new Date(new Date(alarm.time).getTime() + 10 * 60 * 1000).toISOString(),
    description: `${alarm.title} 실패 대비 10분 후 재알림`
  }));
  state.alarms = [...state.alarms, ...backups].sort(byTime);
  save();
  render();
}

function exportCalendar() {
  if (!state.alarms.length) return;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Flight Alarm Control//KR"
  ];
  state.alarms.forEach((alarm) => {
    const start = new Date(alarm.time);
    const end = new Date(start.getTime() + 10 * 60 * 1000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${alarm.id}@flight-alarm-control`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${escapeIcs(alarm.title)}`,
      `DESCRIPTION:${escapeIcs(alarm.description)}`,
      "BEGIN:VALARM",
      "TRIGGER:-PT0M",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeIcs(alarm.title)}`,
      "END:VALARM",
      "END:VEVENT"
    );
  });
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "flight-alarms.ics";
  link.click();
  URL.revokeObjectURL(link.href);
}

function previewImage() {
  const file = $("scheduleImage").files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  $("imagePreview").innerHTML = `<img src="${url}" alt="업로드된 스케줄 이미지" />`;
}

async function scanScheduleImage() {
  const file = $("scheduleImage").files[0];
  const detection = await detectImageText(file);
  const parsed = parseScheduleText(detection.text, detection.tokens);
  const fileName = file?.name || "";
  const dateMatch = fileName.match(/(20\d{2})[-_ ]?(\d{2})[-_ ]?(\d{2})/);
  const timeMatch = fileName.match(/([01]\d|2[0-3])[-_ ]?([0-5]\d)/);
  const routeMatch = fileName.toUpperCase().match(/\b([A-Z]{3})[-_ ]?([A-Z]{3})\b/);
  const flightMatch = fileName.toUpperCase().match(/\b([A-Z]{2}\d{2,4})\b/);
  const fallbackDate = $("flightDate").value;
  const fallbackTime = $("flightTime").value;
  const origin = parsed.origin || routeMatch?.[1] || "JFK";
  const destination = parsed.destination || routeMatch?.[2] || "ICN";
  state.lastScan = {
    flightNo: parsed.flightNo || flightMatch?.[1] || "KE082",
    origin,
    destination,
    date: parsed.date || (dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : fallbackDate),
    time: parsed.time || (timeMatch ? `${timeMatch[1]}:${timeMatch[2]}` : fallbackTime),
    zone: airportZones[origin] || $("originTz").value
  };
  $("scanResult").innerHTML = `
    <strong>인식 결과</strong><br>
    날짜 ${state.lastScan.date}, 출발 ${state.lastScan.time},
    편명 ${state.lastScan.flightNo}, 구간 ${origin}-${destination}<br>
    ${detection.text ? "공항 코드 오른쪽의 숫자를 출발시간으로 우선 해석했습니다." : "현재 브라우저는 내장 OCR을 제공하지 않아 파일명 패턴과 현재 입력값을 함께 사용합니다."}
  `;
}

function applyScanResult() {
  if (!state.lastScan) {
    scanScheduleImage().then(applyScanResult);
    return;
  }
  const scan = state.lastScan;
  $("flightNo").value = scan.flightNo;
  $("origin").value = scan.origin;
  $("destination").value = scan.destination;
  $("flightDate").value = scan.date;
  $("flightTime").value = scan.time;
  $("originTz").value = scan.zone;
  $("presetSelect").value = $("flightMode").value === "layover" ? "layover" : "international";
  generatePresetAlarms();
}

async function detectImageText(file) {
  if (!file || !("TextDetector" in window)) return { text: "", tokens: [] };
  try {
    const detector = new window.TextDetector();
    const image = await createImageBitmap(file);
    const blocks = await detector.detect(image);
    const tokens = blocks.flatMap((block) => tokenizeDetectedBlock(block));
    return {
      text: tokens.map((token) => token.value).join(" "),
      tokens
    };
  } catch {
    return { text: "", tokens: [] };
  }
}

function tokenizeDetectedBlock(block) {
  const rawValue = block.rawValue || "";
  const words = rawValue.match(/[A-Z]{2}\s?\d{2,4}|[A-Z]{3}|\d{1,2}[:시]\d{2}|\d{3,4}|20\d{2}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}월|\d{1,2}일/gi) || [];
  const box = block.boundingBox || { x: 0, y: 0, width: 0, height: 0 };
  return words.map((word, index) => ({
    value: word.toUpperCase(),
    x: box.x + (box.width / Math.max(words.length, 1)) * index,
    y: box.y,
    width: box.width / Math.max(words.length, 1),
    height: box.height
  }));
}

function parseScheduleText(text, tokens = []) {
  const normalized = text.toUpperCase().replace(/\s+/g, " ");
  const dateMatch = normalized.match(/\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/);
  const koreanDateMatch = normalized.match(/\b(\d{1,2})월\s*(\d{1,2})일\b/);
  const timeMatch = normalized.match(/\b([01]?\d|2[0-3])[:시 ]([0-5]\d)\b/);
  const routeMatch = normalized.match(/\b([A-Z]{3})\s*(?:-|→|TO)\s*([A-Z]{3})\b/);
  const flightMatch = normalized.match(/\b([A-Z]{2}\s?\d{2,4})\b/);
  const airportTime = findAirportTimeCandidate(normalized, tokens);
  const year = new Date().getFullYear();
  return {
    date: dateMatch
      ? `${dateMatch[1]}-${pad(dateMatch[2])}-${pad(dateMatch[3])}`
      : koreanDateMatch
        ? `${year}-${pad(koreanDateMatch[1])}-${pad(koreanDateMatch[2])}`
        : "",
    time: airportTime.time || (timeMatch ? `${pad(timeMatch[1])}:${timeMatch[2]}` : ""),
    origin: airportTime.origin || routeMatch?.[1] || "",
    destination: airportTime.destination || routeMatch?.[2] || "",
    flightNo: flightMatch?.[1]?.replace(/\s/g, "") || ""
  };
}

function findAirportTimeCandidate(text, tokens) {
  const spatial = findSpatialAirportTime(tokens);
  if (spatial.origin && spatial.time) return spatial;

  const knownAirports = Object.keys(airportZones).join("|");
  const airportTimeRegex = new RegExp(`\\b(${knownAirports})\\b\\s*(\\d{3,4}|[0-2]?\\d[:시][0-5]\\d)`, "i");
  const match = text.match(airportTimeRegex);
  if (!match) return { origin: "", destination: "", time: "" };

  const afterMatch = text.slice((match.index || 0) + match[0].length);
  const destination = findNextAirport(afterMatch, match[1].toUpperCase());
  return {
    origin: match[1].toUpperCase(),
    destination,
    time: normalizeFlightTime(match[2])
  };
}

function findSpatialAirportTime(tokens) {
  const airports = tokens.filter((token) => airportZones[token.value]);
  const times = tokens.filter((token) => normalizeFlightTime(token.value));
  for (const airport of airports) {
    const rowTimes = times
      .filter((time) => time.x > airport.x)
      .filter((time) => Math.abs(centerY(time) - centerY(airport)) <= Math.max(airport.height, time.height, 18))
      .sort((a, b) => a.x - b.x);
    if (!rowTimes.length) continue;
    const time = rowTimes[0];
    const destination = findSpatialDestination(tokens, airport, time);
    return {
      origin: airport.value,
      destination,
      time: normalizeFlightTime(time.value)
    };
  }
  return { origin: "", destination: "", time: "" };
}

function findSpatialDestination(tokens, origin, time) {
  const candidates = tokens
    .filter((token) => airportZones[token.value] && token.value !== origin.value)
    .filter((token) => token.x > time.x || token.y > origin.y)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  return candidates[0]?.value || "";
}

function findNextAirport(text, origin) {
  const airports = Object.keys(airportZones);
  return airports.find((airport) => airport !== origin && new RegExp(`\\b${airport}\\b`).test(text)) || "";
}

function normalizeFlightTime(value) {
  const compact = String(value).replace(/[^\d]/g, "");
  if (compact.length === 3) return `0${compact[0]}:${compact.slice(1)}`;
  if (compact.length === 4 && Number(compact.slice(0, 2)) <= 23 && Number(compact.slice(2)) <= 59) {
    return `${compact.slice(0, 2)}:${compact.slice(2)}`;
  }
  return "";
}

function centerY(token) {
  return token.y + token.height / 2;
}

function render() {
  updateClock();
  renderAlarms();
  renderChecklist();
  renderTimezoneNote();
}

function renderAlarms() {
  const list = $("alarmList");
  const template = $("alarmTemplate");
  list.innerHTML = "";
  const upcoming = state.alarms.filter((alarm) => new Date(alarm.time) >= new Date() && !alarm.done);
  $("alarmCount").textContent = state.alarms.filter((alarm) => !alarm.done).length;
  $("nextAlarmText").textContent = upcoming[0] ? compactTime(new Date(upcoming[0].time)) : "없음";

  if (!state.alarms.length) {
    list.innerHTML = `<div class="scan-result">알람 자동 생성 또는 수동 알람 추가를 시작하세요.</div>`;
    return;
  }

  state.alarms.forEach((alarm) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.kind = alarm.kind;
    node.classList.toggle("done", alarm.done);
    node.querySelector("h3").textContent = alarm.title;
    node.querySelector("p").textContent = alarm.description;
    node.querySelector("small").textContent = `${formatInZone(new Date(alarm.time), alarm.zone)} · ${alarm.route}`;
    node.querySelector(".check").addEventListener("click", () => toggleAlarm(alarm.id));
    node.querySelector(".delete").addEventListener("click", () => deleteAlarm(alarm.id));
    list.append(node);
  });
}

function renderChecklist() {
  const root = $("checklist");
  root.innerHTML = "";
  const items = state.checklist.length
    ? state.checklist
    : ["여권/신분증", "유니폼", "브리핑 자료", "교통편", "백업 알람"].map((text) => ({ text, done: false }));
  items.forEach((item, index) => {
    const label = document.createElement("label");
    label.innerHTML = `<input type="checkbox" ${item.done ? "checked" : ""}> <span>${item.text}</span>`;
    label.querySelector("input").addEventListener("change", (event) => {
      state.checklist[index] = { text: item.text, done: event.target.checked };
      save();
    });
    root.append(label);
  });
}

function renderTimezoneNote() {
  const flight = getFlightInput();
  $("timezoneNote").textContent = `출발지 시간 ${formatInZone(
    flight.departure,
    flight.originTz
  )} / 베이스 공항 시간 ${formatInZone(flight.departure, flight.baseTz)}. 시간대와 DST는 브라우저 Intl 데이터로 계산됩니다.`;
}

function toggleAlarm(id) {
  state.alarms = state.alarms.map((alarm) =>
    alarm.id === id ? { ...alarm, done: !alarm.done } : alarm
  );
  save();
  render();
}

function deleteAlarm(id) {
  state.alarms = state.alarms.filter((alarm) => alarm.id !== id);
  save();
  render();
}

function resetAll() {
  state.alarms = [];
  state.checklist = [];
  save();
  render();
}

function save() {
  localStorage.setItem("flightAlarms", JSON.stringify(state.alarms));
  localStorage.setItem("flightChecklist", JSON.stringify(state.checklist));
}

function updateClock() {
  $("localTime").textContent = new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date());
}

function formatInZone(date, zone) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: zone,
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short"
  }).format(date);
}

function compactTime(date) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function toDateInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function minutesLabel(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return [hour ? `${hour}시간` : "", minute ? `${minute}분` : ""].filter(Boolean).join(" ");
}

function byTime(a, b) {
  return new Date(a.time) - new Date(b.time);
}

function icsDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeIcs(value) {
  return String(value).replace(/[\\,;]/g, "\\$&").replace(/\n/g, "\\n");
}

function makeId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `alarm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

init();
