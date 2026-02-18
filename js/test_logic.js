// Mock Browser Environment
const window = {
    innerWidth: 800,
    innerHeight: 600
};

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
            addEventListener: () => { }
        };
    }
};

global.document = document;
global.window = window;

const fs = require('fs');
const path = require('path');

const read = (file) => fs.readFileSync(path.join(__dirname, file), 'utf8');

const code = [
    read('utils.js'),
    read('lib/neuro.js'),
    read('simulation.js'),
    read('agent.js'),
    `
    // Test Sequence
    console.log("Starting Logic Test...");

    try {
        const sim = new TrafficSimulation('sim-canvas');
        const agent = new TrafficAgent();
        
        console.log("Initialization success.");
        
        sim.spawnRate = 1.0;
        sim.step(0); 
        
        console.log("Sim step success.");
        
        for (let i = 0; i < 50; i++) {
            const state = sim.getState();
            if (state.length !== 5) throw new Error("Invalid state length");
            
            const action = agent.act(state);
            sim.step(action); // Step logic handles throughput reset
            
            // Check throughput prop exists
            if (typeof sim.currentThroughput === 'undefined') throw new Error("Throughput not defined");
            
            const nextState = sim.getState();
            const reward = (sim.currentThroughput * 10) - (sim.getTotalWaiting());
            
            agent.learn(state, action, reward, nextState, false);
            
            if (i % 10 === 0) console.log("Step " + i + ": State " + JSON.stringify(state) + ", Action " + action + ", Thrpt " + sim.currentThroughput);
        }
        
        console.log("Simulation ran for 50 steps without error.");
        
        const save = agent.save();
        if (!save || save.length < 10) throw new Error("Save output invalid");
        
        const agent2 = new TrafficAgent();
        agent2.load(save);
        console.log("Save/Load success.");
        
        console.log("TEST PASSED");
        
    } catch (e) {
        console.error("Test Failed:", e);
        process.exit(1);
    }
    `
].join('\n');

eval(code);
