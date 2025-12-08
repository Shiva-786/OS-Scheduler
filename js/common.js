// common.js — helpers used by scheduler pages

export function format(ms){
  return `${ms} ms`;
}

export function pushSlot(timelineEl, taskName, colorClass){
  const d = document.createElement('div');
  d.className = 'slot ' + (colorClass || 'idle');
  d.textContent = taskName || 'idle';
  timelineEl.appendChild(d);
  if (timelineEl.children.length > 160) timelineEl.removeChild(timelineEl.children[0]);
  timelineEl.scrollLeft = timelineEl.scrollWidth;
}

export function renderTable(tbodyEl, tasks, now, onDelete, currentTaskId){
  tbodyEl.innerHTML = '';
  tasks.forEach(t=>{
    const tr = document.createElement('tr');
    let status;
    if (t.finished) {
      status = '✅ done';
    } else if (t.suspended) {
      status = '⏳ I/O wait';
    } else if (t.id === currentTaskId) {
      status = '▶️ running';
    } else if (t.arrival > now) {
      status = '⏳ waiting';
    } else {
      status = '⏸️ ready';
    }
    tr.innerHTML = `
      <td>${t.name}</td>
      <td>${t.arrival ?? '-'}</td>
      <td>${t.deadline ?? '-'}</td>
      <td>${t.exec}</td>
      <td>${t.remaining}</td>
      <td>${t.ioOps || 0}</td>
      <td>${t.ioTime || 0}ms</td>
      <td>${status}</td>
      <td><button class="btn-delete" type="button">🗑</button></td>
    `;
    tbodyEl.appendChild(tr);
    
    // Add delete handler with proper event delegation
    if (onDelete) {
      const deleteBtn = tr.querySelector('.btn-delete');
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onDelete(t.id);
      });
    }
  });
}

// Variant that shows Quantum column for RM/Adaptive schedulers
export function renderTableWithQuantum(tbodyEl, tasks, now, onDelete, quantumFn, currentTaskId){
  tbodyEl.innerHTML = '';
  tasks.forEach(t=>{
    const tr = document.createElement('tr');
    let status;
    if (t.finished) {
      status = '✅ done';
    } else if (t.suspended) {
      status = '⏳ I/O wait';
    } else if (t.id === currentTaskId) {
      status = '▶️ running';
    } else if (t.arrival > now) {
      status = '⏳ waiting';
    } else {
      status = '⏸️ ready';
    }
    const quantum = quantumFn ? quantumFn(t) : (t.period ?? t.quantum ?? '-');
    tr.innerHTML = `
      <td>${t.name}</td>
      <td>${t.arrival ?? '-'}</td>
      <td>${t.deadline ?? '-'}</td>
      <td>${t.exec}</td>
      <td>${t.remaining}</td>
      <td>${t.ioOps || 0}</td>
      <td>${t.ioTime || 0}ms</td>
      <td>${status}</td>
      <td>${quantum}</td>
      <td><button class="btn-delete" type="button">🗑</button></td>
    `;
    tbodyEl.appendChild(tr);
    
    // Add delete handler with proper event delegation
    if (onDelete) {
      const deleteBtn = tr.querySelector('.btn-delete');
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onDelete(t.id);
      });
    }
  });
}

export function logAppend(el, text){
  el.textContent += text + '\n';
  el.scrollTop = el.scrollHeight;
}

// Statistics and metrics
export function getScheduleStats(tasks, now) {
  const completed = tasks.filter(t => t.finished);
  const missed = completed.filter(t => t.missed);
  const idle = tasks.filter(t => !t.finished && t.arrival > now);
  
  return {
    total: tasks.length,
    completed: completed.length,
    missed: missed.length,
    missRate: tasks.length > 0 ? (missed.length / completed.length * 100).toFixed(1) : 0,
    waiting: idle.length,
    currentTime: now
  };
}

export function renderStats(container, stats) {
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-top:12px">
      <div style="background:rgba(16,185,129,0.1);padding:12px;border-radius:8px;border:1px solid #10b981">
        <div style="font-size:0.8rem;color:var(--muted)">Completed</div>
        <div style="font-size:1.5rem;font-weight:700;color:#10b981">${stats.completed}/${stats.total}</div>
      </div>
      <div style="background:rgba(239,68,68,0.1);padding:12px;border-radius:8px;border:1px solid #ef4444">
        <div style="font-size:0.8rem;color:var(--muted)">Missed</div>
        <div style="font-size:1.5rem;font-weight:700;color:#ef4444">${stats.missed}</div>
      </div>
      <div style="background:rgba(59,130,246,0.1);padding:12px;border-radius:8px;border:1px solid #3b82f6">
        <div style="font-size:0.8rem;color:var(--muted)">Time</div>
        <div style="font-size:1.5rem;font-weight:700;color:#3b82f6">${stats.currentTime}ms</div>
      </div>
      <div style="background:rgba(168,85,247,0.1);padding:12px;border-radius:8px;border:1px solid #a855f7">
        <div style="font-size:0.8rem;color:var(--muted)">Miss Rate</div>
        <div style="font-size:1.5rem;font-weight:700;color:#a855f7">${stats.missRate}%</div>
      </div>
    </div>
  `;
}

// Export/Import utilities
export function exportTasksAsJSON(tasks) {
  return JSON.stringify(tasks.map(t => ({
    name: t.name,
    arrival: t.arrival,
    exec: t.exec,
    deadline: t.deadline,
    period: t.period
  })), null, 2);
}

export function downloadJSON(jsonString, filename = 'tasks.json') {
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Preset scenarios
export const presets = {
  light: [
    { id:0, name:'Light1', arrival:0, exec:30, remaining:30, deadline:100, finished:false, color:'color0' },
    { id:1, name:'Light2', arrival:50, exec:25, remaining:25, deadline:150, finished:false, color:'color1' }
  ],
  medium: [
    { id:0, name:'M1', arrival:0, exec:60, remaining:60, deadline:200, finished:false, color:'color0' },
    { id:1, name:'M2', arrival:40, exec:80, remaining:80, deadline:250, finished:false, color:'color1' },
    { id:2, name:'M3', arrival:100, exec:50, remaining:50, deadline:300, finished:false, color:'color2' }
  ],
  heavy: [
    { id:0, name:'Heavy1', arrival:0, exec:100, remaining:100, deadline:300, finished:false, color:'color0' },
    { id:1, name:'Heavy2', arrival:50, exec:120, remaining:120, deadline:350, finished:false, color:'color1' },
    { id:2, name:'Heavy3', arrival:100, exec:90, remaining:90, deadline:280, finished:false, color:'color2' },
    { id:3, name:'Heavy4', arrival:150, exec:110, remaining:110, deadline:380, finished:false, color:'color3' }
  ]
};
