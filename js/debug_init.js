const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 1. Mock Browser Environment
const window = { innerWidth: 800, innerHeight: 600 };
const document = {
    getElementById: (id) => {
        return {
            getContext: (type) => ({
                fillRect: () => { },
                beginPath: () => { },
                moveTo: () => { },
                lineTo: () => { },
                stroke: () => { },
                strokeRect: () => { },
                arc: () => { },
                fill: () => { },
                setLineDash: () => { },
                measureText: () => ({ width: 0 }),
                fillText: () => { }
            }),
            width: 600,
            height: 600,
            addEventListener: () => { },
            style: {},
            value: 1 // for sliders
        };
    }
};

// Global Context
global.document = document;
global.window = window;
global.Chart = undefined; // Mock missing chart

// 2. Load Scripts Helper
const load = (file) => {
    try {
        const filePath = path.join(__dirname, file);
        const code = fs.readFileSync(filePath, 'utf8');
        vm.runInThisContext(code, file);
        console.log(`Loaded ${file}`);
    } catch (e) {
        console.error(`FAILED to load ${file}:`, e.message);
        console.error(e.stack);
        process.exit(1);
    }
};

// 3. Execution
console.log("Starting Debug...");

try {
    load('utils.js');
    load('lib/neuro.js');
    load('simulation.js');
    load('agent.js');

    console.log("Classes loaded. Testing Instantiation...");

    // Test TrafficSimulation
    const sim = new TrafficSimulation('sim-canvas');
    console.log("TrafficSimulation instantiated successfully.");

    // Test TrafficAgent
    const agent = new TrafficAgent();
    console.log("TrafficAgent instantiated successfully.");

    // Test Methods
    console.log("Testing methods...");
    sim.reset();
    sim.getState();
    sim.getActiveLaneQueue(['N']);

    // Test Act
    const state = sim.getState();
    const action = agent.act(state);
    console.log("Agent Act Action:", action);

    console.log("All methods passed.");

} catch (e) {
    console.error("CRASH DURING EXECUTION:", e);
    console.error(e.stack);
}
