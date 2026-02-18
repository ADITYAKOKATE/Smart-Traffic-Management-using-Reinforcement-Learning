# Smart Traffic Signal Control - Project Documentation

## 1. Project Overview
This project simulates a smart traffic intersection where a **Reinforcement Learning (RL) Agent** learns to control traffic lights to minimize congestion and waiting times. Unlike traditional timer-based systems, this agent adapts to real-time traffic flow, learning optimal strategies through trial and error.

The project is built using:
- **Frontend**: HTML5, CSS3, JavaScript (Canvas API for visualization).
- **AI/ML Engine**: A custom-built **Deep Q-Learning (DQN)** library (`neuro.js`) implemented in vanilla JavaScript.
- **Simulation**: A custom physics-based traffic simulator.

---

## 2. Technical Architecture

The system consists of three main components:

### A. The Simulation (`js/simulation.js`)
- **Physics Engine**: Handles vehicle movement, acceleration, braking, and turning logic.
- **Traffic Logic**: Manages traffic light states (Red, Yellow, Green), lane queues, and collision detection.
- **State System**: continually exports the current state of the intersection to the AI Agent.

### B. The Agent (`js/agent.js`)
- Acts as the bridge between the Simulation and the Neural Network.
- Translates specific simulation states into a format the Neural Network understands.
- execute actions decided by the Brain.

### C. The Brain (`js/lib/neuro.js`)
- A custom lightweight **Deep Q-Learning** library.
- **Neural Network**: A Feedforward Neural Network with:
    - **Input Layer**: 5 Neurons (Observation).
    - **Hidden Layer**: 14 Neurons (Processing).
    - **Output Layer**: 3 Neurons (Actions).
- **Experience Replay**: Stores past experiences (State, Action, Reward, Next State) in a buffer and replays them to train the network, preventing overfitting to recent events.

---

## 3. Reinforcement Learning Implementation

The core of the "Smart" control lies in how we formulate the RL problem:

### **State (Input)**
The Agent observes the environment through **5 variables**:
1. `Queue_N`: Number of cars waiting in the North lane.
2. `Queue_S`: Number of cars waiting in the South lane.
3. `Queue_E`: Number of cars waiting in the East lane.
4. `Queue_W`: Number of cars waiting in the West lane.
5. `Current_Phase`: The active signal phase index (N, S, E, or W).

### **Actions (Output)**
The Agent can choose one of **3 actions** at every decision point:
- **Action 0 (Keep)**: Extend the current Green light (if within Max Green time).
- **Action 1 (Next)**: Immediately switch to the next phase in the cycle.
- **Action 2 (Rush)**: Emergency switch to the lane with the longest queue (currently simplified to 'Next' for safety).

### **Reward Function**
The agent learns what is "good" or "bad" through a reward signal calculated every frame:
```javascript
Reward = (Throughput * 20) - (Total_Waiting_Cars * 0.5)
```
- **Positive Reinforcement**: +20 points for every car that successfully leaves the intersection.
- **Negative Reinforcement**: -0.5 points for every car currently stuck waiting.
- **Goal**: Maximize cumulative reward, which naturally forces the agent to clear traffic as fast as possible.

### **Training Process**
1. **Observation**: Agent sees the current queues.
2. **Decision**: Uses Epsilon-Greedy strategy (Explore random actions vs. Exploit best known action).
3. **Action**: Changes or holds the light.
4. **Feedback**: Receives Reward and new State.
5. **Learning**: Uses Backpropagation to update the Neural Network weights to predict better Q-values (quality of action) for future states.

---

## 4. File Structure

- **`index.html`**: Main entry point, UI layout, and canvas container.
- **`css/style.css`**: Styling for the dashboard and controls.
- **`js/`**:
    - **`main.js`**: Main game loop, connects Simulation, Agent, and UI. Handles the "Training Loop".
    - **`simulation.js`**: Contains `Vehicle`, `TrafficLight`, and `TrafficSimulation` classes.
    - **`agent.js`**: Wrapper class for the AI.
    - **`lib/neuro.js`**: **Core AI Library**. Contains `NeuralNetwork`, `ReplayBuffer`, and `DQLAgent` classes.
    - **`utils.js`**: Helper functions for math and randomization.

## 5. How to Use

1. **Start**: Open `index.html`. Simulation starts automatically.
2. **Monitor**:
    - **Epsilon**: Starts at 1.0 (100% Random Exploration). As it decreases, the AI is "using its brain" more.
    - **Avg Wait**: Should decrease over time.
    - **Reward**: Should increase over time.
3. **Controls**:
    - **Speed Slider**: Accelerate training (e.g., 20x speed).
    - **Save/Load**: Once the agent performs well, save its "Brain" to browser LocalStorage.
