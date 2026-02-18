class TrafficAgent {
    constructor() {
        // State: 4 queue lengths + 1 current light state = 5 inputs
        // Actions: 0 (NS Green), 1 (EW Green), 2 (Keep) = 3 outputs
        this.brain = new DQLAgent(5, 3);
        this.cumulativeReward = 0;
        this.stepCount = 0;
    }

    act(state) {
        return this.brain.act(state);
    }

    learn(state, action, reward, nextState, done) {
        this.brain.remember(state, action, reward, nextState, done);
        this.brain.replay();
        this.cumulativeReward += reward;
        this.stepCount++;
    }

    save() {
        return this.brain.save();
    }

    load(json) {
        this.brain.load(json);
    }
}
