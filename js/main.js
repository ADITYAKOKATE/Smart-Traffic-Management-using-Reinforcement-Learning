// Main Game Loop

const canvasId = 'sim-canvas';
const sim = new TrafficSimulation('sim-canvas');
const agent = new TrafficAgent();

// UI Elements
const els = {
    avgWait: document.getElementById('avg-wait'),
    throughput: document.getElementById('throughput'),
    epsilon: document.getElementById('epsilon'),
    reward: document.getElementById('reward'),
    episode: document.getElementById('episode-count'),
    step: document.getElementById('step-count'),
    btnReset: document.getElementById('btn-reset'),
    btnSave: document.getElementById('btn-save'),
    btnLoad: document.getElementById('btn-load'),
    speedSlider: document.getElementById('sim-speed'),
    speedVal: document.getElementById('speed-val')
};

// Chart Setup
// Chart Setup
let perfChart = null;
if (typeof Chart !== 'undefined') {
    const ctxChart = document.getElementById('perf-chart').getContext('2d');
    perfChart = new Chart(ctxChart, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Avg Queue Length',
                borderColor: '#6366f1',
                data: [],
                fill: false,
                tension: 0.4
            }, {
                label: 'Reward',
                borderColor: '#10b981',
                data: [],
                fill: false,
                tension: 0.4,
                hidden: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#94a3b8' } }
            },
            scales: {
                x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });
} else {
    console.warn("Chart.js not loaded. Charts will be disabled.");
}

let simulationSpeed = 1;
let episode = 1;
let episodeSteps = 0;
const MAX_STEPS_PER_EPISODE = 2000;
let isRunning = true;

// Metrics
let totalReward = 0;
let totalWaitMetric = 0;
let metricsHistory = [];

// Frame skipping for flickering
let currentPhaseTime = 0;
const MIN_GREEN_TIME = 300; // ~5 seconds (at 60fps)
const MAX_GREEN_TIME = 1800; // ~30 seconds max
const YELLOW_TIME = 120; // ~2 seconds

// Phases: 0=NS_GREEN, 1=NS_YELLOW, 2=EW_GREEN, 3=EW_YELLOW, 4=ALL_RED
let currentPhase = 0;
let phaseTimer = 0;

function loop() {
    try {
        if (!isRunning) {
            console.log("Loop Paused");
            return requestAnimationFrame(loop);
        }

        // Run multiple steps if speed > 1
        for (let i = 0; i < simulationSpeed; i++) {
            update();
        }

        draw();
        requestAnimationFrame(loop);
    } catch (e) {
        console.error("Game Loop Crash:", e);
        // Manually trigger visible error if somehow missed
        const overlay = document.getElementById('debug-error-overlay');
        if (overlay) {
            overlay.style.display = 'block';
            document.getElementById('debug-error-msg').innerText += `\n[Loop Crash] ${e.message}\n${e.stack}`;
        }
        isRunning = false;
    }
}

// Phases: 
// We no longer have fixed phases 0-4.
// We have independent timers for N, S, E, W.

function update() {
    // 1. Get State
    const state = sim.getState();
    const throughput = sim.currentThroughput;


    // 2. RL Action Step
    const MIN_GREEN = 180; // 3s
    const MAX_GREEN = 600; // 10s
    // YELLOW_TIME is global (120) but we can redefine locally or use it. We used YELLOW_TIME in loop which is fine.
    // RED_TIME was 30
    const RED_TIME = 30;   // 0.5s Clearance
    // Actions: 
    // 0 = KEEP_PHASE (Extend Green if possible)
    // 1 = NEXT_PHASE (Standard Cycle)
    // 2 = RUSH_PHASE (Switch to Longest Queue)

    // Safety Checks: Min Green Time
    const canSwitch = phaseTimer > MIN_GREEN;
    const mustSwitch = phaseTimer > MAX_GREEN;

    // Default: Action 0 (Keep) unless forced
    let action = 0;

    // Only query brain if we differ from "Red Clearance" state
    // We only control GREEN light duration.
    // If in Red/Yellow, we follow fixed rules.
    const isGreenPhase = [0, 3, 6, 9].includes(currentPhase);

    if (isGreenPhase) {
        if (mustSwitch) {
            // Force Next or Rush? Let's say Next.
            action = 1;
        } else if (canSwitch) {
            // Ask AI
            action = agent.act(state);
        } else {
            // Mandatory Wait (Min Green)
            action = 0;
        }
    } else {
        // Yellow/Red Logic (Fixed)
        // AI doesn't control this part directly, avoiding instability.
        // We treat it as "Action 0" or skip learning step for these frames?
        // Let's just follow standard logic and NOT ask AI.
        action = 0; // Dummy
    }

    // Execute Action
    let switched = false;

    // Helper to advance
    const advance = () => {
        // Cycle: 0->1(Y)->2(R)->3(G)...
        // But our map is:
        // N: 0(G), 1(Y), 2(R)
        // S: 3(G), 4(Y), 5(R)
        // E: 6(G), 7(Y), 8(R)
        // W: 9(G), 10(Y), 11(R)

        // Standard Cycle: N -> S -> E -> W -> N
        if (currentPhase === 0) currentPhase = 1;      // N Green -> Yellow
        else if (currentPhase === 3) currentPhase = 4; // S Green -> Yellow
        else if (currentPhase === 6) currentPhase = 7; // E Green -> Yellow
        else if (currentPhase === 9) currentPhase = 10; // W Green -> Yellow

        // If Red/Yellow calling this, just ++
        else if (!isGreenPhase) currentPhase++;

        // Wrap 11 -> 0
        if (currentPhase > 11) currentPhase = 0;
    };

    // Rush Logic (Find max queue, switch to its Green)
    const rush = () => {
        const qN = sim.getActiveLaneQueue(['N']);
        const qS = sim.getActiveLaneQueue(['S']);
        const qE = sim.getActiveLaneQueue(['E']);
        const qW = sim.getActiveLaneQueue(['W']);
        const candidates = [{ p: 0, q: qN }, { p: 3, q: qS }, { p: 6, q: qE }, { p: 9, q: qW }];
        candidates.sort((a, b) => b.q - a.q);
        const best = candidates[0].p;

        // If we are already there, keep matches.
        if (currentPhase === best) return; // Stay

        // Transition: We can't just jump to Green. We must go Yellow -> Red -> Green.
        // This is complex for "Rush".
        // Simplified Rush: Jump to Yellow of CURRENT phase, then logic will naturally go Red -> Target Green?
        // Let's just use "Standard Advance" for now to keep it safe.
        // Or implement "Target Phase" variable.
        // For simplicity v1: Action 2 == Action 1 (Next Phase).
        advance();
    };

    if (isGreenPhase) {
        if (action === 1) advance();
        if (action === 2) advance(); // Treat Rush as Next for now to ensure safety
        // Action 0: Do nothing (Stay Green)
    } else {
        // Fixed Logic for Yellow/Red
        phaseTimer++;
        const limit = [1, 4, 7, 10].includes(currentPhase) ? YELLOW_TIME : RED_TIME;
        if (phaseTimer > limit) {
            // Red -> Next Green
            if ([2, 5, 8, 11].includes(currentPhase)) {
                // Logic to pick next green
                // Standard Cycle: 2->3, 5->6, 8->9, 11->0
                if (currentPhase === 2) currentPhase = 3;
                else if (currentPhase === 5) currentPhase = 6;
                else if (currentPhase === 8) currentPhase = 9;
                else if (currentPhase === 11) currentPhase = 0;
            } else {
                currentPhase++; // Yellow -> Red
            }
            phaseTimer = 0;
        }
    }

    // Apply & Update
    if (!isGreenPhase && phaseTimer === 0) {
        // Just switched
    }

    // Hack: If action caused switch, reset timer
    // We need to track if phase changed
    // This is getting messy. Let's simplify.
    // The "advance" function changes currentPhase.
    // Use a pre-check.

    // RE-WRITE LOGIC FOR CLARITY
    const prevPhase = currentPhase;

    if (isGreenPhase) {
        phaseTimer++; // Increment first

        if (mustSwitch || (canSwitch && (action === 1 || action === 2))) {
            // Switch to Yellow
            if (currentPhase === 0) currentPhase = 1;
            else if (currentPhase === 3) currentPhase = 4;
            else if (currentPhase === 6) currentPhase = 7;
            else if (currentPhase === 9) currentPhase = 10;
            phaseTimer = 0;
        }
    } else {
        phaseTimer++;
        const isYellow = [1, 4, 7, 10].includes(currentPhase);
        const limit = isYellow ? YELLOW_TIME : RED_TIME;

        if (phaseTimer > limit) {
            currentPhase++;
            if (currentPhase > 11) currentPhase = 0;
            phaseTimer = 0;
        }
    }

    // Sync Simulation Phase Index for next State
    const phaseIdx = Math.floor(currentPhase / 3); // 0, 1, 2, 3 corresponding to N, S, E, W
    sim.setPhaseIndex(phaseIdx);

    // 3. Apply Lights
    ['N', 'S', 'E', 'W'].forEach(k => sim.lights[k].setRed());
    if (currentPhase === 0) sim.lights['N'].setGreen();
    else if (currentPhase === 1) sim.lights['N'].setYellow();
    else if (currentPhase === 3) sim.lights['S'].setGreen();
    else if (currentPhase === 4) sim.lights['S'].setYellow();
    else if (currentPhase === 6) sim.lights['E'].setGreen();
    else if (currentPhase === 7) sim.lights['E'].setYellow();
    else if (currentPhase === 9) sim.lights['W'].setGreen();
    else if (currentPhase === 10) sim.lights['W'].setYellow();

    // 4. Physics Step
    sim.step(0);

    // 5. Training
    const nextState = sim.getState();
    const nextWait = sim.getTotalWaiting();

    // Reward: 
    // +1 per car passing (throughput increase)
    // -0.1 per car waiting
    // Penalty for switching too fast? No, we handle that with MinGreen.
    // Penalty for keeping too long? We have -Wait.

    let reward = (sim.currentThroughput * 20) - (nextWait * 0.5);

    // Normalize reward to be around -1 to 1 for stability? 
    // Neural nets like small numbers.
    // Throughput is usually 0 or 1 per frame. Wait is 0-50.
    // Reward ~ -25 to +20.
    reward = reward / 100.0;

    const done = episodeSteps >= MAX_STEPS_PER_EPISODE;

    // Only learn if we were in a decision state (Green & CanSwitch)
    // Or learn every step? 
    // Standard DQN learns every step but "action" 0 was forced in Yellow/Red.
    // It's better to only learn "decisions".

    if (isGreenPhase && canSwitch) {
        agent.learn(state, action, reward, nextState, done);
    }

    // Metrics
    totalReward += reward;
    totalWaitMetric += nextWait;
    episodeSteps++;
    if (episodeSteps % 60 === 0) els.throughput.innerText = sim.currentThroughput;

    if (done) resetEpisode();
}

function draw() {
    sim.draw();

    // UI Updates (throttle slightly if needed, but simple enough here)
    if (episodeSteps % 10 === 0) {
        els.step.innerText = episodeSteps;
        els.epsilon.innerText = agent.brain.epsilon.toFixed(3);
        els.reward.innerText = totalReward.toFixed(1);
        els.avgWait.innerText = (totalWaitMetric / episodeSteps).toFixed(1);

        // Debug UI
        document.getElementById('dbg-mode').innerText = `PHASE ${currentPhase}`;
        document.getElementById('dbg-timer').innerText = phaseTimer;
        // Keep episode logic as is but note we have 16 phases now
        const qNS = sim.getActiveLaneQueue(['N', 'S']);
        const qEW = sim.getActiveLaneQueue(['E', 'W']);
        document.getElementById('dbg-qns').innerText = qNS;
        document.getElementById('dbg-qew').innerText = qEW;
    }
    // Debug: Heartbeat
    els.step.style.color = (Date.now() % 1000 < 500) ? 'red' : 'white';
}

function resetEpisode() {
    // Log Stats
    const avgWait = totalWaitMetric / MAX_STEPS_PER_EPISODE;
    metricsHistory.push(avgWait);

    // Update Chart
    if (metricsHistory.length > 50) metricsHistory.shift();

    if (perfChart) {
        perfChart.data.labels.push(episode);
        if (perfChart.data.labels.length > 50) perfChart.data.labels.shift();

        perfChart.data.datasets[0].data.push(avgWait);
        perfChart.data.datasets[1].data.push(totalReward);
        perfChart.update();
    }

    // Reset Sim
    sim.reset();
    episode++;
    episodeSteps = 0;
    totalReward = 0;
    totalWaitMetric = 0;
    // Reset Logic
    currentPhase = 0;
    phaseTimer = 0;

    // Ensure lights are set
    if (sim) {
        const ns = ['N', 'S'];
        const ew = ['E', 'W'];
        ns.forEach(k => sim.lights[k].setGreen());
        ew.forEach(k => sim.lights[k].setRed());
    }
    els.episode.innerText = episode;
}

// Controls
els.speedSlider.addEventListener('input', (e) => {
    simulationSpeed = parseInt(e.target.value);
    els.speedVal.innerText = simulationSpeed + 'x';
});

els.btnReset.addEventListener('click', () => {
    sim.reset();
    agent.brain = new DQLAgent(5, 3); // Reset brain too? Or just sim? Let's reset everything.
    episode = 1;
    episodeSteps = 0;
    metricsHistory = [];
    if (perfChart) {
        perfChart.data.labels = [];
        perfChart.data.datasets[0].data = [];
        perfChart.data.datasets[1].data = [];
        perfChart.update();
    }
});

els.btnSave.addEventListener('click', () => {
    const json = agent.save();
    localStorage.setItem('traffic_brain', json);
    alert('Brain saved!');
});

els.btnLoad.addEventListener('click', () => {
    const json = localStorage.getItem('traffic_brain');
    if (json) {
        agent.load(json);
        alert('Brain loaded!');
    } else {
        alert('No saved brain found.');
    }
});

// Start
console.log("Starting Loop...");
loop();
