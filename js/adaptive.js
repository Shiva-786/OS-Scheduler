// Adaptive / Feedback scheduler
import { pushSlot, renderTable, logAppend } from './common.js';

const tbody = document.querySelector('#taskTable tbody');
const timeline = document.querySelector('#timeline') || document.createElement('div');
const logOut = document.querySelector('#logOutput');

let tasks = [];
let now = 0;
let sim = null;
let paused = false;
const BASE_QUANTUM = 20;

// sample tasks
tasks = [
  { id:0, name:'X', arrival:0, exec:120, remaining:120, deadline:400, finished:false, missed:false, priorityBoost:0, color:'color0' },
  { id:1, name:'Y', arrival:50, exec:90, remaining:90, deadline:300, finished:false, missed:false, priorityBoost:0, color:'color1' }
];

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

function step(){
  if (paused) return;

  // Check for newly added tasks
  if (window.__ADAPTIVE_ADD__ && window.__ADAPTIVE_ADD__.length > 0) {
    tasks.push(...window.__ADAPTIVE_ADD__);
    window.__ADAPTIVE_ADD__ = [];
  }

  // Load preset if requested
  if (window.__ADAPTIVE_LOAD_PRESET__) {
    tasks = window.__ADAPTIVE_LOAD_PRESET__;
    now = 0;
    logAppend(logOut, '🔄 Preset loaded, please click Start to begin');
    window.__ADAPTIVE_LOAD_PRESET__ = null;
  }

  // Export data if requested
  if (window.__ADAPTIVE_GET_TASKS__) {
    window.__ADAPTIVE_TASKS_DATA__ = JSON.parse(JSON.stringify(tasks));
    window.__ADAPTIVE_GET_TASKS__ = false;
  }

  // Expose for stats
  window.__ADAPTIVE_TASKS__ = tasks;
  window.__ADAPTIVE_NOW__ = now;

  const ready = tasks.filter(t=>!t.finished && t.arrival <= now);
  if (ready.length === 0){
    pushSlot(timeline,'idle','idle');
    now += BASE_QUANTUM;
    return;
  }
  
  const load = systemLoad();
  const quantum = Math.max(6, Math.round(BASE_QUANTUM * (1 - load * 0.7)));
  ready.sort((a,b)=> priorityScore(a) - priorityScore(b));
  const cur = ready[0];
  const q = Math.min(quantum, cur.remaining);
  cur.remaining -= q;
  pushSlot(timeline, cur.name, cur.color);
  logAppend(logOut, `t=${now} : running ${cur.name} for ${q}ms (laxity ${priorityScore(cur)})`);
  
  if (cur.remaining <= 0){
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
}

document.getElementById('runEDF').addEventListener('click', ()=>{
  if (sim) return;
  paused = false;
  document.getElementById('pauseEDF').textContent = '⏸ Pause';
  sim = setInterval(()=>{
    const speed = window.__ADAPTIVE_SPEED__ || 1;
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
  tasks.forEach(t => { t.remaining = t.exec; t.finished = false; t.missed = false; t.priorityBoost = 0; });
  timeline.innerHTML = ''; 
  logOut.textContent = '';
  now = 0;
  renderTable(tbody, tasks, now);
  document.getElementById('pauseEDF').textContent = '⏸ Pause';
  logAppend(logOut, '🔄 Simulation reset. Click Start to begin.');
});

renderTable(tbody, tasks, now);
