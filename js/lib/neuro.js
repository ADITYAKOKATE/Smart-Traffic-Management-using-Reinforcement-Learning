/**
 * Neuro.js (Lite Version)
 * A custom implementation of Deep Q-Learning for the Traffic Signal Project.
 * Implements a simple Feedforward Neural Network and Experience Replay.
 */

class NeuralNetwork {
    constructor(inputSize, hiddenSize, outputSize) {
        this.inputSize = inputSize;
        this.hiddenSize = hiddenSize;
        this.outputSize = outputSize;

        // Weights
        this.W1 = this.randomMatrix(this.inputSize, this.hiddenSize);
        this.W2 = this.randomMatrix(this.hiddenSize, this.outputSize);
        
        // Biases
        this.b1 = new Array(this.hiddenSize).fill(0);
        this.b2 = new Array(this.outputSize).fill(0);
        
        this.learningRate = 0.01;
    }

    randomMatrix(rows, cols) {
        const matrix = [];
        for (let i = 0; i < rows; i++) {
            const row = [];
            for (let j = 0; j < cols; j++) {
                row.push(Math.random() * 2 - 1); // -1 to 1
            }
            matrix.push(row);
        }
        return matrix;
    }

    sigmoid(x) {
        return 1 / (1 + Math.exp(-x));
    }

    sigmoidDerivative(x) {
        return x * (1 - x);
    }

    // Forward pass
    predict(state) {
        // Input -> Hidden
        this.z1 = []; 
        for(let j=0; j < this.hiddenSize; j++) {
            let sum = this.b1[j];
            for(let i=0; i < this.inputSize; i++) {
                sum += state[i] * this.W1[i][j];
            }
            this.z1.push(this.sigmoid(sum));
        }

        // Hidden -> Output
        this.z2 = [];
        for(let j=0; j < this.outputSize; j++) {
            let sum = this.b2[j];
            for(let i=0; i < this.hiddenSize; i++) {
                sum += this.z1[i] * this.W2[i][j];
            }
            this.z2.push(sum); // Linear output for Q-values
        }

        return this.z2;
    }

    // Train using Backpropagation
    train(state, target) {
        // Forward pass first to get current activations
        const output = this.predict(state);

        // Calculate Output Error (MSE derivative is output - target)
        const outputErrors = [];
        for(let i=0; i < this.outputSize; i++) {
            outputErrors.push(target[i] - output[i]);
        }

        // Backprop Output -> Hidden
        const hiddenErrors = new Array(this.hiddenSize).fill(0);
        for(let j=0; j < this.outputSize; j++) {
            for(let i=0; i < this.hiddenSize; i++) {
                // Gradient for W2 is: Error * Input(z1)
                this.W2[i][j] += this.learningRate * outputErrors[j] * this.z1[i];
                hiddenErrors[i] += outputErrors[j] * this.W2[i][j];
            }
            this.b2[j] += this.learningRate * outputErrors[j];
        }

        // Backprop Hidden -> Input
        for(let i=0; i < this.hiddenSize; i++) {
            const gradient = hiddenErrors[i] * this.sigmoidDerivative(this.z1[i]);
            for(let k=0; k < this.inputSize; k++) {
                this.W1[k][i] += this.learningRate * gradient * state[k];
            }
            this.b1[i] += this.learningRate * gradient;
        }
    }
    
    // Save weights
    toJSON() {
        return {
            W1: this.W1,
            W2: this.W2,
            b1: this.b1,
            b2: this.b2
        };
    }

    fromJSON(data) {
        this.W1 = data.W1;
        this.W2 = data.W2;
        this.b1 = data.b1;
        this.b2 = data.b2;
    }
}

class ReplayBuffer {
    constructor(capacity) {
        this.capacity = capacity;
        this.buffer = [];
    }

    add(state, action, reward, nextState, done) {
        if (this.buffer.length >= this.capacity) {
            this.buffer.shift();
        }
        this.buffer.push({ state, action, reward, nextState, done });
    }

    sample(batchSize) {
        const batch = [];
        for (let i = 0; i < batchSize; i++) {
            const index = Math.floor(Math.random() * this.buffer.length);
            batch.push(this.buffer[index]);
        }
        return batch;
    }
    
    size() {
        return this.buffer.length;
    }
}

class DQLAgent {
    constructor(inputSize, outputSize) {
        this.inputSize = inputSize;
        this.outputSize = outputSize;
        this.network = new NeuralNetwork(inputSize, 14, outputSize); // 14 hidden neurons
        this.memory = new ReplayBuffer(2000);
        
        this.gamma = 0.95;    // Discount factor
        this.epsilon = 1.0;   // Exploration rate
        this.epsilonMin = 0.05;
        this.epsilonDecay = 0.995;
        this.batchSize = 32;
    }

    act(state) {
        if (Math.random() <= this.epsilon) {
            return Math.floor(Math.random() * this.outputSize);
        }
        const qValues = this.network.predict(state);
        return qValues.indexOf(Math.max(...qValues));
    }

    remember(state, action, reward, nextState, done) {
        this.memory.add(state, action, reward, nextState, done);
    }

    replay() {
        if (this.memory.size() < this.batchSize) return;

        const batch = this.memory.sample(this.batchSize);
        
        batch.forEach(experience => {
            const { state, action, reward, nextState, done } = experience;
            
            let target = reward;
            if (!done) {
                const qNext = this.network.predict(nextState);
                target = reward + this.gamma * Math.max(...qNext);
            }
            
            const qValues = this.network.predict(state);
            qValues[action] = target; // Update the target for the taken action
            
            this.network.train(state, qValues);
        });

        if (this.epsilon > this.epsilonMin) {
            this.epsilon *= this.epsilonDecay;
        }
    }
    
    save() {
        return JSON.stringify(this.network.toJSON());
    }
    
    load(json) {
        this.network.fromJSON(JSON.parse(json));
    }
}
