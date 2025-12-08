// Adaptive / Feedback scheduler
import { pushSlot, renderTable, renderTableWithQuantum, logAppend, getScheduleStats, renderStats, exportTasksAsJSON, downloadJSON, presets } from './common.js';

// Wait for DOM to be ready
await new Promise(resolve => {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', resolve);
  } else {
    resolve();
  }
});

// Get all DOM elements
const form = document.getElementById('taskForm');
const tbody = document.querySelector('#taskTable tbody');
const timeline = document.getElementById('timeline');
const logOut = document.getElementById('logOutput');
const statsContainer = document.getElementById('statsContainer');
const presetSelect = document.getElementById('presetSelect');
const speedControl = document.getElementById('speedControl');
const speedLabel = document.getElementById('speedLabel');
const execDelay = document.getElementById('execDelay');
const execDelayLabel = document.getElementById('execDelayLabel');

let tasks = [];
let now = 0;
let sim = null;
let paused = false;
const BASE_QUANTUM = 20;
let currentExecDelay = 50;
let currentTaskId = null; // Track which task is running

// sample tasks
tasks = [
  { id:0, name:'X', arrival:0, exec:120, remaining:120, deadline:400, finished:false, missed:false, priorityBoost:0, quantum:null, color:'color0' },
  { id:1, name:'Y', arrival:50, exec:90, remaining:90, deadline:300, finished:false, missed:false, priorityBoost:0, quantum:null, color:'color1' }
];

// Initialize UI
function updateTaskTable() {
  renderTable(tbody, tasks, now, (id) => {
    const taskName = tasks.find(t => t.id === id)?.name || '?';
    tasks = tasks.filter(t => t.id !== id);
    logAppend(logOut, `🗑 Task "${taskName}" removed`);
    updateTaskTable();
  }, currentTaskId);
}

updateTaskTable();
logAppend(logOut, '🟢 Adaptive Scheduler Ready. Add tasks or click Start to begin.');

function systemLoad(){
  const active = tasks.filter(t=>!t.finished && t.arrival <= now).length;
  return Math.min(1, active / 6);
}

function priorityScore(t){
  // lower score = higher priority
  const laxity = (t.deadline - now - t.remaining);
  let score = laxity;
  if (t.missed) score -= 200;
  score -= (t.priorityBoost || 0);
  return score;
}

function updateStats() {
  const stats = getScheduleStats(tasks, now);
  renderStats(statsContainer, stats);
}

function step(){
  if (paused) return;

  // Handle I/O completions first
  tasks.forEach(t => {
    if (t.suspended && t.suspendTime > 0) {
      t.suspendTime -= BASE_QUANTUM;
      if (t.suspendTime <= 0) {
        t.suspended = false;
        t.suspendTime = 0;
        logAppend(logOut, `🔵 ${t.name} I/O completed, back to ready queue`);
        // Task remains in ready queue - will be picked by algorithm in next step
      }
    }
  });

  const ready = tasks.filter(t=>!t.finished && !t.suspended && t.arrival <= now);
  if (ready.length === 0){
    currentTaskId = null;
    pushSlot(timeline,'idle','idle');
    now += BASE_QUANTUM;
    updateNextTask();
    updateTaskTable();
    return;
  }
  
  const load = systemLoad();
  const dynamicQuantum = Math.max(6, Math.round(BASE_QUANTUM * (1 - load * 0.7)));
  ready.sort((a,b)=> priorityScore(a) - priorityScore(b));
  const cur = ready[0];
  currentTaskId = cur.id; // Set current task
  const q = Math.min(dynamicQuantum, cur.remaining);
  cur.remaining -= q;
  pushSlot(timeline, cur.name, cur.color);
  logAppend(logOut, `t=${now} : running ${cur.name} for ${q}ms (laxity: ${priorityScore(cur)})`);
  
  let isIO = false;
  
  // Check for I/O operation - only if task still has more exec after this quantum
  if (cur.remaining <= 0 && (cur.ioOps || 0) > 0 && (cur.ioCount || 0) < (cur.ioOps || 0)) {
    // Enter I/O suspend state
    cur.ioCount = (cur.ioCount || 0) + 1;
    cur.suspended = true;
    cur.suspendTime = cur.ioTime || 0;
    pushSlot(timeline, cur.name + '-IO', 'io');
    logAppend(logOut, `⏸️  ${cur.name} performing I/O operation ${cur.ioCount}/${cur.ioOps} for ${cur.ioTime}ms`);
    // Reset remaining for next execution phase after I/O completes
    cur.remaining = cur.exec;
    isIO = true;
  } else if (cur.remaining <= 0){
    cur.finished = true;
    if (now + q > cur.deadline) {
      cur.missed = true;
      cur.priorityBoost = (cur.priorityBoost || 0) + 100;
      logAppend(logOut, `⚠️  ${cur.name} MISSED deadline ${cur.deadline} — boosting priority`);
    } else {
      logAppend(logOut, `--> ${cur.name} finished at t=${now+q}`);
    }
  }
  
  // small aging for waiting tasks
  ready.forEach(t=>{ if (!t.finished && t !== cur) t.priorityBoost = Math.max(0, (t.priorityBoost || 0) - 1); });
  now += q;

  // If a task went into I/O, allow another task to run in the same step
  if (isIO) {
    const readyNext = tasks.filter(t=>!t.finished && !t.suspended && t.arrival <= now);
    if (readyNext.length > 0) {
      const load2 = systemLoad();
      const dynamicQuantum2 = Math.max(6, Math.round(BASE_QUANTUM * (1 - load2 * 0.7)));
      readyNext.sort((a,b)=> priorityScore(a) - priorityScore(b));
      const nextTask = readyNext[0];
      currentTaskId = nextTask.id;
      const q2 = Math.min(dynamicQuantum2, nextTask.remaining);
      nextTask.remaining -= q2;
      pushSlot(timeline, nextTask.name, nextTask.color);
      logAppend(logOut, `t=${now} : running ${nextTask.name} for ${q2}ms (laxity: ${priorityScore(nextTask)})`);
      
      if (nextTask.remaining <= 0 && (nextTask.ioOps || 0) > 0 && (nextTask.ioCount || 0) < (nextTask.ioOps || 0)) {
        nextTask.ioCount = (nextTask.ioCount || 0) + 1;
        nextTask.suspended = true;
        nextTask.suspendTime = nextTask.ioTime || 0;
        pushSlot(timeline, nextTask.name + '-IO', 'io');
        logAppend(logOut, `⏸️  ${nextTask.name} performing I/O operation ${nextTask.ioCount}/${nextTask.ioOps} for ${nextTask.ioTime}ms`);
        nextTask.remaining = nextTask.exec;
      } else if (nextTask.remaining <= 0){
        nextTask.finished = true;
        if (now + q2 > nextTask.deadline) {
          nextTask.missed = true;
          nextTask.priorityBoost = (nextTask.priorityBoost || 0) + 100;
          logAppend(logOut, `⚠️  ${nextTask.name} MISSED deadline ${nextTask.deadline} — boosting priority`);
        } else {
          logAppend(logOut, `--> ${nextTask.name} finished at t=${now+q2}`);
        }
      }
      
      // small aging for waiting tasks
      readyNext.forEach(t=>{ if (!t.finished && t !== nextTask) t.priorityBoost = Math.max(0, (t.priorityBoost || 0) - 1); });
      now += q2;
    }
  }

  // Update display (with currentTaskId still set)
  updateTaskTable();
  updateStats();
  updateNextTask();
  currentTaskId = null; // Clear current task after table update
}

function updateNextTask() {
  const ready = tasks.filter(t=>!t.finished && t.arrival <= now);
  const nextTaskInfo = document.getElementById('nextTaskInfo');
  const dynamicQuantumInfo = document.getElementById('dynamicQuantumInfo');
  
  if (ready.length === 0) {
    nextTaskInfo.textContent = '🟡 idle - कोई task ready नहीं';
    dynamicQuantumInfo.textContent = '-';
    return;
  }
  
  const load = systemLoad();
  const dynamicQuantum = Math.max(6, Math.round(BASE_QUANTUM * (1 - load * 0.7)));
  const loadPercent = Math.round(load * 100);
  
  // Update dynamic quantum display with current load
  dynamicQuantumInfo.innerHTML = `${dynamicQuantum}ms <span style="font-size:0.9em;color:var(--muted)">(load: ${loadPercent}%)</span>`;
  
  // Sort by priority score (Adaptive algorithm)
  ready.sort((a,b)=> priorityScore(a) - priorityScore(b));
  const next = ready[0];
  const laxity = next.deadline - now - next.remaining;
  nextTaskInfo.innerHTML = `🟢 ${next.name} (laxity: ${laxity}ms, boost: ${next.priorityBoost || 0}, quantum: ${dynamicQuantum}ms)`;
}

// Task form submission
form.addEventListener('submit', (e)=>{
  e.preventDefault();
  const data = new FormData(form);
  const ioOps = Number(data.get('ioOps') || 0);
  const ioTime = Number(data.get('ioTime') || 0);
  const t = {
    id: Date.now()%100000,
    name: data.get('name') || `T${Date.now()%1000}`,
    arrival: Number(data.get('arrival') || 0),
    exec: Number(data.get('exec') || 50),
    remaining: Number(data.get('exec') || 50),
    deadline: Number(data.get('deadline') || 300),
    ioOps: ioOps,
    ioTime: ioTime,
    ioCount: 0,
    suspended: false,
    suspendTime: 0,
    finished: false,
    missed: false,
    priorityBoost: 0,
    color: 'color' + (Math.floor(Math.random()*6))
  };
  tasks.push(t);
  updateTaskTable();
  const ioInfo = ioOps > 0 ? ` + ${ioOps} I/O ops (${ioTime}ms each)` : '';
  const msg = `✓ Task "${t.name}" added (arrival=${t.arrival}, exec=${t.exec}, deadline=${t.deadline}${ioInfo})`;
  logAppend(logOut, msg);

  form.reset();
});

// Start simulation
document.getElementById('runEDF').addEventListener('click', ()=>{
  if (sim) return;
  paused = false;
  document.getElementById('pauseEDF').textContent = '⏸ Pause';
  logAppend(logOut, '▶ Simulation started...');
  sim = setInterval(()=>{
    const speed = Number(speedControl.value) || 1;
    for (let i = 0; i < speed; i++) {
      step();
    }
  }, Number(execDelay.value) || 50);
});

// Pause/Resume
document.getElementById('pauseEDF').addEventListener('click', ()=>{
  if (!sim) return;
  paused = !paused;
  const btn = document.getElementById('pauseEDF');
  btn.textContent = paused ? '▶ Resume' : '⏸ Pause';
  logAppend(logOut, paused ? '⏸ Simulation paused' : '▶ Simulation resumed');
});

// Reset
document.getElementById('resetEDF').addEventListener('click', ()=>{
  clearInterval(sim); 
  sim = null;
  paused = false;
  tasks.forEach(t => { 
    t.remaining = t.exec; 
    t.finished = false; 
    t.missed = false; 
    t.priorityBoost = 0;
    t.ioCount = 0;
    t.suspended = false;
    t.suspendTime = 0;
  });
  timeline.innerHTML = ''; 
  logOut.textContent = '';
  now = 0;
  currentTaskId = null;
  renderTable(tbody, tasks, now);
  updateStats();
  document.getElementById('pauseEDF').textContent = '⏸ Pause';
  logAppend(logOut, '🔄 Simulation reset. Click Start to begin.');
});

// Export
document.getElementById('exportBtn').addEventListener('click', () => {
  const json = exportTasksAsJSON(tasks);
  downloadJSON(json, 'adaptive_tasks.json');
  logAppend(logOut, '✓ Tasks exported to adaptive_tasks.json');
});

// Preset loader
presetSelect.addEventListener('change', (e) => {
  if (e.target.value && presets[e.target.value]) {
    tasks = presets[e.target.value].map((t, i) => ({
      ...t, 
      id: i, 
      missed: false,
      remaining: t.exec,
      finished: false,
      priorityBoost: 0,
      quantum: t.quantum || null
    }));
    now = 0;
    timeline.innerHTML = '';
    logOut.textContent = '';
    updateTaskTable();
    logAppend(logOut, `📦 Loaded ${e.target.value} preset`);
    e.target.value = '';
  }
});

// Speed control
speedControl.addEventListener('input', (e) => {
  const speed = Number(e.target.value);
  speedLabel.textContent = `Speed: ${speed}x`;
});

// Animation speed control
animSpeed.addEventListener('input', (e) => {
  currentAnimSpeed = Number(e.target.value);
  animLabel.textContent = `Animation: ${currentAnimSpeed.toFixed(1)}x`;
});

// Animation speed control
animSpeed.addEventListener('input', (e) => {
  currentAnimSpeed = Number(e.target.value);
  animLabel.textContent = `Animation: ${currentAnimSpeed.toFixed(1)}x`;
});

// Execution delay control
execDelay.addEventListener('input', (e) => {
  currentExecDelay = Number(e.target.value);
  execDelayLabel.textContent = `Delay: ${currentExecDelay}ms`;
  
  // If simulation is running, restart it with new delay
  if (sim) {
    clearInterval(sim);
    const speed = Number(speedControl.value) || 1;
    sim = setInterval(()=>{
      for (let i = 0; i < speed; i++) {
        step();
      }
    }, currentExecDelay);
  }
});

// Update stats periodically
setInterval(() => {
  if (sim) updateStats();
}, 100);
