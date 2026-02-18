# Smart Traffic Signal Control - Project Setup

## Overview
This project simulates a 4-way traffic intersection controlled by a Reinforcement Learning (RL) agent. The agent uses Deep Q-Learning (DQN) to minimize traffic congestion by learning optimal signal switching strategies.

## Features
- **Simulation**: Real-time traffic flow visualization on HTML5 Canvas.
- **RL Agent**: Custom implementation of Deep Q-Learning (Neuro.js Lite).
- **Visualization**: Live charts showing average wait times and rewards.
- **Interactivity**: Control simulation speed, reset, save/load trained models.

## How to Run
1.  **Open `index.html`** in any modern web browser (Edge, Chrome, Firefox).
2.  The simulation will start automatically.
3.  Watch the "Avg Wait Time" graph. Over time (50-100 episodes), the agent should learn to reduce congestion effectively.

## Controls
- **Reset Simulation**: Restarts the learning process.
- **Save Brain**: Save the current neural network weights to local storage.
- **Load Brain**: Load previously saved weights.
- **Speed Slider**: Control simulation speed (1x - 100x).

## Troubleshooting
- If graphs don't appear, ensure `Chart.js` CDN is accessible (requires internet).
- If simulation is slow, increase speed using the slider.
