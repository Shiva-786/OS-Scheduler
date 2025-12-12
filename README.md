# Adaptive OS Scheduler — Browser Simulator

This project contains browser-based simulators for scheduling policies used in real-time systems.
It is a simulation & visualization only (not a kernel scheduler).

## Files / Structure

Adaptive-OS-Scheduler/
├── README.md
├── index.html
├── css/
│ └── styles.css
├── js/
│ ├── common.js
│ ├── edf.js
│ ├── rm.js
│ └── adaptive.js
└── schedulers/
├── edf.html
├── rm.html
└── adaptive.html


## Demos

- **EDF** — Earliest Deadline First (choose ready task with earliest deadline).
- **RM** — Rate Monotonic (static priority by period).
- **ADAPTIVE** — Adaptive feedback scheduler that changes priorities/quantum based on workload and missed deadlines.

## Notes

- This is a *simulator* — browser timing is not real-time. It helps visualize scheduling logic and test dynamic workload changes.
- You can add tasks via forms in each demo. The timeline visualizes which task ran each tick.
- Feel free to extend: add CSV export, graphs, or combine pages into a single SPA.

