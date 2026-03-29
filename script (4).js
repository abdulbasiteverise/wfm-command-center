/* ================================================================
   WFM OPERATIONS COMMAND CENTER — SCRIPT.JS
   Production-grade WFM system. No backend required.
   Features: Login, RBAC, Dynamic Analysts, Break Overrides,
             Error Lifecycle, Reversible Archive, AI Engine
   ================================================================ */
"use strict";

// ============================================================
// AUTH — USERS & SESSION
// ============================================================

const USERS = [
  { username: "abdul", password: "4281", role: "admin" },

  { username: "asad", password: "1111", role: "analyst" },
  { username: "chandan", password: "2222", role: "analyst" },
 { username: "satyam", password: "3333", role: "analyst" },
  { username: "gaurav", password: "4444", role: "analyst" },
   { username: "ritesh", password: "5555", role: "analyst" },
{ username: "dennis", password: "6666", role: "analyst" },
{ username: "sasha", password: "7777", role: "analyst" },
{ username: "bobby", password: "8888", role: "analyst" }
];

let CURRENT_USER = { username: "", displayName: "", role: "" };

function isAdmin()   { return CURRENT_USER.role === "admin";   }
function isAnalyst() { return CURRENT_USER.role === "analyst"; }

function loginFromForm() {
  const username = document.getElementById("username").value.trim().toLowerCase();
  const password = document.getElementById("password").value.trim();
  console.log("Login attempt:", username, password);

  const user = USERS.find(
    u => u.username === username && u.password === password
  );

  if (!user) {
    const errorEl = document.getElementById("login-error");
    errorEl.textContent = "Invalid username or password";
    errorEl.classList.remove("hidden");
    document.getElementById("password").value = "";
    return;
  }

  document.getElementById("login-error").classList.add("hidden");
  CURRENT_USER = { username: user.username, displayName: user.username, role: user.role };
  localStorage.setItem("wfm_user", JSON.stringify(user));
  lsSet("session", CURRENT_USER);
  bootApp();
}

window.loginFromForm = loginFromForm;
window.doLogin = loginFromForm;

function doLogout() {
  lsSet("session", null);
  localStorage.removeItem("wfm_user");
  CURRENT_USER = { username: "", displayName: "", role: "" };
  document.getElementById("app-shell").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("username").value = "";
  document.getElementById("password").value = "";
  document.getElementById("login-error").classList.add("hidden");
}

function loadUserSession() {
  const saved = lsGet("session");
  if (saved && saved.username && saved.role) {
    CURRENT_USER = saved;
    return true;
  }
  return false;
}

function applyRoleUI() {
  // Show/hide admin-only elements
  document.querySelectorAll(".admin-only").forEach(el => {
    el.style.display = isAdmin() ? "" : "none";
  });
  // Analyst status modal: hide admin fields
  if (document.getElementById("modal-admin-fields")) {
    document.getElementById("modal-admin-fields").style.display        = isAdmin() ? "" : "none";
    document.getElementById("modal-admin-error-fields").style.display  = isAdmin() ? "" : "none";
  }
  // User badge
  const nameEl = document.getElementById("user-badge-name");
  const roleEl = document.getElementById("user-badge-role");
  if (nameEl) nameEl.textContent = CURRENT_USER.displayName;
  if (roleEl) {
    roleEl.textContent = CURRENT_USER.role.toUpperCase();
    roleEl.className = "user-badge-role " + (isAdmin() ? "role-admin" : "role-analyst");
  }
}

// ============================================================
// DYNAMIC ANALYST CONFIGURATION
// ============================================================

let ANALYSTS = [
  { id: "satyam",  name: "Satyam",  shiftStart: "08:00", shiftEnd: "17:00", role: "RTA",    isPTO: false },
  { id: "abdul",   name: "Abdul",   shiftStart: "10:00", shiftEnd: "19:00", role: "RTA",    isPTO: false },
  { id: "asad",    name: "Asad",    shiftStart: "11:30", shiftEnd: "20:30", role: "RTA",    isPTO: false },
  { id: "gaurav",  name: "Gaurav",  shiftStart: "13:30", shiftEnd: "22:30", role: "Senior", isPTO: false },
  { id: "chandan", name: "Chandan", shiftStart: "14:30", shiftEnd: "23:30", role: "RTA",    isPTO: false },
];

const WEEKEND_SATURDAY = [
  { id: "abdul", name: "Abdul", shiftStart: "08:30", shiftEnd: "17:30", role: "RTA", isPTO: false },
  { id: "asad",  name: "Asad",  shiftStart: "11:30", shiftEnd: "20:30", role: "RTA", isPTO: false },
];

const WEEKEND_SUNDAY = [
  { id: "chandan", name: "Chandan", shiftStart: "11:30", shiftEnd: "20:30", role: "RTA", isPTO: false },
];

let ANALYST_COLORS = {
  satyam: "#00c8ff", abdul: "#00ff9d", asad: "#ffd60a",
  gaurav: "#ff6b35", chandan: "#c084fc",
};

const COLOR_PALETTE = ["#00c8ff","#00ff9d","#ffd60a","#ff6b35","#c084fc","#ff5faa","#4dffb0","#ff9d00"];
const BACKUP_CHAIN  = ["satyam","abdul","asad","gaurav","chandan"];
const BUFFER_MINUTES = 30;

const TASK_PRIORITY = { cii:3, status:3, staffing:3, ops:2, briefing:2, email:1, audit:1, eod:3 };

// ============================================================
// STATE
// ============================================================

let state = {
  now:               new Date(),
  ptoStatus:         {},
  taskLog:           [],
  errorLog:          [],
  emailErrorLog:     [],
  archiveData:       [],
  lastArchiveBackup: [],
  breakOverrides:    {},    // { analystId: { lunch:{start,end}, brk:{start,end} } }
  editingTaskIdx:    null,
  currentTab:        "dashboard",
  activeDateStr:     "",
};

// ============================================================
// PERSISTENCE
// ============================================================

const LS_KEY_PREFIX = "wfm_v3_";
function lsGet(key)      { try { return JSON.parse(localStorage.getItem(LS_KEY_PREFIX + key)); } catch { return null; } }
function lsSet(key, val) { try { localStorage.setItem(LS_KEY_PREFIX + key, JSON.stringify(val)); } catch {} }

function saveState() {
  const d = toDateStr(state.now);
  lsSet("pto_"         + d, state.ptoStatus);
  lsSet("tasks_"       + d, state.taskLog);
  lsSet("errors_"      + d, state.errorLog);
  lsSet("emailErrors_" + d, state.emailErrorLog);
  lsSet("archive",          state.archiveData);
  lsSet("archiveBackup",    state.lastArchiveBackup);
  lsSet("breakOverrides",   state.breakOverrides);
  lsSet("analysts",         ANALYSTS);
  lsSet("analystColors",    ANALYST_COLORS);
}

function loadState() {
  const d = toDateStr(state.now);

  // Check for new day → reset errors
  checkNewDayReset(d);

  const savedPTO     = lsGet("pto_"         + d);
  const savedTasks   = lsGet("tasks_"       + d);
  const savedErr     = lsGet("errors_"      + d);
  const savedEmail   = lsGet("emailErrors_" + d);
  const savedArch    = lsGet("archive");
  const savedBkp     = lsGet("archiveBackup");
  const savedBreaks  = lsGet("breakOverrides");
  const savedAnalysts= lsGet("analysts");
  const savedColors  = lsGet("analystColors");

  if (savedAnalysts && savedAnalysts.length) ANALYSTS = savedAnalysts;
  if (savedColors)                            ANALYST_COLORS = { ...ANALYST_COLORS, ...savedColors };
  if (savedPTO)   state.ptoStatus   = savedPTO;
  if (savedErr)   state.errorLog    = savedErr;
  if (savedEmail) state.emailErrorLog = savedEmail;
  if (savedArch)  state.archiveData   = savedArch;
  if (savedBkp)   state.lastArchiveBackup = savedBkp;
  if (savedBreaks) state.breakOverrides = savedBreaks;

  if (savedTasks && savedTasks.length > 0 && savedTasks[0]?.dateStr === d) {
    state.taskLog = savedTasks;
  } else {
    state.taskLog = generateTaskSchedule(state.now);
  }
}

// ============================================================
// ERROR LIFECYCLE — DAILY RESET
// ============================================================

function checkNewDayReset(currentDateStr) {
  const lastDay = lsGet("lastActiveDay");
  if (lastDay && lastDay !== currentDateStr) {
    // Archive yesterday's errors before reset
    const oldErrors = lsGet("errors_" + lastDay) || [];
    if (oldErrors.length) {
      const arch = lsGet("archive") || [];
      oldErrors.forEach(e => arch.push({ ...e, archived: true, archiveDate: currentDateStr }));
      lsSet("archive", arch);
    }
  }
  lsSet("lastActiveDay", currentDateStr);
}

// ============================================================
// HELPERS — TIME
// ============================================================

function timeToMinutes(str) {
  const [h, m] = String(str || "00:00").split(":").map(Number);
  return h * 60 + (m || 0);
}
function minutesToTime(mins) {
  const h = Math.floor(Math.max(0, mins) / 60);
  const m = Math.max(0, mins) % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
}
function formatTime12(str) {
  const mins = timeToMinutes(str);
  const h    = Math.floor(mins / 60);
  const m    = mins % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2,"0")} ${ampm}`;
}
function nowMinutes()    { return state.now.getHours() * 60 + state.now.getMinutes(); }
function toDateStr(d)    { return d.toISOString().slice(0, 10); }
function dayName(d)      { return ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()]; }
function slugify(t)      { return String(t||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,""); }
function getCurrentIntervalTime(date) {
  const d   = date || state.now;
  const m   = d.getHours() * 60 + d.getMinutes();
  return minutesToTime(Math.floor(m / 30) * 30);
}
function genId() { return Math.random().toString(36).slice(2, 10); }

// ============================================================
// ANALYST HELPERS
// ============================================================

function getActiveAnalysts(date) {
  const d = (date || state.now).getDay();
  if (d === 6) return WEEKEND_SATURDAY.map(a => ({ ...a }));
  if (d === 0) return WEEKEND_SUNDAY.map(a => ({ ...a }));
  return ANALYSTS.map(a => ({ ...a }));
}

function getAnalystConfig(id, date) {
  return getActiveAnalysts(date).find(a => a.id === id) || null;
}

function getAnalystName(id) {
  if (!id) return "";
  const a = ANALYSTS.find(x => x.id === id);
  return a ? a.name : id;
}

function isInBuffer(analyst, currentTime) {
  const loginM = timeToMinutes(analyst.shiftStart);
  const t      = timeToMinutes(currentTime);
  return t >= loginM && t < loginM + BUFFER_MINUTES;
}

function isAnalystOnShift(analystId, time24, date) {
  const cfg = getAnalystConfig(analystId, date);
  if (!cfg)                                  return false;
  if (state.ptoStatus[analystId] === "pto") return false;
  const t = timeToMinutes(time24);
  return t >= timeToMinutes(cfg.shiftStart) && t < timeToMinutes(cfg.shiftEnd);
}

function isAnalystAvailable(analystId, time24, date, taskType) {
  if (!isAnalystOnShift(analystId, time24, date)) return false;
  const cfg    = getAnalystConfig(analystId, date);
  const t      = timeToMinutes(time24);
  const loginM = timeToMinutes(cfg.shiftStart);
  if (t < loginM + BUFFER_MINUTES) {
    if (taskType && taskType !== "email" && taskType !== "audit") return false;
  }
  const breaks = getBreakForAnalyst(analystId);
  if (breaks) {
    const { lunch, brk } = breaks;
    if (lunch && t >= timeToMinutes(lunch.start) && t < timeToMinutes(lunch.end)) return false;
    if (brk   && t >= timeToMinutes(brk.start)   && t < timeToMinutes(brk.end))   return false;
  }
  return true;
}

function getAnalystStatusAt(analystId, time24, date) {
  if (state.ptoStatus[analystId] === "pto") return "pto";
  const cfg = getAnalystConfig(analystId, date);
  if (!cfg) return "not-scheduled";
  const t      = timeToMinutes(time24);
  const login  = timeToMinutes(cfg.shiftStart);
  const logout = timeToMinutes(cfg.shiftEnd);
  if (t < login)   return "pre-shift";
  if (t >= logout) return "off-shift";
  if (t < login + BUFFER_MINUTES) return "buffer";
  const breaks = getBreakForAnalyst(analystId);
  if (breaks) {
    if (breaks.lunch && t >= timeToMinutes(breaks.lunch.start) && t < timeToMinutes(breaks.lunch.end)) return "lunch";
    if (breaks.brk   && t >= timeToMinutes(breaks.brk.start)   && t < timeToMinutes(breaks.brk.end))   return "break";
  }
  return "active";
}

// ============================================================
// BREAK SYSTEM — with override support
// ============================================================

function generateDynamicBreaks(analysts) {
  const breaks = {};
  const usedSlots = [];
  const sorted = [...analysts].sort((a, b) => timeToMinutes(a.shiftStart) - timeToMinutes(b.shiftStart));

  sorted.forEach(analyst => {
    const startM = timeToMinutes(analyst.shiftStart);
    const endM   = timeToMinutes(analyst.shiftEnd);
    const mid    = startM + Math.floor((endM - startM) / 2);

    let lunchStart = null;
    for (let offset = 0; offset <= 90; offset += 30) {
      for (const sign of [0, -1, 1]) {
        const candidate    = mid + sign * offset - 30;
        const candidateEnd = candidate + 60;
        if (candidate < startM + 60 || candidateEnd > endM - 30) continue;
        const overlaps = usedSlots.some(s =>
          s.type === "lunch" && candidate < s.end && candidateEnd > s.start
        );
        if (!overlaps) { lunchStart = candidate; break; }
      }
      if (lunchStart !== null) break;
    }
    if (lunchStart === null) lunchStart = mid - 30;
    const lunchEnd = lunchStart + 60;
    usedSlots.push({ type: "lunch", start: lunchStart, end: lunchEnd });

    let brkStart = lunchStart - 120;
    if (brkStart < startM + BUFFER_MINUTES) brkStart = startM + BUFFER_MINUTES;
    const brkEnd = brkStart + 30;
    usedSlots.push({ type: "brk", start: brkStart, end: brkEnd });

    breaks[analyst.id] = {
      lunch: { start: minutesToTime(lunchStart), end: minutesToTime(lunchEnd) },
      brk:   { start: minutesToTime(brkStart),   end: minutesToTime(brkEnd) }
    };
  });
  return breaks;
}

let BREAK_DEFINITIONS = {};

function getBreakForAnalyst(analystId) {
  // Override takes precedence
  if (state.breakOverrides[analystId]) return state.breakOverrides[analystId];
  return BREAK_DEFINITIONS[analystId] || null;
}

// Admin: update a single analyst's break
function updateBreak(analystId, breakType, start, end) {
  if (!isAdmin()) return;
  if (!state.breakOverrides[analystId]) {
    state.breakOverrides[analystId] = { ...BREAK_DEFINITIONS[analystId] };
  }
  state.breakOverrides[analystId][breakType] = { start, end };
  saveState();
  recalculateAssignments();
}

// Admin: reset a single analyst's break override
function resetBreak(analystId) {
  if (!isAdmin()) return;
  delete state.breakOverrides[analystId];
  saveState();
  recalculateAssignments();
}

// Admin: reset ALL break overrides
function resetAllBreaks() {
  if (!isAdmin()) return;
  state.breakOverrides = {};
  saveState();
  recalculateAssignments();
  renderBreaksPanel();
}

function openBreakEditModal(analystId, breakType) {
  if (!isAdmin()) return;
  const breaks = getBreakForAnalyst(analystId);
  if (!breaks) return;
  const slot = breakType === "lunch" ? breaks.lunch : breaks.brk;
  document.getElementById("break-edit-analyst-id").value = analystId;
  document.getElementById("break-edit-type").value       = breakType;
  document.getElementById("break-edit-start").value      = slot.start;
  document.getElementById("break-edit-end").value        = slot.end;
  document.getElementById("break-edit-title").textContent =
    `EDIT ${breakType.toUpperCase()} — ${getAnalystName(analystId)}`;
  document.getElementById("modal-overlay").classList.remove("hidden");
  document.getElementById("modal-break-edit").classList.remove("hidden");
}

function saveBreakOverride() {
  const id    = document.getElementById("break-edit-analyst-id").value;
  const type  = document.getElementById("break-edit-type").value;
  const start = document.getElementById("break-edit-start").value;
  const end   = document.getElementById("break-edit-end").value;
  if (!start || !end) return;
  updateBreak(id, type === "lunch" ? "lunch" : "brk", start, end);
  closeAllModals();
  renderBreaksPanel();
}

function resetBreakOverride() {
  const id = document.getElementById("break-edit-analyst-id").value;
  resetBreak(id);
  closeAllModals();
  renderBreaksPanel();
}

// ============================================================
// INTELLIGENT ASSIGNMENT SCORING
// ============================================================

function scoreAnalyst(analystId, time24, taskType, workloadMap, date) {
  const cfg = getAnalystConfig(analystId, date);
  if (!cfg)                                  return -999;
  if (state.ptoStatus[analystId] === "pto") return -999;
  if (!isAnalystOnShift(analystId, time24, date)) return -999;

  const t      = timeToMinutes(time24);
  const loginM = timeToMinutes(cfg.shiftStart);
  const inBuf  = t < loginM + BUFFER_MINUTES;
  const breaks = getBreakForAnalyst(analystId);
  if (breaks) {
    const { lunch, brk } = breaks;
    if (lunch && t >= timeToMinutes(lunch.start) && t < timeToMinutes(lunch.end)) return -999;
    if (brk   && t >= timeToMinutes(brk.start)   && t < timeToMinutes(brk.end))   return -999;
  }

  const maxLoad        = 40;
  const assigned       = workloadMap[analystId] || 0;
  const workloadScore  = 1 - (assigned / maxLoad);
  const priorityWeight = (TASK_PRIORITY[taskType] || 1) / 3;
  const bufferPenalty  = (inBuf && taskType !== "email" && taskType !== "audit") ? 999 : 0;
  return 1 + workloadScore + priorityWeight - bufferPenalty;
}

function getBackup(primaryId, time24, date, excludeIds = []) {
  const activeAnalysts = getActiveAnalysts(date);
  const chain = BACKUP_CHAIN.filter(id =>
    id !== primaryId &&
    !excludeIds.includes(id) &&
    activeAnalysts.find(a => a.id === id) &&
    isAnalystAvailable(id, time24, date)
  );
  return chain[0] || null;
}

function assignAuditQueue(analysts, time24) {
  const available = analysts.filter(a =>
    state.ptoStatus[a.id] !== "pto" &&
    isAnalystAvailable(a.id, time24, state.now) &&
    !isInBuffer(a, time24)
  );
  if (!available.length) return null;
  const slotIndex = Math.floor(timeToMinutes(time24) / 30);
  return available[slotIndex % available.length].id;
}

function recalculateAssignments() {
  BREAK_DEFINITIONS = generateDynamicBreaks(ANALYSTS);
  state.taskLog = generateTaskSchedule(state.now);
  saveState();
  refreshAll();
}

// ============================================================
// TASK GENERATION ENGINE
// ============================================================

function generateTaskSchedule(date) {
  date = date || state.now;
  const analysts = getActiveAnalysts(date);
  const tasks    = [];
  const dayIdx   = date.getDay();
  const isSun    = dayIdx === 0;
  const isSat    = dayIdx === 6;

  BREAK_DEFINITIONS = generateDynamicBreaks(analysts);

  // Shift end cap: no tasks beyond latest shift end
  const shiftEndCap = Math.max(...analysts.map(a => timeToMinutes(a.shiftEnd)));
  const ciiCap      = Math.min(timeToMinutes("22:00"), shiftEndCap);
  const statusCap   = Math.min(timeToMinutes("22:00"), shiftEndCap);

  function bestOwner(preferredIds, time24, taskType) {
    for (const id of preferredIds) {
      if (analysts.find(a => a.id === id) && isAnalystAvailable(id, time24, date, taskType)) return id;
    }
    for (const a of analysts) {
      if (isAnalystAvailable(a.id, time24, date, taskType)) return a.id;
    }
    return null;
  }

  // STAFFING REPORTS — fixed times
  const staffingTimes = isSun ? ["11:30"] : ["08:30","14:00","17:00"];
  staffingTimes.forEach(time => {
    if (timeToMinutes(time) <= shiftEndCap) {
      const owner = bestOwner(["satyam","abdul","asad","gaurav","chandan"], time, "staffing");
      tasks.push(makeTask(time, "Staffing Report", owner, "staffing", date));
    }
  });

  // DAILY OPS — weekdays only
  if (!isSat && !isSun && timeToMinutes("09:30") <= shiftEndCap) {
    const owner = bestOwner(["satyam","abdul"], "09:30", "ops") ||
                  bestOwner(["asad","gaurav","chandan"], "09:30", "ops");
    tasks.push(makeTask("09:30", "Daily Ops Update", owner, "ops", date, !owner));
  }

  // BRIEFING FILE — opener + handoffs
  if (analysts.length > 0) {
    const opener = analysts.reduce((a, b) =>
      timeToMinutes(a.shiftStart) <= timeToMinutes(b.shiftStart) ? a : b
    );
    tasks.push(makeTask(opener.shiftStart, "Briefing File Update", opener.id, "briefing", date));
    analysts.filter(a => a.id !== opener.id).forEach(analyst => {
      const loginTime = minutesToTime(timeToMinutes(analyst.shiftStart) + BUFFER_MINUTES);
      if (timeToMinutes(loginTime) <= shiftEndCap)
        tasks.push(makeTask(loginTime, "Briefing File Update (Handoff)", analyst.id, "briefing", date));
    });
  }

  // CII REPORTS — weekdays only, every 30 min 10:00–22:00
  if (!isSat && !isSun) {
    for (let m = timeToMinutes("10:00"); m <= ciiCap; m += 30) {
      const time  = minutesToTime(m);
      const owner = bestOwner(["abdul","asad","satyam","gaurav","chandan"], time, "cii");
      tasks.push(makeTask(time, "CII Report", owner, "cii", date, false, !owner));
    }
  }

  // STATUS REPORTS — every 60 min 10:00–22:00
  for (let m = timeToMinutes("10:00"); m <= statusCap; m += 60) {
    const time  = minutesToTime(m);
    const owner = bestOwner(["satyam","abdul","asad","gaurav","chandan"], time, "status");
    tasks.push(makeTask(time, "Status Report", owner, "status", date, false, !owner));
  }

  // EMAIL HANDLING — continuous
  for (let m = timeToMinutes("08:00"); m < shiftEndCap; m += 30) {
    const time  = minutesToTime(m);
    const owner = bestOwner(BACKUP_CHAIN, time, "email");
    if (owner) tasks.push(makeTask(time, "Email Handling", owner, "email", date));
  }

  // AUDIT QUEUE — every 30 min 10:00–22:00
  for (let m = timeToMinutes("10:00"); m <= Math.min(timeToMinutes("22:00"), shiftEndCap); m += 30) {
    const time  = minutesToTime(m);
    const owner = assignAuditQueue(analysts, time);
    if (owner) tasks.push(makeTask(time, "Audit Queue", owner, "audit", date));
  }

  // EOD REPORT
  const eodTime = "23:30";
  let eodOwner  = null;
  const eodCandidates = [...analysts].sort((a, b) =>
    timeToMinutes(b.shiftEnd) - timeToMinutes(a.shiftEnd)
  );
  for (const a of eodCandidates) {
    if (state.ptoStatus[a.id] !== "pto" && timeToMinutes(a.shiftEnd) >= timeToMinutes(eodTime)) {
      eodOwner = a.id; break;
    }
  }
  if (!eodOwner && eodCandidates.length) eodOwner = eodCandidates[0].id;
  tasks.push(makeTask(eodTime, "EOD Report", eodOwner, "eod", date));

  tasks.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  return tasks;
}

function makeTask(time, name, plannedOwner, type, date, forcedAssign, riskInterval) {
  const id = `${type}-${time.replace(":","")}-${slugify(name)}`;
  let actualOwner = plannedOwner;
  if (plannedOwner && state.ptoStatus[plannedOwner] === "pto") {
    actualOwner = getBackup(plannedOwner, time, date);
  }
  return {
    id, time, name, type,
    plannedOwner, actualOwner,
    status: "pending",
    error: false, errorType: "", notes: "",
    riskInterval:  Boolean(riskInterval),
    forcedAssign:  Boolean(forcedAssign),
    dateStr:       toDateStr(date || state.now),
    autoReassigned: false,
  };
}

function getOrBuildTaskLog(date) {
  const d = date || state.now;
  if (state.taskLog.length === 0 || state.taskLog[0]?.dateStr !== toDateStr(d)) {
    state.taskLog = generateTaskSchedule(d);
  }
  return state.taskLog;
}

// ============================================================
// TASK CONTROL — ADMIN-GATED
// ============================================================

// Admin: delete a task
function deleteTask(idx) {
  if (!isAdmin()) return;
  if (!confirm("Delete this task? This cannot be undone.")) return;
  state.taskLog.splice(idx, 1);
  saveState();
  refreshAll();
}

function deleteCurrentTask() {
  if (!isAdmin()) return;
  const idx = state.editingTaskIdx;
  if (idx === null || idx === undefined) return;
  closeAllModals();
  deleteTask(idx);
}

// Admin: update task type
function updateTaskType(idx, newType) {
  if (!isAdmin()) return;
  const typeNames = {
    cii: "CII Report", status: "Status Report", staffing: "Staffing Report",
    ops: "Daily Ops Update", email: "Email Handling", audit: "Audit Queue",
    briefing: "Briefing File Update", eod: "EOD Report"
  };
  state.taskLog[idx].type = newType;
  if (typeNames[newType]) state.taskLog[idx].name = typeNames[newType];
  saveState();
}

// Admin: add custom task
function openAddTaskModal() {
  if (!isAdmin()) return;
  populateModalAnalysts("add-task-owner");
  document.getElementById("modal-overlay").classList.remove("hidden");
  document.getElementById("modal-add-task").classList.remove("hidden");
}

function submitAddTask() {
  if (!isAdmin()) return;
  const time  = document.getElementById("add-task-time").value;
  const name  = document.getElementById("add-task-name").value.trim();
  const type  = document.getElementById("add-task-type").value;
  const owner = document.getElementById("add-task-owner").value;
  if (!time || !name) { alert("Time and Task Name are required."); return; }
  const task = makeTask(time, name, owner || null, type, state.now);
  task.manualAdd = true;
  state.taskLog.push(task);
  state.taskLog.sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
  saveState();
  closeAllModals();
  refreshAll();
}

// ============================================================
// AUTO TASK REASSIGNMENT (AI ENGINE)
// ============================================================

let _reassignCount = 0;

function autoReassignTasks() {
  const nm     = nowMinutes();
  const time24 = minutesToTime(nm);

  const activeAnalysts = ANALYSTS
    .filter(a =>
      state.ptoStatus[a.id] !== "pto" &&
      getAnalystStatusAt(a.id, time24) === "active"
    )
    .map(a => a.id);

  if (!activeAnalysts.length) return;

  const workload = {};
  activeAnalysts.forEach(id => (workload[id] = 0));
  state.taskLog.forEach(task => {
    if (task.status !== "done" && task.status !== "missed") {
      if (workload[task.plannedOwner] !== undefined) workload[task.plannedOwner]++;
    }
  });

  state.taskLog.forEach(task => {
    if (task.status === "done" || task.status === "missed") return;
    if (task.manualOwner) return;
    const taskM = timeToMinutes(task.time);
    if (taskM < nm - 30) return;

    const isInactive  = task.plannedOwner && !activeAnalysts.includes(task.plannedOwner);
    const isOverloaded = task.plannedOwner && workload[task.plannedOwner] !== undefined && workload[task.plannedOwner] > 8;

    if (isInactive || isOverloaded) {
      let target = activeAnalysts[0];
      activeAnalysts.forEach(id => { if ((workload[id]||0) < (workload[target]||0)) target = id; });
      if (target && target !== task.plannedOwner) {
        if (workload[task.plannedOwner] !== undefined) workload[task.plannedOwner]--;
        task.plannedOwner   = target;
        task.actualOwner    = target;
        task.autoReassigned = true;
        workload[target]    = (workload[target]||0) + 1;
        _reassignCount++;
      }
    }
  });
}

// ============================================================
// AUTO STATUS UPDATES
// ============================================================

function autoUpdateTaskStatuses() {
  const nm = nowMinutes();
  let changed = false;
  state.taskLog.forEach(task => {
    const tm = timeToMinutes(task.time);
    if (task.status === "pending" && tm < nm - 15 && !task.actualOwner) {
      task.status = "missed";
      changed = true;
    }
  });
  if (changed) saveState();
}

// ============================================================
// AI RECOMMENDATIONS ENGINE
// ============================================================

function isNearDeadline(time24) {
  const nm   = nowMinutes();
  const task = timeToMinutes(time24);
  return task > nm && task - nm <= 20;
}

function generateAIRecommendations() {
  const recs = [];
  const nm   = nowMinutes();
  const time24 = minutesToTime(nm);

  const missed = state.taskLog.filter(t => t.status === "missed");
  if (missed.length > 0) {
    recs.push({ type:"critical", icon:"🔴",
      text: `${missed.length} task${missed.length>1?"s":""} missed. Immediate recovery action required.` });
  }

  const taskErrors  = state.taskLog.filter(t => t.error).length;
  const openErrors  = state.errorLog.filter(e => !e.resolved).length;
  const totalErrors = taskErrors + openErrors;
  if (totalErrors >= 3) {
    recs.push({ type:"warning", icon:"🟡",
      text: `High error volume (${totalErrors} open). Root cause investigation recommended.` });
  }

  const workload = {};
  state.taskLog.forEach(t => { if (t.plannedOwner) workload[t.plannedOwner] = (workload[t.plannedOwner]||0) + 1; });
  Object.keys(workload).forEach(id => {
    if (workload[id] > 8) {
      recs.push({ type:"warning", icon:"🟡",
        text: `${getAnalystName(id)} has ${workload[id]} assigned tasks. Consider redistribution.` });
    }
  });

  const backups = state.taskLog.filter(t => t.actualOwner && t.plannedOwner && t.actualOwner !== t.plannedOwner);
  if (backups.length > 2) {
    recs.push({ type:"info", icon:"🔵",
      text: `Frequent backup usage (${backups.length} tasks). Possible staffing gap — review coverage.` });
  }

  const atRisk = state.taskLog.filter(t => t.status !== "done" && t.status !== "missed" && isNearDeadline(t.time));
  if (atRisk.length > 0) {
    recs.push({ type:"warning", icon:"⚠",
      text: `${atRisk.length} task${atRisk.length>1?"s":""} approaching deadline in < 20 min: ${atRisk.map(t=>t.name).join(", ")}.` });
  }

  const activeNow = ANALYSTS.filter(a =>
    state.ptoStatus[a.id] !== "pto" && getAnalystStatusAt(a.id, time24) === "active"
  );
  if (activeNow.length === 1 && nm >= timeToMinutes("10:00") && nm < timeToMinutes("23:00")) {
    recs.push({ type:"critical", icon:"🔴",
      text: `Only 1 analyst active (${getAnalystName(activeNow[0].id)}). SLA risk HIGH — call in backup.` });
  }

  if (recs.length === 0) {
    recs.push({ type:"ok", icon:"✅", text: "All systems nominal. Operations running within parameters." });
  }
  return recs;
}

function renderAIInsights() {
  const recs  = generateAIRecommendations();
  const body  = document.getElementById("ai-insights-body");
  const badge = document.getElementById("ai-rec-count");
  if (!body) return;

  const crits = recs.filter(r => r.type === "critical").length;
  const warns = recs.filter(r => r.type === "warning").length;
  if (crits > 0) { badge.textContent = `${crits} CRITICAL`; badge.className = "panel-badge ai-badge ai-badge-critical"; }
  else if (warns > 0) { badge.textContent = `${warns} WARNING`; badge.className = "panel-badge ai-badge ai-badge-warning"; }
  else { badge.textContent = "ALL CLEAR"; badge.className = "panel-badge ai-badge ai-badge-ok"; }

  body.innerHTML = recs.map(r =>
    `<div class="ai-card ai-card-${r.type}">
       <span class="ai-card-icon">${r.icon}</span>
       <span class="ai-card-text">${r.text}</span>
     </div>`
  ).join("");
}

// ============================================================
// ANALYTICS
// ============================================================

function renderAnalytics() {
  const tasks = state.taskLog;
  const nm    = nowMinutes();
  const past  = tasks.filter(t => timeToMinutes(t.time) <= nm);
  const comp  = past.filter(t => t.status === "done").length;
  const errs  = past.filter(t => t.error).length;
  const miss  = past.filter(t => t.status === "missed").length;
  const total = comp + errs + miss;
  const eff   = total > 0 ? Math.round((comp / total) * 100) : 100;
  const atRisk = tasks.filter(t => t.status !== "done" && t.status !== "missed" && isNearDeadline(t.time)).length;
  const backupCount = tasks.filter(t => t.actualOwner && t.plannedOwner && t.actualOwner !== t.plannedOwner).length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const setColor = (id, color) => { const el = document.getElementById(id); if (el) el.style.color = color; };

  set("analytic-efficiency", `${eff}%`);
  setColor("analytic-efficiency", eff >= 80 ? "var(--success)" : eff >= 60 ? "var(--warn)" : "var(--danger)");
  set("analytic-efficiency-sub", `${comp} done · ${errs} errors · ${miss} missed`);
  set("analytic-sla", atRisk);
  setColor("analytic-sla", atRisk > 0 ? "var(--warn)" : "var(--success)");
  set("analytic-sla-sub", atRisk > 0 ? "tasks due in < 20 min" : "no immediate risk");
  set("analytic-reassign", _reassignCount);
  set("analytic-backup", backupCount);
}

// ============================================================
// ERROR COMMAND CENTER
// ============================================================

function renderErrorCommandCenter() {
  const body  = document.getElementById("error-command-body");
  const badge = document.getElementById("error-master-badge");
  if (!body) return;

  const open = state.errorLog.filter(e => !e.resolved);
  if (badge) {
    badge.textContent = `${open.length} OPEN`;
    badge.style.color = open.length > 0 ? "var(--danger)" : "var(--success)";
  }

  if (!open.length) {
    body.innerHTML = `<div style="padding:16px 20px;font-family:var(--font-mono);font-size:11px;color:var(--muted)">✅ No open errors — all clear.</div>`;
    return;
  }

  body.innerHTML = open.map((err, i) => {
    const origIdx = state.errorLog.indexOf(err);
    const sevClass = { low:"sev-low", medium:"sev-medium", high:"sev-high", critical:"sev-critical" }[err.severity||"medium"] || "sev-medium";
    return `<div class="ecc-row">
      <div class="ecc-left">
        <span class="ecc-sev ${sevClass}">${(err.severity||"medium").toUpperCase()}</span>
        <span class="ecc-analyst" style="color:${ANALYST_COLORS[err.analyst]||'var(--accent)'}">${getAnalystName(err.analyst)}</span>
        <span class="ecc-task">${err.task}</span>
        <span class="error-type-badge err-${errorClass(err.type)}">${err.type}</span>
        <span class="ecc-time">${err.time}</span>
      </div>
      <div class="ecc-desc">${err.desc||"—"}</div>
      <div class="ecc-actions">
        <button class="btn-resolve" onclick="resolveError(${origIdx})">✓ RESOLVE</button>
        <button class="btn-small" style="background:rgba(255,149,0,0.15);color:var(--warn);border-color:var(--warn)" onclick="openEscalateModal('${err.id||origIdx}')">⬆ ESCALATE</button>
        <button class="btn-small admin-only" style="background:rgba(255,59,59,0.1);color:var(--danger);border-color:var(--danger)" onclick="deleteErrorByIdx(${origIdx})">🗑</button>
      </div>
    </div>`;
  }).join("");
}

function openEscalateModal(errorId) {
  document.getElementById("escalate-error-id").value = errorId;
  document.getElementById("escalate-note").value = "";
  document.getElementById("modal-overlay").classList.remove("hidden");
  document.getElementById("modal-escalate").classList.remove("hidden");
}

function submitEscalation() {
  const id   = document.getElementById("escalate-error-id").value;
  const note = document.getElementById("escalate-note").value.trim();
  const idx  = parseInt(id);
  if (!isNaN(idx) && state.errorLog[idx]) {
    state.errorLog[idx].status      = "escalated";
    state.errorLog[idx].escalation  = note;
    state.errorLog[idx].escalatedBy = CURRENT_USER.displayName;
    state.errorLog[idx].escalatedAt = new Date().toISOString();
    saveState();
    renderErrorLog();
  }
  closeAllModals();
}

function deleteErrorByIdx(idx) {
  if (!isAdmin()) return;
  if (!confirm("Delete this error record?")) return;
  state.errorLog.splice(idx, 1);
  saveState();
  renderErrorLog();
  renderKPIs();
}

// ============================================================
// LIVE CLOCK & WEEKEND BANNER
// ============================================================

function updateClock() {
  state.now = new Date();
  const h = String(state.now.getHours()).padStart(2,"0");
  const m = String(state.now.getMinutes()).padStart(2,"0");
  const s = String(state.now.getSeconds()).padStart(2,"0");
  const clockEl = document.getElementById("live-clock");
  if (clockEl) clockEl.textContent = `${h}:${m}:${s}`;

  const days   = ["SUNDAY","MONDAY","TUESDAY","WEDNESDAY","THURSDAY","FRIDAY","SATURDAY"];
  const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const dateEl = document.getElementById("live-date");
  if (dateEl) dateEl.textContent =
    `${days[state.now.getDay()]} ${state.now.getDate()} ${months[state.now.getMonth()]} ${state.now.getFullYear()}`;

  const nm   = nowMinutes();
  let zone = "OFF";
  if (nm >= timeToMinutes("08:00") && nm < timeToMinutes("12:00")) zone = "MORNING";
  else if (nm >= timeToMinutes("12:00") && nm < timeToMinutes("17:00")) zone = "MID";
  else if (nm >= timeToMinutes("17:00") && nm < timeToMinutes("23:30")) zone = "LATE";
  const zoneEl = document.getElementById("shift-zone-value");
  if (zoneEl) zoneEl.textContent = zone;

  autoUpdateTaskStatuses();
}

function updateWeekendBanner() {
  const d      = state.now.getDay();
  const banner = document.getElementById("weekend-banner");
  const text   = document.getElementById("weekend-mode-text");
  if (!banner) return;
  if (d === 6) {
    banner.classList.remove("hidden");
    text.textContent = "SATURDAY SCHEDULE: Abdul (8:30–5:30) · Asad (11:30–8:30)";
  } else if (d === 0) {
    banner.classList.remove("hidden");
    text.textContent = "SUNDAY SCHEDULE: Chandan only (11:30–8:30)";
  } else {
    banner.classList.add("hidden");
  }
}

// ============================================================
// KPI CALCULATIONS
// ============================================================

function calcKPIs() {
  const nm    = nowMinutes();
  const tasks = state.taskLog;
  const ciiTasks   = tasks.filter(t => t.type === "cii"    && timeToMinutes(t.time) <= nm);
  const ciiDone    = ciiTasks.filter(t => t.status === "done").length;
  const ciiPct     = ciiTasks.length ? Math.round((ciiDone / ciiTasks.length) * 100) : 0;
  const sTasks     = tasks.filter(t => t.type === "status" && timeToMinutes(t.time) <= nm);
  const sDone      = sTasks.filter(t => t.status === "done").length;
  const statusPct  = sTasks.length ? Math.round((sDone / sTasks.length) * 100) : 0;
  const staffTasks = tasks.filter(t => t.type === "staffing");
  const staffDone  = staffTasks.filter(t => t.status === "done").length;
  const opsDone    = tasks.some(t => t.type === "ops" && t.status === "done");
  const eodDone    = tasks.some(t => t.type === "eod" && t.status === "done");
  const taskErrors  = tasks.filter(t => t.error).length;
  const totalErrors = state.errorLog.length + state.emailErrorLog.length + taskErrors;
  return { ciiPct, ciiTotal:ciiTasks.length, ciiDone, statusPct, statusTotal:sTasks.length, statusDone:sDone,
           staffDone, staffTotal:staffTasks.length, opsDone, eodDone, totalErrors, taskErrors };
}

function renderKPIs() {
  const kpi = calcKPIs();
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const setW = (id, w) =>  { const el = document.getElementById(id); if (el) el.style.width  = `${w}%`; };

  set("kpi-cii-val",  `${kpi.ciiPct}%`);
  set("kpi-cii-sub",  `${kpi.ciiDone}/${kpi.ciiTotal} intervals`);
  setW("kpi-cii-fill", kpi.ciiPct);
  colorKPI("kpi-cii", kpi.ciiPct, 80);

  set("kpi-status-val",  `${kpi.statusPct}%`);
  set("kpi-status-sub",  `${kpi.statusDone}/${kpi.statusTotal} reports`);
  setW("kpi-status-fill", kpi.statusPct);
  colorKPI("kpi-status", kpi.statusPct, 80);

  set("kpi-staffing-val",  `${kpi.staffDone}/${kpi.staffTotal}`);
  setW("kpi-staffing-fill", kpi.staffTotal ? (kpi.staffDone/kpi.staffTotal)*100 : 0);
  set("kpi-ops-val",  kpi.opsDone ? "✓ DONE" : "PENDING");
  setW("kpi-ops-fill", kpi.opsDone ? 100 : 0);
  set("kpi-eod-val",  kpi.eodDone ? "✓ DONE" : "PENDING");
  setW("kpi-eod-fill", kpi.eodDone ? 100 : 0);
  set("kpi-err-val",  kpi.totalErrors);
  set("kpi-err-sub",  kpi.totalErrors === 0 ? "No issues" : `${kpi.taskErrors} task + ${kpi.totalErrors - kpi.taskErrors} logged`);
  setW("kpi-err-fill", Math.min(100, kpi.totalErrors * 10));
}

function colorKPI(id, pct, threshold) {
  const el   = document.getElementById(id);
  const fill = el?.querySelector(".kpi-fill");
  if (!fill) return;
  if (pct >= threshold) fill.style.background = "linear-gradient(90deg,#00e676,#00c8ff)";
  else if (pct >= 60)   fill.style.background = "linear-gradient(90deg,#ff9500,#ffd60a)";
  else                  fill.style.background = "linear-gradient(90deg,#ff3b3b,#ff6b35)";
}

// ============================================================
// AGENT CARDS
// ============================================================

function renderAgentCards() {
  const container = document.getElementById("agent-cards-container");
  if (!container) return;
  const nm     = nowMinutes();
  const time24 = minutesToTime(nm);
  let activeCount = 0;

  const taskCounts = {}, doneCounts = {};
  ANALYSTS.forEach(a => { taskCounts[a.id] = 0; doneCounts[a.id] = 0; });
  state.taskLog.forEach(task => {
    if (task.actualOwner) taskCounts[task.actualOwner] = (taskCounts[task.actualOwner]||0) + 1;
  });
  state.taskLog.filter(t => t.status === "done").forEach(task => {
    if (task.actualOwner) doneCounts[task.actualOwner] = (doneCounts[task.actualOwner]||0) + 1;
  });

  container.innerHTML = "";
  ANALYSTS.forEach(cfg => {
    const status  = getAnalystStatusAt(cfg.id, time24);
    const isPTO   = state.ptoStatus[cfg.id] === "pto";
    let cardClass = "agent-card inactive-agent";
    if (isPTO)    cardClass = "agent-card pto-agent";
    else if (status === "active") { cardClass = "agent-card active-agent"; activeCount++; }
    else if (status === "lunch" || status === "break") cardClass = "agent-card break-agent";

    const total = taskCounts[cfg.id] || 0;
    const done  = doneCounts[cfg.id] || 0;
    const pct   = total ? Math.round((done/total)*100) : 0;
    const color = ANALYST_COLORS[cfg.id] || "#4a6080";

    const pills = {
      pto:          `<span class="status-pill pill-pto">ON PTO</span>`,
      active:       `<span class="status-pill pill-active">ACTIVE</span>`,
      buffer:       `<span class="status-pill pill-buffer">BUFFER</span>`,
      lunch:        `<span class="status-pill pill-lunch">LUNCH</span>`,
      break:        `<span class="status-pill pill-break">BREAK</span>`,
      "pre-shift":  `<span class="status-pill pill-inactive">PRE-SHIFT</span>`,
      "off-shift":  `<span class="status-pill pill-inactive">OFF SHIFT</span>`,
      "not-scheduled": `<span class="status-pill pill-inactive">NOT TODAY</span>`,
    };
    const pillHtml = isPTO ? pills.pto : (pills[status] || "");

    const currentTask = state.taskLog.find(task =>
      task.actualOwner === cfg.id &&
      timeToMinutes(task.time) <= nm &&
      timeToMinutes(task.time) >= nm - 30 &&
      task.status !== "done"
    );

    container.innerHTML += `
      <div class="${cardClass}" style="border-left-color:${color}">
        <div class="agent-name" style="color:${color}">${cfg.name}
          <span style="font-size:9px;color:var(--muted);font-family:var(--font-mono);margin-left:6px">${cfg.role}</span>
        </div>
        <div class="agent-shift">${cfg.shiftStart} – ${cfg.shiftEnd}</div>
        <div class="agent-status-row">
          ${pillHtml}
          <span class="agent-task-count">${done}/${total} tasks</span>
        </div>
        ${currentTask ? `<div class="agent-shift" style="margin-top:4px;color:#7090a0">▶ ${currentTask.name}</div>` : ""}
        <div class="agent-progress-bar">
          <div class="agent-progress-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
  });

  const badge = document.getElementById("active-count-badge");
  if (badge) badge.textContent = `${activeCount} ACTIVE`;
}

// ============================================================
// TIMELINE
// ============================================================

function renderTimeline() {
  const container = document.getElementById("timeline-container");
  if (!container) return;
  const nm      = nowMinutes();
  const nonEmail = state.taskLog.filter(t => t.type !== "email" && t.type !== "audit");
  const sorted   = [...nonEmail].sort((a,b) => timeToMinutes(a.time)-timeToMinutes(b.time));
  const past     = sorted.filter(t => timeToMinutes(t.time) < nm).slice(-5);
  const future   = sorted.filter(t => timeToMinutes(t.time) >= nm).slice(0,20);
  const visible  = [...past, ...future];

  container.innerHTML = visible.map(task => {
    const tm       = timeToMinutes(task.time);
    const isPast   = tm < nm;
    const isCurrent = tm >= nm && tm <= nm + 30;
    const isMissed = task.status === "missed";
    let cls = "timeline-item";
    if (isCurrent) cls += " is-current";
    else if (isPast) cls += " is-past";
    if (isMissed) cls += " is-missed";
    const owner = getAnalystName(task.actualOwner || task.plannedOwner);
    return `<div class="${cls}">
      <span class="tl-time">${formatTime12(task.time)}</span>
      <span class="tl-task"><span class="task-tag tag-${task.type}">${task.name}</span></span>
      <span class="tl-owner">${owner || "⚠ UNASSIGNED"}${task.riskInterval?' <span style="color:var(--warn);font-size:9px">⚠ RISK</span>':''}${task.autoReassigned?' <span class="badge-reassigned">↺ REASSIGNED</span>':''}</span>
      <span class="tl-status status-${task.status}">${task.status.toUpperCase()}</span>
    </div>`;
  }).join("");

  const nextTask = future[0];
  const upBadge  = document.getElementById("upcoming-badge");
  if (nextTask && upBadge) upBadge.textContent = `NEXT: ${formatTime12(nextTask.time)}`;
}

// ============================================================
// CHART
// ============================================================

function renderChart() {
  const container = document.getElementById("chart-area");
  if (!container) return;
  const counts = {}, assigned = {};
  ANALYSTS.forEach(a => { counts[a.id] = 0; assigned[a.id] = 0; });
  state.taskLog.filter(t => t.status === "done").forEach(t => {
    if (t.actualOwner && counts[t.actualOwner] !== undefined) counts[t.actualOwner]++;
  });
  state.taskLog.forEach(t => {
    if (t.actualOwner && assigned[t.actualOwner] !== undefined) assigned[t.actualOwner]++;
  });
  const maxDone = Math.max(...Object.values(counts), 1);
  container.innerHTML = ANALYSTS.map(a => {
    const done  = counts[a.id];
    const total = assigned[a.id];
    const pct   = Math.round((done/maxDone)*100);
    const color = ANALYST_COLORS[a.id] || "#4a6080";
    return `<div class="chart-row">
      <span class="chart-label" style="color:${color}">${a.name}</span>
      <div class="chart-bar-track">
        <div class="chart-bar-fill" style="width:${pct}%;background:linear-gradient(90deg,${color},${color}88)">
          ${done > 0 ? `<span>${done}</span>` : ""}
        </div>
      </div>
      <span class="chart-count">${total}</span>
    </div>`;
  }).join("");
}

// ============================================================
// CURRENT TASKS PANEL
// ============================================================

function renderCurrentTasks() {
  const container = document.getElementById("current-tasks-list");
  if (!container) return;
  const nm = nowMinutes();
  const current = state.taskLog.filter(t => {
    const tm = timeToMinutes(t.time);
    return tm >= nm - 30 && tm <= nm + 30;
  });
  const badge = document.getElementById("current-interval-badge");
  if (badge) badge.textContent = minutesToTime(Math.floor(nm/30)*30);

  if (!current.length) {
    container.innerHTML = `<div style="color:var(--muted);font-family:var(--font-mono);font-size:11px;padding:12px">No tasks in current window</div>`;
    return;
  }
  container.innerHTML = current.map(task => {
    const idx        = state.taskLog.indexOf(task);
    const ownerName  = getAnalystName(task.actualOwner);
    const color      = ANALYST_COLORS[task.actualOwner] || "#4a6080";
    return `<div class="current-task-item" style="border-left-color:${color}">
      <div class="ct-task-name"><span class="task-tag tag-${task.type}">${task.name}</span></div>
      <div class="ct-owner">${formatTime12(task.time)} · ${ownerName || "Unassigned"}</div>
      <div class="ct-meta">
        <span class="status-pill ${task.status==='done'?'pill-active':task.status==='missed'?'':'pill-buffer'}"
          style="${task.status==='missed'?'background:rgba(255,59,59,0.2);color:var(--danger);border-color:var(--danger)':''}">
          ${task.status.toUpperCase()}
        </span>
        ${task.error?`<span class="status-pill" style="background:rgba(255,59,59,0.2);color:var(--danger);border:1px solid var(--danger)">ERROR</span>`:""}
      </div>
      <button class="btn-small" onclick="openTaskModal(${idx})">EDIT</button>
    </div>`;
  }).join("");
}

// ============================================================
// SCHEDULE TABLE
// ============================================================

function renderSchedule() {
  const tbody          = document.getElementById("schedule-tbody");
  if (!tbody) return;
  const analystFilter  = document.getElementById("schedule-analyst-filter").value;
  const taskFilter     = document.getElementById("schedule-task-filter").value;
  let tasks = [...state.taskLog];
  if (analystFilter !== "all") tasks = tasks.filter(t => t.plannedOwner === analystFilter || t.actualOwner === analystFilter);
  if (taskFilter !== "all")    tasks = tasks.filter(t => t.name === taskFilter || t.name.startsWith(taskFilter));
  const nm = nowMinutes();

  tbody.innerHTML = tasks.map(task => {
    const idx        = state.taskLog.indexOf(task);
    const tm         = timeToMinutes(task.time);
    const isCurrent  = tm >= nm - 30 && tm <= nm;
    const isMissed   = task.status === "missed" || (tm < nm - 30 && task.status === "pending" && !task.actualOwner);
    let rowCls = "";
    if (isMissed) rowCls = "row-missed";
    else if (task.status === "done") rowCls = "row-done";
    else if (isCurrent) rowCls = "row-current";

    const errBadge = task.errorType ? `<span class="error-type-badge err-${errorClass(task.errorType)}">${task.errorType}</span>` : "";
    // Analyst can only see their own tasks with EDIT; admin sees all
    const canEdit = isAdmin() || (task.actualOwner === CURRENT_USER.username);
    return `<tr class="${rowCls} ${task.riskInterval?'risk-row':''}">
      <td class="mono" style="color:var(--accent)">${formatTime12(task.time)}</td>
      <td><span class="task-tag tag-${task.type}">${task.name}</span>${task.autoReassigned?'<span class="badge-reassigned" style="margin-left:4px">↺</span>':''}</td>
      <td style="color:${ANALYST_COLORS[task.plannedOwner]||'var(--text-secondary)'}">${getAnalystName(task.plannedOwner)||"—"}</td>
      <td style="color:${ANALYST_COLORS[task.actualOwner]||'var(--text-secondary)'}"><strong>${getAnalystName(task.actualOwner)||"⚠ UNASSIGNED"}</strong></td>
      <td><span class="mono status-${task.status||'pending'}">${(task.status||"pending").toUpperCase()}</span></td>
      <td>${task.error?'<span style="color:var(--danger)">YES</span>':'<span style="color:var(--muted)">—</span>'}</td>
      <td>${errBadge}</td>
      <td style="color:var(--muted);font-size:11px">${task.notes||""}</td>
      <td>${canEdit ? `<button class="btn-small" onclick="openTaskModal(${idx})">EDIT</button>` : ""}</td>
    </tr>`;
  }).join("");
}

function populateScheduleFilters() {
  const sel = document.getElementById("schedule-analyst-filter");
  if (!sel) return;
  sel.innerHTML = `<option value="all">All Analysts</option>`;
  ANALYSTS.forEach(a => { sel.innerHTML += `<option value="${a.id}">${a.name}</option>`; });
}

// ============================================================
// PTO PANEL
// ============================================================

function renderPTOPanel() {
  const grid = document.getElementById("pto-grid");
  if (!grid) return;
  grid.innerHTML = ANALYSTS.map(cfg => {
    const isOnPTO = state.ptoStatus[cfg.id] === "pto";
    const backup  = isOnPTO ? getBackup(cfg.id, "12:00") : null;
    return `<div class="pto-card ${isOnPTO?'pto-on':''}">
      <div class="pto-agent-name" style="color:${ANALYST_COLORS[cfg.id]}">${cfg.name}</div>
      <div class="pto-agent-shift">${cfg.shiftStart} – ${cfg.shiftEnd}</div>
      <div class="pto-toggle">
        <button class="pto-btn ${!isOnPTO?'pto-present-active':''}" onclick="setPTO('${cfg.id}','present')">PRESENT</button>
        <button class="pto-btn ${isOnPTO?'pto-pto-active':''}" onclick="setPTO('${cfg.id}','pto')">PTO</button>
      </div>
      <div class="pto-backup-info">
        ${isOnPTO ? `Primary backup: <strong>${backup ? getAnalystName(backup) : 'None available'}</strong>` : ""}
      </div>
    </div>`;
  }).join("");
  renderPTOImpact();
}

function setPTO(id, status) {
  if (!isAdmin()) return;
  state.ptoStatus[id] = status;
  recalculateAssignments();
  renderPTOPanel();
}

function renderPTOImpact() {
  const container = document.getElementById("pto-impact-content");
  if (!container) return;
  const ptoList = ANALYSTS.filter(a => state.ptoStatus[a.id] === "pto");
  if (!ptoList.length) {
    container.innerHTML = `<div style="color:var(--muted);font-family:var(--font-mono);font-size:11px">No analysts on PTO. Full team active.</div>`;
    return;
  }
  let html = "";
  ptoList.forEach(analyst => {
    const backup     = getBackup(analyst.id, "12:00");
    const lateBackup = getBackup(analyst.id, "19:00", null, [backup].filter(Boolean));
    html += `<div class="impact-row">
      <span class="impact-icon">🔴</span>
      <div class="impact-text">
        <strong style="color:${ANALYST_COLORS[analyst.id]}">${analyst.name}</strong> on PTO →
        Primary backup: <strong>${backup ? getAnalystName(backup) : "NONE"}</strong>
        ${lateBackup ? ` | Late: <strong>${getAnalystName(lateBackup)}</strong>` : ""}
      </div>
      <span class="impact-level ${backup?'impact-med':'impact-high'}">${backup?"COVERED":"RISK"}</span>
    </div>`;
  });
  const activeCount = ANALYSTS.filter(a => state.ptoStatus[a.id] === "present").length;
  if (activeCount < 2) {
    html += `<div class="impact-row"><span class="impact-icon">⚠</span>
      <span class="impact-text">CRITICAL: Only ${activeCount} analyst(s) active. SLA risk is HIGH.</span>
      <span class="impact-level impact-high">CRITICAL</span></div>`;
  }
  container.innerHTML = html;
}

// ============================================================
// BREAKS PANEL
// ============================================================

function renderBreaksPanel() {
  const nm        = nowMinutes();
  const time24    = minutesToTime(nm);
  const coverageDiv = document.getElementById("coverage-status");
  if (!coverageDiv) return;

  const onBreak = [], onLunch = [], active = [], off = [];
  ANALYSTS.forEach(a => {
    const s = getAnalystStatusAt(a.id, time24);
    if (s === "lunch") onLunch.push(a.name);
    else if (s === "break") onBreak.push(a.name);
    else if (s === "active") active.push(a.name);
    else off.push(a.name);
  });

  coverageDiv.innerHTML = `
    <div class="coverage-row"><span style="color:var(--success)">● ACTIVE</span><span>${active.join(", ")||"None"}</span></div>
    <div class="coverage-row"><span style="color:var(--accent3)">● LUNCH</span><span>${onLunch.join(", ")||"None"}</span></div>
    <div class="coverage-row"><span style="color:var(--accent4)">● BREAK</span><span>${onBreak.join(", ")||"None"}</span></div>
    <div class="coverage-row"><span style="color:var(--muted)">● OFF</span><span>${off.join(", ")||"None"}</span></div>`;

  const grid = document.getElementById("break-schedule-grid");
  if (!grid) return;
  grid.innerHTML = ANALYSTS.map(analyst => {
    const breaks      = getBreakForAnalyst(analyst.id);
    if (!breaks) return "";
    const isOverridden = !!state.breakOverrides[analyst.id];
    const lunchBackup  = getBackup(analyst.id, breaks.lunch.start);
    const breakBackup  = getBackup(analyst.id, breaks.brk.start);
    return `<div class="break-agent-col">
      <div class="break-agent-header" style="color:${ANALYST_COLORS[analyst.id]}">
        ${analyst.name}${isOverridden ? ' <span style="font-size:9px;color:var(--warn);font-family:var(--font-mono)">OVERRIDDEN</span>' : ''}
      </div>
      <div class="break-slot">
        <div class="break-type break-lunch-type">LUNCH (1H)</div>
        <div class="break-time">${formatTime12(breaks.lunch.start)} – ${formatTime12(breaks.lunch.end)}</div>
        <div class="break-backup">Backup: ${lunchBackup ? getAnalystName(lunchBackup) : "None"}</div>
        <button class="btn-small admin-only" onclick="openBreakEditModal('${analyst.id}','lunch')" style="margin-top:4px">✏ EDIT</button>
      </div>
      <div class="break-slot">
        <div class="break-type break-break-type">BREAK (30M)</div>
        <div class="break-time">${formatTime12(breaks.brk.start)} – ${formatTime12(breaks.brk.end)}</div>
        <div class="break-backup">Backup: ${breakBackup ? getAnalystName(breakBackup) : "None"}</div>
        <button class="btn-small admin-only" onclick="openBreakEditModal('${analyst.id}','brk')" style="margin-top:4px">✏ EDIT</button>
      </div>
    </div>`;
  }).join("");
}

// ============================================================
// ERROR LOG
// ============================================================

function renderErrorLog() {
  renderErrorCommandCenter();

  const tbody = document.getElementById("error-tbody");
  if (!tbody) return;
  tbody.innerHTML = state.errorLog.map((err, i) => {
    const sevClass = { low:"sev-low", medium:"sev-medium", high:"sev-high", critical:"sev-critical" }[err.severity||"medium"] || "sev-medium";
    const canResolve = isAdmin() || err.analyst === CURRENT_USER.username;
    const statusText = err.status === "escalated"
      ? `<span class="mono" style="color:var(--warn)">ESCALATED</span>`
      : `<span class="mono ${err.resolved?'text-success':'text-danger'}">${err.resolved?"RESOLVED":"OPEN"}</span>`;
    return `<tr>
      <td class="mono">${err.time}</td>
      <td style="color:${ANALYST_COLORS[err.analyst]||'var(--text-secondary)'}">${getAnalystName(err.analyst)}</td>
      <td>${err.task}</td>
      <td><span class="error-type-badge err-${errorClass(err.type)}">${err.type}</span></td>
      <td><span class="${sevClass} error-type-badge">${(err.severity||"medium").toUpperCase()}</span></td>
      <td style="color:var(--text-secondary)">${err.desc||"—"}</td>
      <td>${statusText}</td>
      <td>
        ${(!err.resolved && canResolve) ? `<button class="btn-resolve" onclick="resolveError(${i})">RESOLVE</button>` : ""}
        ${isAdmin() ? `<button class="btn-small" style="background:rgba(255,59,59,0.1);color:var(--danger);border-color:var(--danger);margin-left:4px" onclick="deleteErrorByIdx(${i})">🗑</button>` : ""}
      </td>
    </tr>`;
  }).join("") || `<tr><td colspan="8" style="color:var(--muted);text-align:center;padding:20px">No errors logged</td></tr>`;

  const emailTbody = document.getElementById("email-error-tbody");
  if (emailTbody) {
    emailTbody.innerHTML = state.emailErrorLog.map((err, i) => `
      <tr>
        <td class="mono">${err.time}</td>
        <td style="color:${ANALYST_COLORS[err.analyst]||'var(--text-secondary)'}">${getAnalystName(err.analyst)}</td>
        <td><span class="error-type-badge err-${errorClass(err.type)}">${err.type}</span></td>
        <td style="color:var(--text-secondary)">${err.desc||"—"}</td>
        <td>${isAdmin() ? `<button class="btn-resolve" onclick="resolveEmailError(${i})">REMOVE</button>` : ""}</td>
      </tr>`).join("") || `<tr><td colspan="5" style="color:var(--muted);text-align:center;padding:20px">No email errors</td></tr>`;
  }

  const byType = {};
  [...state.errorLog, ...state.emailErrorLog].forEach(e => { byType[e.type] = (byType[e.type]||0)+1; });
  const summary = document.getElementById("error-summary");
  if (summary) {
    summary.innerHTML = Object.entries(byType).map(([type, count]) =>
      `<div class="error-stat"><span class="error-stat-count">${count}</span><span class="error-type-badge err-${errorClass(type)}">${type}</span></div>`
    ).join("") || "";
  }
}

function errorClass(type) {
  return { Delay:"delay", Missed:"missed", "SLA Risk":"sla", "AHT Spike":"aht", "Wrong Data":"wrong", "Skilling Issue":"skilling" }[type] || "delay";
}

function resolveError(i) {
  if (!state.errorLog[i]) return;
  state.errorLog[i].resolved   = true;
  state.errorLog[i].resolvedBy = CURRENT_USER.displayName;
  state.errorLog[i].resolvedAt = new Date().toISOString();
  state.errorLog[i].status     = "resolved";
  saveState();
  renderErrorLog();
  renderKPIs();
}

function resolveEmailError(i) {
  if (!state.emailErrorLog[i]) return;
  state.emailErrorLog.splice(i, 1);
  saveState();
  renderErrorLog();
  renderKPIs();
}

// ============================================================
// ARCHIVE — REVERSIBLE
// ============================================================

function archiveToday() {
  if (!isAdmin()) return;
  const dateStr = toDateStr(state.now);
  const dayStr  = dayName(state.now);
  // Save backup before overwriting
  state.lastArchiveBackup = [...state.archiveData];
  state.archiveData = state.taskLog.map(task => ({
    date:         dateStr,
    day:          dayStr,
    shiftBucket:  timeToMinutes(task.time) < timeToMinutes("12:00") ? "Morning"
                : timeToMinutes(task.time) < timeToMinutes("17:00") ? "Mid" : "Late",
    interval:     task.time,
    task:         task.name,
    plannedOwner: getAnalystName(task.plannedOwner),
    actualOwner:  getAnalystName(task.actualOwner),
    status:       task.status,
    error:        task.error ? "Yes" : "No",
    errorType:    task.errorType || "—",
  }));
  saveState();
  renderArchive();
  const badge = document.getElementById("archive-badge");
  if (badge) badge.textContent = `${state.archiveData.length} RECORDS`;
  alert("✓ Today's data archived successfully! Use 'UNDO ARCHIVE' to revert.");
}

function undoArchive() {
  if (!isAdmin()) return;
  if (!state.lastArchiveBackup || state.lastArchiveBackup.length === 0) {
    alert("No archive backup available to restore.");
    return;
  }
  if (!confirm("Restore previous archive? This will replace the current archive data.")) return;
  state.archiveData      = [...state.lastArchiveBackup];
  state.lastArchiveBackup = [];
  saveState();
  renderArchive();
  alert("✓ Archive restored to previous state.");
}

function renderArchive() {
  const tbody = document.getElementById("archive-tbody");
  if (!tbody) return;
  const filterDate = document.getElementById("archive-filter-date")?.value;
  let data = [...state.archiveData];
  if (filterDate) data = data.filter(r => r.date === filterDate);
  tbody.innerHTML = data.map(row => `
    <tr>
      <td>${row.date}</td><td>${row.day}</td>
      <td><span class="task-tag" style="font-size:9px">${row.shiftBucket}</span></td>
      <td style="color:var(--accent)">${formatTime12(row.interval)}</td>
      <td>${row.task}</td><td>${row.plannedOwner}</td><td>${row.actualOwner}</td>
      <td><span class="mono status-${row.status}">${row.status.toUpperCase()}</span></td>
      <td>${row.error}</td><td>${row.errorType}</td>
    </tr>`).join("") || `<tr><td colspan="10" style="color:var(--muted);text-align:center;padding:20px">No archived data. Click "Archive Today" to save.</td></tr>`;

  const badge = document.getElementById("archive-badge");
  if (badge) badge.textContent = `${data.length} RECORDS`;
}

function exportArchive() {
  const headers = ["Date","Day","Shift Bucket","Interval","Task","Planned Owner","Actual Owner","Status","Error","Error Type"];
  const rows    = state.archiveData.map(r =>
    [r.date,r.day,r.shiftBucket,r.interval,r.task,r.plannedOwner,r.actualOwner,r.status,r.error,r.errorType]
      .map(v => `"${v}"`).join(",")
  );
  const csv  = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = `wfm-archive-${toDateStr(state.now)}.csv`; a.click();
}

// ============================================================
// MODALS
// ============================================================

function populateModalAnalysts(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = `<option value="">Unassigned</option>${ANALYSTS.map(a =>
    `<option value="${a.id}">${a.name}${state.ptoStatus[a.id]==='pto'?' (PTO)':''}</option>`
  ).join("")}`;
}

function openAddErrorModal() {
  if (!isAdmin()) return;
  populateModalAnalysts("err-analyst");
  document.getElementById("modal-overlay").classList.remove("hidden");
  document.getElementById("modal-error").classList.remove("hidden");
}

function openAddEmailErrorModal() {
  if (!isAdmin()) return;
  populateModalAnalysts("email-err-analyst");
  document.getElementById("modal-overlay").classList.remove("hidden");
  document.getElementById("modal-email-error").classList.remove("hidden");
}

function openTaskModal(idx) {
  state.editingTaskIdx = idx;
  const task = state.taskLog[idx];
  document.getElementById("modal-task-title").textContent = `UPDATE: ${task.name} @ ${formatTime12(task.time)}`;

  // Role-based field visibility
  const adminFields = document.getElementById("modal-admin-fields");
  const adminErrorFields = document.getElementById("modal-admin-error-fields");
  if (adminFields)      adminFields.style.display      = isAdmin() ? "" : "none";
  if (adminErrorFields) adminErrorFields.style.display = isAdmin() ? "" : "none";

  // Status options: analyst only gets done
  const statusSel = document.getElementById("modal-status");
  if (isAnalyst()) {
    statusSel.innerHTML = `<option value="done">Done</option>`;
  } else {
    statusSel.innerHTML = `
      <option value="pending">Pending</option><option value="in-progress">In Progress</option>
      <option value="done">Done</option><option value="missed">Missed</option><option value="delayed">Delayed</option>`;
  }

  if (isAdmin()) {
    populateModalAnalysts("modal-actual-owner");
    document.getElementById("modal-actual-owner").value = task.actualOwner || "";
    document.getElementById("modal-task-type").value    = task.type || "";
    document.getElementById("modal-has-error").value    = task.error ? "yes" : "no";
    document.getElementById("modal-error-type").value   = task.errorType || "Delay";
    document.getElementById("modal-notes").value        = task.notes || "";
    toggleErrorTypeField();

    // Show delete button for admin
    const delBtn = document.querySelector(".btn-danger.admin-only");
    if (delBtn) delBtn.style.display = "";
  }

  statusSel.value = isAnalyst() ? "done" : (task.status || "pending");

  document.getElementById("modal-overlay").classList.remove("hidden");
  document.getElementById("modal-task-status").classList.remove("hidden");
}

function toggleErrorTypeField() {
  const has = document.getElementById("modal-has-error")?.value;
  document.getElementById("modal-error-type-wrap")?.classList.toggle("hidden", has !== "yes");
}

document.addEventListener("change", e => {
  if (e.target.id === "modal-has-error") toggleErrorTypeField();
});

function saveTaskStatus() {
  const idx = state.editingTaskIdx;
  if (idx === null || idx === undefined) return;
  const task = state.taskLog[idx];

  if (isAdmin()) {
    const newOwner = document.getElementById("modal-actual-owner").value;
    if (newOwner) { task.actualOwner = newOwner; task.manualOwner = true; }
    const newType = document.getElementById("modal-task-type").value;
    if (newType) updateTaskType(idx, newType);
    task.error     = document.getElementById("modal-has-error").value === "yes";
    task.errorType = task.error ? document.getElementById("modal-error-type").value : "";
    task.notes     = document.getElementById("modal-notes").value.trim();
  }

  task.status = document.getElementById("modal-status").value;
  closeAllModals();
  saveState();
  refreshAll();
}

function submitError() {
  if (!isAdmin()) return;
  const now = new Date();
  const h   = String(now.getHours()).padStart(2,"0");
  const m   = String(now.getMinutes()).padStart(2,"0");
  state.errorLog.push({
    id:          genId(),
    date:        toDateStr(now),
    time:        `${h}:${m}`,
    intervalTime: getCurrentIntervalTime(now),
    analyst:     document.getElementById("err-analyst").value,
    task:        document.getElementById("err-task").value,
    type:        document.getElementById("err-type").value,
    severity:    document.getElementById("err-severity").value,
    desc:        document.getElementById("err-desc").value.trim(),
    status:      "open",
    resolved:    false,
    createdBy:   CURRENT_USER.displayName,
    createdAt:   now.toISOString(),
  });
  closeAllModals();
  saveState();
  renderErrorLog();
  renderKPIs();
}

function submitEmailError() {
  if (!isAdmin()) return;
  const now = new Date();
  const h   = String(now.getHours()).padStart(2,"0");
  const m   = String(now.getMinutes()).padStart(2,"0");
  state.emailErrorLog.push({
    id:       genId(),
    date:     toDateStr(now),
    time:     `${h}:${m}`,
    analyst:  document.getElementById("email-err-analyst").value,
    type:     document.getElementById("email-err-type").value,
    desc:     document.getElementById("email-err-desc").value.trim(),
    createdBy: CURRENT_USER.displayName,
  });
  closeAllModals();
  saveState();
  renderErrorLog();
  renderKPIs();
}

function closeAllModals() {
  document.getElementById("modal-overlay").classList.add("hidden");
  document.querySelectorAll(".modal").forEach(m => m.classList.add("hidden"));
  state.editingTaskIdx = null;
}

// ============================================================
// TAB NAVIGATION
// ============================================================

function showTab(tabName) {
  // Analysts can't access admin tabs
  const adminTabs = ["pto","breaks","archive"];
  if (isAnalyst() && adminTabs.includes(tabName)) return;

  document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  const tabEl = document.getElementById(`tab-${tabName}`);
  if (tabEl) tabEl.classList.add("active");
  if (window.event?.target) window.event.target.classList.add("active");
  state.currentTab = tabName;
  if (tabName === "schedule") renderSchedule();
  if (tabName === "pto")      renderPTOPanel();
  if (tabName === "breaks")   renderBreaksPanel();
  if (tabName === "errors")   renderErrorLog();
  if (tabName === "archive")  renderArchive();
}

// ============================================================
// REFRESH ALL
// ============================================================

function refreshAll() {
  updateClock();
  updateWeekendBanner();
  getOrBuildTaskLog();
  autoReassignTasks();
  renderKPIs();
  renderAgentCards();
  renderTimeline();
  renderChart();
  renderCurrentTasks();
  renderAIInsights();
  renderAnalytics();
  if (state.currentTab === "schedule") renderSchedule();
  if (state.currentTab === "pto")      renderPTOPanel();
  if (state.currentTab === "breaks")   renderBreaksPanel();
  if (state.currentTab === "errors")   renderErrorLog();
  if (state.currentTab === "archive")  renderArchive();
}

// ============================================================
// ANALYST MANAGEMENT UI (admin only)
// ============================================================

function openAnalystManager() {
  if (!isAdmin()) return;
  renderAnalystMgrBody();
  document.getElementById("modal-overlay").classList.remove("hidden");
  document.getElementById("modal-analyst-mgr").classList.remove("hidden");
}

function renderAnalystMgrBody() {
  const body = document.getElementById("analyst-mgr-body");
  if (!body) return;
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:110px 80px 80px 80px 70px 1fr 30px;gap:6px;padding:10px 16px 6px;border-bottom:1px solid var(--border)">
      <span style="font-family:var(--font-mono);font-size:9px;color:var(--muted);letter-spacing:.1em">NAME</span>
      <span style="font-family:var(--font-mono);font-size:9px;color:var(--muted);letter-spacing:.1em">SHIFT START</span>
      <span style="font-family:var(--font-mono);font-size:9px;color:var(--muted);letter-spacing:.1em">SHIFT END</span>
      <span style="font-family:var(--font-mono);font-size:9px;color:var(--muted);letter-spacing:.1em">ROLE</span>
      <span style="font-family:var(--font-mono);font-size:9px;color:var(--muted);letter-spacing:.1em">COLOR</span>
      <span></span><span></span>
    </div>` +
    ANALYSTS.map((a, i) => `
    <div class="analyst-mgr-row">
      <input class="ctrl-input" value="${a.name}" onchange="ANALYSTS[${i}].name=this.value" style="width:100%">
      <input class="ctrl-input" type="time" value="${a.shiftStart}" onchange="ANALYSTS[${i}].shiftStart=this.value" style="width:100%">
      <input class="ctrl-input" type="time" value="${a.shiftEnd}"   onchange="ANALYSTS[${i}].shiftEnd=this.value"   style="width:100%">
      <select class="ctrl-select" onchange="ANALYSTS[${i}].role=this.value" style="width:100%">
        <option ${a.role==='RTA'?'selected':''}>RTA</option>
        <option ${a.role==='Senior'?'selected':''}>Senior</option>
        <option ${a.role==='Lead'?'selected':''}>Lead</option>
      </select>
      <input type="color" value="${ANALYST_COLORS[a.id]||COLOR_PALETTE[i%COLOR_PALETTE.length]}"
        onchange="ANALYST_COLORS['${a.id}']=this.value"
        style="width:36px;height:32px;border:none;background:none;cursor:pointer;border-radius:4px">
      <span></span>
      <button onclick="removeAnalyst(${i})" style="background:rgba(255,59,59,0.1);color:var(--danger);border:1px solid var(--danger);border-radius:4px;padding:4px 8px;cursor:pointer;font-size:11px">🗑</button>
    </div>`).join("");
}

function addNewAnalyst() {
  const id = "analyst_" + genId();
  ANALYSTS.push({
    id, name: "New Analyst",
    shiftStart: "09:00", shiftEnd: "18:00",
    role: "RTA", isPTO: false
  });
  ANALYST_COLORS[id] = COLOR_PALETTE[ANALYSTS.length % COLOR_PALETTE.length];
  state.ptoStatus[id] = "present";
  renderAnalystMgrBody();
}

function removeAnalyst(i) {
  if (!confirm(`Remove ${ANALYSTS[i].name}?`)) return;
  ANALYSTS.splice(i, 1);
  renderAnalystMgrBody();
}

function closeAnalystManager() {
  closeAllModals();
  BREAK_DEFINITIONS = generateDynamicBreaks(ANALYSTS);
  recalculateAssignments();
  populateScheduleFilters();
}

// ============================================================
// BOOT — app entry point after login
// ============================================================

function bootApp() {
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app-shell").classList.remove("hidden");
  applyRoleUI();

  // Init PTO state for all analysts
  ANALYSTS.forEach(a => { if (!state.ptoStatus[a.id]) state.ptoStatus[a.id] = "present"; });
  BREAK_DEFINITIONS = generateDynamicBreaks(ANALYSTS);

  const dateInput = document.getElementById("schedule-date");
  if (dateInput) dateInput.value = toDateStr(state.now);
  state.activeDateStr = toDateStr(state.now);

  loadState();
  populateScheduleFilters();
  refreshAll();

  // 1-second clock tick
  setInterval(() => {
    updateClock();
    if (state.currentTab === "dashboard") {
      renderKPIs();
      renderAgentCards();
      renderTimeline();
      renderChart();
      renderCurrentTasks();
    }
  }, 1000);

  // 5-second AI engine
  setInterval(() => {
    autoReassignTasks();
    renderAIInsights();
    renderAnalytics();
    if (state.currentTab === "errors") renderErrorCommandCenter();
  }, 5000);

  // 30-second full refresh + autosave
  setInterval(() => {
    if (state.currentTab === "dashboard") {
      renderKPIs();
      renderAgentCards();
      renderTimeline();
      renderChart();
      renderCurrentTasks();
      renderAIInsights();
      renderAnalytics();
    }
    saveState();
  }, 30000);

  console.log(`✅ WFM Command Center booted. User: ${CURRENT_USER.displayName} [${CURRENT_USER.role}]`);
  console.log(`   Tasks: ${state.taskLog.length} | Analysts: ${ANALYSTS.length}`);
}

// ============================================================
// INIT — check session on page load
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  state.now = new Date();
  localStorage.removeItem("wfm_user");
  if (loadUserSession()) {
    bootApp();
  } else {
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("app-shell").classList.add("hidden");
    setTimeout(() => document.getElementById("username")?.focus(), 100);
  }
});
