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

    // 2. Logic: Split Phasing State Machine (N->S->E->W)
    phaseTimer++;

    // Configuration
    const MIN_GREEN = 180; // 3s
    const MAX_GREEN = 600; // 10s
    const YELLOW_TIME = 120; // 2s
    const RED_TIME = 30;   // 0.5s Clearance

    // Phases:
    // 0: N Green, 1: N Yellow, 2: Red
    // 3: S Green, 4: S Yellow, 5: Red
    // 6: E Green, 7: E Yellow, 8: Red
    // 9: W Green, 10: W Yellow, 11: Red

    const nextPhase = () => {
        // 1. If active (Green/Yellow), standard cycle increment
        if (![2, 5, 8, 11].includes(currentPhase)) {
            currentPhase++;
        }
        // 2. If Red Clearance, decide next winner
        else {
            const qN = sim.getActiveLaneQueue(['N']);
            const qS = sim.getActiveLaneQueue(['S']);
            const qE = sim.getActiveLaneQueue(['E']);
            const qW = sim.getActiveLaneQueue(['W']);

            // Candidates: N(0), S(3), E(6), W(9)
            // We penalize the just-finished lane slightly to prevent self-looping unless dominant?
            // User said "if a lane has more cars... active".
            // Let's stick to pure Max Queue. Intersection is cleared by Red phase anyway.

            const candidates = [
                { id: 0, q: qN },
                { id: 3, q: qS },
                { id: 6, q: qE },
                { id: 9, q: qW }
            ];

            // Sort Descending by Queue
            candidates.sort((a, b) => b.q - a.q);

            // If everyone is 0, cycle to next logical block
            if (candidates[0].q === 0) {
                // If N(2) -> S(3). S(5) -> E(6). E(8) -> W(9). W(11) -> N(0).
                if (currentPhase === 2) currentPhase = 3;
                else if (currentPhase === 5) currentPhase = 6;
                else if (currentPhase === 8) currentPhase = 9;
                else currentPhase = 0;
            } else {
                currentPhase = candidates[0].id;
            }
        }

        phaseTimer = 0;
        applyLights();
    };

    const applyLights = () => {
        // Reset all to Red first
        ['N', 'S', 'E', 'W'].forEach(k => sim.lights[k].setRed());

        if (currentPhase === 0) sim.lights['N'].setGreen();
        else if (currentPhase === 1) sim.lights['N'].setYellow();

        else if (currentPhase === 3) sim.lights['S'].setGreen();
        else if (currentPhase === 4) sim.lights['S'].setYellow();

        else if (currentPhase === 6) sim.lights['E'].setGreen();
        else if (currentPhase === 7) sim.lights['E'].setYellow();

        else if (currentPhase === 9) sim.lights['W'].setGreen();
        else if (currentPhase === 10) sim.lights['W'].setYellow();
    };

    if (episodeSteps === 0) applyLights();

    // Transitions
    // Green Phases (0, 3, 6, 9)
    if ([0, 3, 6, 9].includes(currentPhase)) {
        let activeRoad = '';
        if (currentPhase === 0) activeRoad = 'N';
        if (currentPhase === 3) activeRoad = 'S';
        if (currentPhase === 6) activeRoad = 'E';
        if (currentPhase === 9) activeRoad = 'W';

        if (phaseTimer > MIN_GREEN) {
            const queue = sim.getActiveLaneQueue([activeRoad]);
            if (queue === 0 || phaseTimer > MAX_GREEN) nextPhase();
        }
    }
    // Yellow Phases (1, 4, 7, 10)
    else if ([1, 4, 7, 10].includes(currentPhase)) {
        if (phaseTimer > YELLOW_TIME) nextPhase();
    }
    // Red Clearance Phases (2, 5, 8, 11)
    else {
        if (phaseTimer > RED_TIME) nextPhase();
    }

    // 3. Physics Step
    sim.step(0);

    // 4. Learning (Observer)
    const nextState = sim.getState();
    const nextWait = sim.getTotalWaiting();

    // Calculate Reward
    let reward = (sim.currentThroughput * 50) - (nextWait * 1.0);
    const pressure = (nextState[0] ** 2 + nextState[1] ** 2 + nextState[2] ** 2 + nextState[3] ** 2);
    reward -= pressure * 0.1;

    const done = episodeSteps >= MAX_STEPS_PER_EPISODE;
    agent.learn(state, 0, reward, nextState, done); // Action is dummy now

    // Metrics
    totalReward += reward;
    totalWaitMetric += nextWait;
    episodeSteps++;
    // Update UI
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
