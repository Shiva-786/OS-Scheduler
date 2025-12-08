// Rate Monotonic (RM) scheduler simulation
import { pushSlot, renderTable, logAppend } from './common.js';

const tbody = document.querySelector('#taskTable tbody');
const timeline = document.querySelector('#timeline') || document.createElement('div');
const logOut = document.querySelector('#logOutput');

let tasks = [];
let now = 0;
let sim = null;
let paused = false;
const TICK = 10;

// sample periodic tasks
tasks = [
  { id:0, name:'T1', arrival:0, exec:10, remaining:10, period:100, deadline:100, finished:false, missed:false, color:'color0' },
  { id:1, name:'T2', arrival:0, exec:20, remaining:20, period:200, deadline:200, finished:false, missed:false, color:'color1' }
];

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

  // Check for newly added tasks
  if (window.__RM_ADD__ && window.__RM_ADD__.length > 0) {
    tasks.push(...window.__RM_ADD__);
    window.__RM_ADD__ = [];
  }

  // Load preset if requested
  if (window.__RM_LOAD_PRESET__) {
    tasks = window.__RM_LOAD_PRESET__;
    now = 0;
    logAppend(logOut, '🔄 Preset loaded, please click Start to begin');
    window.__RM_LOAD_PRESET__ = null;
  }

  // Export data if requested
  if (window.__RM_GET_TASKS__) {
    window.__RM_TASKS_DATA__ = JSON.parse(JSON.stringify(tasks));
    window.__RM_GET_TASKS__ = false;
  }

  // Expose for stats
  window.__RM_TASKS__ = tasks;
  window.__RM_NOW__ = now;

  releasePeriodic();
  const ready = tasks.filter(t=>!t.finished && t.arrival <= now && t.remaining > 0);
  
  if (ready.length === 0){
    pushSlot(timeline,'idle','idle');
    now += TICK;
    return;
  }
  
  // sort by period (shorter period = higher priority)
  ready.sort((a,b)=> (a.period || 999999) - (b.period || 999999));
  const cur = ready[0];
  const q = Math.min(TICK, cur.remaining);
  cur.remaining -= q;
  pushSlot(timeline, cur.name, cur.color);
  logAppend(logOut, `t=${now} : running ${cur.name} for ${q}ms (period ${cur.period})`);
  
  if (cur.remaining <= 0){
    cur.finished = true;
    if (now+q > cur.deadline) {
      cur.missed = true;
      logAppend(logOut, `⚠️  ${cur.name} MISSED its deadline (${cur.deadline})`);
    }
  }
  now += q;
}

document.getElementById('runEDF').addEventListener('click', ()=>{
  if (sim) return;
  paused = false;
  document.getElementById('pauseEDF').textContent = '⏸ Pause';
  sim = setInterval(()=>{
    const speed = window.__RM_SPEED__ || 1;
    for (let i = 0; i < speed; i++) {
      step();
      renderTable(tbody, tasks, now);
    }
  }, 50);
});

document.getElementById('pauseEDF').addEventListener('click', ()=>{
  if (!sim) return;
  paused = !paused;
  const btn = document.getElementById('pauseEDF');
  btn.textContent = paused ? '▶ Resume' : '⏸ Pause';
});

document.getElementById('resetEDF').addEventListener('click', ()=>{
  clearInterval(sim); 
  sim = null;
  paused = false;
  tasks.forEach(t => { t.remaining = t.exec; t.finished = false; t.missed = false; });
  timeline.innerHTML = ''; 
  logOut.textContent = '';
  now = 0;
  renderTable(tbody, tasks, now);
  document.getElementById('pauseEDF').textContent = '⏸ Pause';
  logAppend(logOut, '🔄 Simulation reset. Click Start to begin.');
});

renderTable(tbody, tasks, now);
