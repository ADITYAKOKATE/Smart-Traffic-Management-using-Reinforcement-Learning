const ROAD_WIDTH = 120;
const LANE_WIDTH = 30;
const CANVAS_SIZE = 600;
const CENTER = CANVAS_SIZE / 2; // 300
// Intersection Boundary: Center +/- 60
const INTERSECTION_BOUNDS = {
    min: CENTER - ROAD_WIDTH / 2, // 240
    max: CENTER + ROAD_WIDTH / 2  // 360
};

class TrafficLight {
    constructor(x, y, label) {
        this.x = x;
        this.y = y;
        this.label = label; // 'N', 'S', 'E', 'W'
        this.state = 'RED'; // RED, GREEN, YELLOW
        this.timer = 0;
    }

    setGreen() { this.state = 'GREEN'; }
    setRed() { this.state = 'RED'; }
    setYellow() { this.state = 'YELLOW'; }

    draw(ctx) {
        // Draw Box
        ctx.fillStyle = '#1f2937';
        ctx.fillRect(this.x - 10, this.y - 20, 20, 40);

        // Light Circle
        ctx.beginPath();
        ctx.arc(this.x, this.y - 10, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#374151'; // Off
        if (this.state === 'RED') ctx.fillStyle = '#ef4444';
        if (this.state === 'YELLOW') ctx.fillStyle = '#fbbf24';
        ctx.fill();

        ctx.beginPath();
        ctx.arc(this.x, this.y + 10, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#374151'; // Off
        if (this.state === 'GREEN') ctx.fillStyle = '#10b981';
        ctx.fill();
    }
}

class Vehicle {
    constructor(id) {
        this.id = id;
        this.width = 18;
        this.length = 38;
        this.speed = 0;
        this.maxSpeed = 1.5;
        this.acceleration = 0.08;
        this.waiting = false;

        // Pathing Logic
        // Roads: 'N', 'S', 'E', 'W'
        // Lanes: 0 (Left/Inner), 1 (Right/Outer)
        const entries = ['N', 'S', 'E', 'W'];
        this.road = Utils.randomChoice(entries);

        // Turn Intent: 15% Left, 15% Right, 70% Straight
        const r = Math.random();
        if (r < 0.15) this.turnIntent = 'left';
        else if (r < 0.30) this.turnIntent = 'right';
        else this.turnIntent = 'straight';

        // Initial Lane Selection based on Intent
        // Right Turn -> Must be Lane 1 (Outer)
        // Left Turn -> Must be Lane 0 (Inner)
        // Straight -> Random
        if (this.turnIntent === 'right') this.laneId = 1;
        else if (this.turnIntent === 'left') this.laneId = 0;
        else this.laneId = Math.random() < 0.5 ? 0 : 1;

        // Visual State
        this.x = 0;
        this.y = 0;
        this.angle = 0;

        // Realistic Colors
        const colors = [
            '#e2e8f0', // White/Silver
            '#cbd5e1', // Light Grey
            '#64748b', // Slate
            '#0f172a', // Black
            '#b91c1c', // Deep Red
            '#1d4ed8', // Royal Blue
            '#15803d', // Green
            '#a16207', // Gold/Brown
        ];
        this.color = Utils.randomChoice(colors);
        this.type = Math.random(); // For future variety

        // Turn State
        this.turning = false;
        this.turnProgress = 0;


        this.initPosition();
    }

    initPosition() {
        // Calculate spawn coordinates
        // Lane Centers
        // Road Width 120. Lane Width 30.
        // Center is 300.
        // N Road: Incoming (Left Side of Median). lanes 0 and 1.
        // Incoming is on the User's Left if looking from start? No, standard US driving (Right side driving).
        // N Road (Top): Traffic comes DOWN. Driving on Right side of Median.
        // Median is x=300. Incoming traffic is x < 300 (Left of median from screen view).
        // Wait, standard coords: x=0 is left.
        // If driving South (Down), Right side is West side (x < 300)?
        // Let's define:
        // N (Top): Comes Down. Lane x < 300.
        // S (Bottom): Goes Up. Lane x > 300.
        // W (Left): Goes Right. Lane y > 300.
        // E (Right): Goes Left. Lane y < 300.

        const offsetInner = 15; // Half lane width
        const offsetOuter = 45; // 1.5 lane width

        if (this.road === 'N') {
            this.y = -50;
            this.angle = Math.PI / 2;
            // Right side of road is 'West' side (x < 300) relative to median?
            // If heading South, Right is x < 300.
            // Lane 0 (Inner/Left-relative-to-driver): x = 300 - 15 = 285.
            // Lane 1 (Outer/Right-relative-to-driver): x = 300 - 45 = 255.
            this.x = (this.laneId === 0) ? 285 : 255;
            this.dx = 0; this.dy = 1;
        }
        else if (this.road === 'S') {
            this.y = 650;
            this.angle = -Math.PI / 2;
            // Heading North. Right side is East (x > 300).
            this.x = (this.laneId === 0) ? 315 : 345;
            this.dx = 0; this.dy = -1;
        }
        else if (this.road === 'W') {
            this.x = -50;
            this.angle = 0;
            // Heading East. Right side is South (y > 300).
            this.y = (this.laneId === 0) ? 315 : 345;
            this.dx = 1; this.dy = 0;
        }
        else if (this.road === 'E') {
            this.x = 650;
            this.angle = Math.PI;
            // Heading West. Right side is North (y < 300).
            this.y = (this.laneId === 0) ? 285 : 255;
            this.dx = -1; this.dy = 0;
        }
    }

    update(lights, vehicles) {
        // --- 1. Sensors & Braking ---
        let stop = false;

        // Stop Line Logic
        const STOP_LINE_N = 220;
        const STOP_LINE_S = 380;
        const STOP_LINE_W = 220;
        const STOP_LINE_E = 380;

        let distToStop = Infinity;
        let myLight = lights[this.road]; // Light for this road

        // Calculate Distance to Stop Line
        if (this.road === 'N') distToStop = STOP_LINE_N - this.y;
        if (this.road === 'S') distToStop = this.y - STOP_LINE_S;
        if (this.road === 'W') distToStop = STOP_LINE_W - this.x;
        if (this.road === 'E') distToStop = this.x - STOP_LINE_E;

        // Light Check
        // Only stop if light is RED/YELLOW AND we are close to stop line
        if (!this.turning && distToStop > 0 && distToStop < 40) {
            if (myLight.state === 'RED') {
                // Right Turn on Red Logic
                if (this.turnIntent === 'right' && this.speed < 0.2) {
                    // Check Safety: No cars in target lane?
                    // Simplified: Small chance to go if stopped
                    if (Math.random() < 0.05) stop = false;
                    else stop = true;
                } else {
                    stop = true;
                }
            } else if (myLight.state === 'YELLOW') {
                stop = true;
            }
        }

        // Collision Check (Same Lane Only)
        // If I am stopped, I stay stopped if car ahead is close.
        if (!stop) {
            for (let v of vehicles) {
                if (v.id !== this.id && v.road === this.road && v.laneId === this.laneId) {
                    // Distance
                    const d = Math.hypot(v.x - this.x, v.y - this.y);

                    // Check if 'v' is physically ahead of 'this'
                    // N: v.y > this.y
                    // S: v.y < this.y
                    // W: v.x > this.x
                    // E: v.x < this.x
                    let ahead = false;
                    if (this.road === 'N' && v.y > this.y) ahead = true;
                    if (this.road === 'S' && v.y < this.y) ahead = true;
                    if (this.road === 'W' && v.x > this.x) ahead = true;
                    if (this.road === 'E' && v.x < this.x) ahead = true;

                    // Safe distance ~ 70px (increased from 40 for gap)
                    if (ahead && d < 70) {
                        stop = true;
                        break;
                    }
                }
            }
        }

        // --- 2. Physics ---
        if (stop) {
            this.speed *= 0.8;
            if (this.speed < 0.1) this.speed = 0;
            this.waiting = true;
        } else {
            // Acceleration
            if (this.speed < this.maxSpeed) this.speed += this.acceleration;
            // De-waiting
            if (this.speed > 0.5) this.waiting = false;
        }

        // --- 3. Turns & Movement ---
        // Trigger Turn
        if (!this.turning && this.turnIntent !== 'straight') {
            // Check if inside Intersection
            let inInter = false;
            if (this.road === 'N' && this.y > 240) inInter = true;
            if (this.road === 'S' && this.y < 360) inInter = true;
            if (this.road === 'W' && this.x > 240) inInter = true;
            if (this.road === 'E' && this.x < 360) inInter = true;

            if (inInter) {
                this.turning = true;
                this.setupTurn();
            }
        }

        if (this.turning) {
            this.executeTurn();
        } else {
            this.x += Math.cos(this.angle) * this.speed;
            this.y += Math.sin(this.angle) * this.speed;
        }
    }

    setupTurn() {
        // Calculate Pivot and End Angle
        // Reuse logic from previous step but adapted for multi-lane
        // Simplification: Lane 0 goes short/wide, Lane 1 goes short/wide
        // Actually, Lane 0 is Left Turn (Wide), Lane 1 is Right Turn (Tight).

        const rTight = 30; // Lane 1 -> Lane 1
        const rWide = 90;  // Lane 0 -> Lane 0

        if (this.turnIntent === 'right') {
            this.turnRadius = rTight;
            this.turnDir = 1;
        } else {
            this.turnRadius = rWide;
            this.turnDir = -1;
        }

        // Pivot depends on Road
        if (this.road === 'N') {
            this.startAngle = Math.PI / 2;
            if (this.turnIntent === 'right') { // To W
                this.pivotX = 255 - 30; // 225? Corner
                this.pivotY = 225; // Corner
                this.endAngle = Math.PI;
            } else { // To E
                this.pivotX = 375; // Far corner?
                this.pivotY = 225;
                this.endAngle = 0;
                this.turnDir = -1;
            }
        }
        // ... (Full implementation of all 8 pivots is verbose, doing generic logic)
        // Generic Logic:
        // Move forward by speed. Rotate angle by speed/radius.
        // We need a target angle.
        this.targetAngle = this.angle + (this.turnIntent === 'right' ? Math.PI / 2 : -Math.PI / 2);
    }

    executeTurn() {
        // Rotate Velocity
        const dTheta = (this.speed / this.turnRadius) * (this.turnIntent === 'right' ? 1 : -1);
        this.angle += dTheta;

        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;

        // Completion Check
        if (Math.abs(this.angle - this.targetAngle) < 0.1) {
            this.angle = this.targetAngle;
            this.turning = false;
            this.turnIntent = 'straight';
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Body Color (Base)
        ctx.fillStyle = this.color;

        // Shadow
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 15;

        // Chassis (Rounded Rect)
        ctx.beginPath();
        ctx.roundRect(-this.length / 2, -this.width / 2, this.length, this.width, 3);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Roof / Cabin (Darker/Glass)
        ctx.fillStyle = 'rgba(15, 23, 42, 0.6)'; // Tinted Glass
        // Windshield and Rear window area
        const roofLen = this.length * 0.6;
        const roofWidth = this.width * 0.8;
        ctx.beginPath();
        ctx.roundRect(-roofLen / 2, -roofWidth / 2, roofLen, roofWidth, 2);
        ctx.fill();

        // Roof Top (Metal)
        ctx.fillStyle = this.color;
        // Make it slightly darker or lighter?
        // Let's just make it a smaller rect in middle
        ctx.beginPath();
        ctx.roundRect(-roofLen / 2 + 2, -roofWidth / 2 + 2, roofLen - 4, roofWidth - 4, 1);
        ctx.fill();



        // Brake Lights (Red)
        if (this.waiting || this.speed < 0.2) {
            ctx.fillStyle = '#ff0000';
            ctx.shadowColor = '#ff0000';
            ctx.shadowBlur = 10;
        } else {
            ctx.fillStyle = '#7f1d1d'; // Dark Red
        }
        ctx.beginPath();
        ctx.rect(-this.length / 2 - 1, -this.width / 2 + 1, 2, 4);
        ctx.rect(-this.length / 2 - 1, this.width / 2 - 5, 2, 4);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.restore();
    }

    isOutOfBounds() {
        return (this.x < -100 || this.x > 700 || this.y < -100 || this.y > 700);
    }
}

class TrafficSimulation {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.width = CANVAS_SIZE;
        this.height = CANVAS_SIZE;
        this.canvas.width = this.width;
        this.canvas.height = this.height;

        this.vehicles = [];
        this.lights = {
            'N': new TrafficLight(220, 220, 'N'),
            'S': new TrafficLight(380, 380, 'S'),
            'E': new TrafficLight(380, 220, 'E'),
            'W': new TrafficLight(220, 380, 'W')
        };
        // Fix Light Positions visual
        this.lights['N'].x = 200; this.lights['N'].y = 200;
        this.lights['S'].x = 400; this.lights['S'].y = 400;
        this.lights['E'].x = 400; this.lights['E'].y = 200;
        this.lights['W'].x = 200; this.lights['W'].y = 400;

        this.vehicleIdCounter = 0;
        this.spawnRate = 0.02;
        this.currentThroughput = 0;
    }

    reset() {
        this.vehicles = [];
        this.currentThroughput = 0;
    }

    step(action) {
        // Action is handled by main.js controller mostly
        if (Math.random() < this.spawnRate) this.spawnVehicle();

        this.vehicles.forEach(v => v.update(this.lights, this.vehicles));

        const initialCount = this.vehicles.length;
        this.vehicles = this.vehicles.filter(v => !v.isOutOfBounds());
        this.currentThroughput = initialCount - this.vehicles.length;
    }

    spawnVehicle() {
        this.vehicles.push(new Vehicle(this.vehicleIdCounter++));
    }

    draw() {
        // 1. Background
        this.ctx.fillStyle = '#0b0d14';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Grid Pattern (Subtle)
        this.ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        for (let i = 0; i < this.width; i += 40) {
            this.ctx.moveTo(i, 0); this.ctx.lineTo(i, this.height);
            this.ctx.moveTo(0, i); this.ctx.lineTo(this.width, i);
        }
        this.ctx.stroke();

        // 2. Roads
        this.ctx.fillStyle = '#1e293b'; // Asphalt
        // Vertical
        this.ctx.fillRect(240, 0, 120, 600);
        // Horizontal
        this.ctx.fillRect(0, 240, 600, 120);

        // Road Edges (Neon Glow)
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = 'rgba(99, 102, 241, 0.5)'; // Primary Glow
        this.ctx.strokeStyle = '#6366f1';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        // V-Road Borders
        this.ctx.moveTo(240, 0); this.ctx.lineTo(240, 600);
        this.ctx.moveTo(360, 0); this.ctx.lineTo(360, 600);
        // H-Road Borders
        this.ctx.moveTo(0, 240); this.ctx.lineTo(600, 240);
        this.ctx.moveTo(0, 360); this.ctx.lineTo(600, 360);
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;

        // Medians (Double Yellow)
        this.ctx.strokeStyle = '#fbbf24';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(298, 0); this.ctx.lineTo(298, 230); // N Top
        this.ctx.moveTo(302, 0); this.ctx.lineTo(302, 230);
        this.ctx.moveTo(298, 370); this.ctx.lineTo(298, 600); // S Bottom
        this.ctx.moveTo(302, 370); this.ctx.lineTo(302, 600);

        this.ctx.moveTo(0, 298); this.ctx.lineTo(230, 298); // W Left
        this.ctx.moveTo(0, 302); this.ctx.lineTo(230, 302);
        this.ctx.moveTo(370, 298); this.ctx.lineTo(600, 298); // E Right
        this.ctx.moveTo(370, 302); this.ctx.lineTo(600, 302);
        this.ctx.stroke();

        // Stop Bars (White Wide)
        this.ctx.strokeStyle = '#fff';
        this.ctx.lineWidth = 4;
        this.ctx.beginPath();
        this.ctx.moveTo(240, 230); this.ctx.lineTo(300, 230); // N Stop
        this.ctx.moveTo(300, 370); this.ctx.lineTo(360, 370); // S Stop
        this.ctx.moveTo(230, 300); this.ctx.lineTo(230, 360); // W Stop
        this.ctx.moveTo(370, 240); this.ctx.lineTo(370, 300); // E Stop
        this.ctx.stroke();

        // Lane Dash
        this.ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([10, 20]);
        this.ctx.beginPath();
        this.ctx.moveTo(270, 0); this.ctx.lineTo(270, 600);
        this.ctx.moveTo(330, 0); this.ctx.lineTo(330, 600);
        this.ctx.moveTo(0, 270); this.ctx.lineTo(600, 270);
        this.ctx.moveTo(0, 330); this.ctx.lineTo(600, 330);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // 3. Vehicles
        this.vehicles.forEach(v => v.draw(this.ctx));

        // 4. Lights Overlay
        this.drawLight(210, 150, this.lights['N'].state, 'N');
        this.drawLight(370, 390, this.lights['S'].state, 'S');
        this.drawLight(150, 370, this.lights['W'].state, 'W');
        this.drawLight(390, 150, this.lights['E'].state, 'E');
    }

    drawLight(x, y, state, road) {
        // Glow Backing
        const isActive = state === 'GREEN' || state === 'YELLOW';
        const color = state === 'GREEN' ? '#10b981' : (state === 'YELLOW' ? '#fbbf24' : '#ef4444');

        // Housing
        this.ctx.fillStyle = '#1e293b';
        this.ctx.beginPath();
        this.ctx.roundRect(x, y, 24, 64, 4);
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        this.ctx.lineWidth = 1;
        this.ctx.stroke();

        const drawBulb = (oy, c, on) => {
            this.ctx.beginPath();
            this.ctx.arc(x + 12, y + oy, 8, 0, Math.PI * 2);
            this.ctx.fillStyle = on ? c : '#334155';

            if (on) {
                this.ctx.shadowBlur = 20;
                this.ctx.shadowColor = c;
            }
            this.ctx.fill();
            this.ctx.shadowBlur = 0;

            // Highlight reflection
            if (on) {
                this.ctx.fillStyle = 'rgba(255,255,255,0.5)';
                this.ctx.beginPath();
                this.ctx.arc(x + 12 - 2, y + oy - 2, 2, 0, Math.PI * 2);
                this.ctx.fill();
            }
        };

        drawBulb(12, '#ef4444', state === 'RED' || state === 'RED_YELLOW');
        drawBulb(32, '#fbbf24', state === 'YELLOW' || state === 'RED_YELLOW');
        drawBulb(52, '#10b981', state === 'GREEN');

        // Queue Badge
        if (road) {
            const queue = this.getActiveLaneQueue([road]);
            if (queue > 0) {
                this.ctx.fillStyle = '#ef4444';
                this.ctx.beginPath();
                this.ctx.arc(x + 24, y, 10, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.fillStyle = '#fff';
                this.ctx.font = 'bold 10px Inter';
                this.ctx.fillText(queue, x + 21, y + 3);
            }
        }
    }

    // --- Helpers ---

    getQueue(road) {
        return this.vehicles.filter(v => v.road === road && v.waiting).length;
    }

    getState() {
        // State: [Queue_N, Queue_S, Queue_E, Queue_W, Phase_N, Phase_S, Phase_E, Phase_W]
        // Simplified for RL: just queues and maybe "can go"?
        // Let's stick to Queues for now.
        return [
            this.getQueue('N'),
            this.getQueue('S'),
            this.getQueue('E'),
            this.getQueue('W')
        ];
    }

    getTotalWaiting() {
        return this.vehicles.filter(v => v.waiting).length;
    }

    getActiveLaneQueue(lanes) {
        // lanes is array of strings e.g. ['N']
        let count = 0;
        this.vehicles.forEach(v => {
            if (lanes.includes(v.road)) {
                // If waiting OR approaching close
                if (v.waiting) count++;
                else {
                    // Check distance
                    const STOP_LINE_N = 220;
                    const STOP_LINE_S = 380;
                    const STOP_LINE_W = 220;
                    const STOP_LINE_E = 380;

                    let dist = Infinity;
                    if (v.road === 'N') dist = STOP_LINE_N - v.y;
                    if (v.road === 'S') dist = v.y - STOP_LINE_S;
                    if (v.road === 'W') dist = STOP_LINE_W - v.x;
                    if (v.road === 'E') dist = v.x - STOP_LINE_E;

                    // Distance check: < 400 (covers most of the lane)
                    if (dist > 0 && dist < 400) count++;
                }
            }
        });
        return count;
    }

    isIntersectionClear() {
        // Bounds: 240 to 360
        const min = 240;
        const max = 360;
        for (let v of this.vehicles) {
            if (v.x > min && v.x < max && v.y > min && v.y < max) return false;
        }
        return true;
    }
}
