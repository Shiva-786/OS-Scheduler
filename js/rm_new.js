// Rate Monotonic (RM) scheduler simulation
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
const TICK = 10;
let currentExecDelay = 50;
let currentTaskId = null; // Track which task is running

// sample periodic tasks
tasks = [
  { id:0, name:'T1', arrival:0, exec:10, remaining:10, period:100, deadline:100, finished:false, missed:false, color:'color0' },
  { id:1, name:'T2', arrival:0, exec:20, remaining:20, period:200, deadline:200, finished:false, missed:false, color:'color1' }
];

// Initialize UI
function updateTaskTable() {
  renderTableWithQuantum(tbody, tasks, now, (id) => {
    const taskName = tasks.find(t => t.id === id)?.name || '?';
    tasks = tasks.filter(t => t.id !== id);
    logAppend(logOut, `🗑 Task "${taskName}" removed`);
    updateTaskTable();
  }, (t) => t.period + ' ms', currentTaskId);
}

updateTaskTable();
logAppend(logOut, '🟢 RM Scheduler Ready. Add periodic tasks or click Start to begin.');

function releasePeriodic(){
  tasks.forEach(t=>{
    if (t.period && now > 0 && ((now - t.arrival) % t.period) === 0){
      if (t.remaining <= 0) {
        t.remaining = t.exec;
        t.finished = false;
        t.deadline = now + t.period;
        logAppend(logOut, `📅 Periodic release: ${t.name} at t=${now}`);
      }
    }
  });
}

function step(){
  if (paused) return;

  // Handle I/O completions first
  tasks.forEach(t => {
    if (t.suspended && t.suspendTime > 0) {
      t.suspendTime -= TICK;
      if (t.suspendTime <= 0) {
        t.suspended = false;
        t.suspendTime = 0;
        logAppend(logOut, `🔵 ${t.name} I/O completed, back to ready queue`);
        // Task remains in ready queue - will be picked by algorithm in next step
      }
    }
  });

  releasePeriodic();
  const ready = tasks.filter(t=>!t.finished && !t.suspended && t.arrival <= now && t.remaining > 0);
  
  if (ready.length === 0){
    currentTaskId = null;
    pushSlot(timeline,'idle','idle');
    now += TICK;
    updateNextTask();
    updateTaskTable();
    return;
  }
  
  // sort by period (shorter period = higher priority - RM algorithm)
  ready.sort((a,b)=> (a.period || 999999) - (b.period || 999999));
  const cur = ready[0];
  currentTaskId = cur.id; // Set current task
  const q = Math.min(TICK, cur.remaining);
  cur.remaining -= q;
  pushSlot(timeline, cur.name, cur.color);
  logAppend(logOut, `t=${now} : running ${cur.name} for ${q}ms (period ${cur.period})`);
  
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
    logAppend(logOut, `--> ${cur.name} finished at t=${now+q}`);
    if (now+q > cur.deadline) {
      cur.missed = true;
      logAppend(logOut, `⚠️  ${cur.name} MISSED its deadline (${cur.deadline})`);
    }
  }
  now += q;
  
  // If a task went into I/O, allow another task to run in the same step
  if (isIO) {
    const readyNext = tasks.filter(t=>!t.finished && !t.suspended && t.arrival <= now);
    if (readyNext.length > 0) {
      readyNext.sort((a,b)=> (a.period || 999999) - (b.period || 999999));
      const nextTask = readyNext[0];
      currentTaskId = nextTask.id;
      const q2 = Math.min(TICK, nextTask.remaining);
      nextTask.remaining -= q2;
      pushSlot(timeline, nextTask.name, nextTask.color);
      logAppend(logOut, `t=${now} : running ${nextTask.name} for ${q2}ms (period ${nextTask.period})`);
      
      if (nextTask.remaining <= 0 && (nextTask.ioOps || 0) > 0 && (nextTask.ioCount || 0) < (nextTask.ioOps || 0)) {
        nextTask.ioCount = (nextTask.ioCount || 0) + 1;
        nextTask.suspended = true;
        nextTask.suspendTime = nextTask.ioTime || 0;
        pushSlot(timeline, nextTask.name + '-IO', 'io');
        logAppend(logOut, `⏸️  ${nextTask.name} performing I/O operation ${nextTask.ioCount}/${nextTask.ioOps} for ${nextTask.ioTime}ms`);
        nextTask.remaining = nextTask.exec;
      } else if (nextTask.remaining <= 0){
        nextTask.finished = true;
        logAppend(logOut, `--> ${nextTask.name} finished at t=${now+q2}`);
        if (now+q2 > nextTask.deadline) {
          nextTask.missed = true;
          logAppend(logOut, `⚠️  ${nextTask.name} MISSED its deadline (${nextTask.deadline})`);
        }
      }
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
  const ready = tasks.filter(t=>!t.finished && t.arrival <= now && t.remaining > 0);
  const nextTaskInfo = document.getElementById('nextTaskInfo');
  
  if (ready.length === 0) {
    nextTaskInfo.textContent = '🟡 idle - कोई task ready नहीं';
    return;
  }
  
  // Sort by period (RM algorithm)
  ready.sort((a,b)=> (a.period || 999999) - (b.period || 999999));
  const next = ready[0];
  nextTaskInfo.innerHTML = `🟢 ${next.name} (period: ${next.period}ms, remaining: ${next.remaining}ms)`;
}

function updateStats() {
  const stats = getScheduleStats(tasks, now);
  renderStats(statsContainer, stats);
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
    exec: Number(data.get('exec') || 20),
    remaining: Number(data.get('exec') || 20),
    period: Number(data.get('period') || 100),
    deadline: Number(data.get('period') || 100),
    ioOps: ioOps,
    ioTime: ioTime,
    ioCount: 0,
    suspended: false,
    suspendTime: 0,
    finished: false,
    missed: false,
    color: 'color' + (Math.floor(Math.random()*6))
  };
  tasks.push(t);
  updateTaskTable();
  const ioInfo = ioOps > 0 ? ` + ${ioOps} I/O ops (${ioTime}ms each)` : '';
  logAppend(logOut, `✓ Task "${t.name}" added (arrival=${t.arrival}, exec=${t.exec}, period=${t.period}${ioInfo})`);
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
    t.ioCount = 0;
    t.suspended = false;
    t.suspendTime = 0;
  });
  timeline.innerHTML = ''; 
  logOut.textContent = '';
  now = 0;
  currentTaskId = null;
  updateTaskTable();
  updateStats();
  document.getElementById('pauseEDF').textContent = '⏸ Pause';
  logAppend(logOut, '🔄 Simulation reset. Click Start to begin.');
});

// Export
document.getElementById('exportBtn').addEventListener('click', () => {
  const json = exportTasksAsJSON(tasks);
  downloadJSON(json, 'rm_tasks.json');
  logAppend(logOut, '✓ Tasks exported to rm_tasks.json');
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
      period: t.deadline
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
