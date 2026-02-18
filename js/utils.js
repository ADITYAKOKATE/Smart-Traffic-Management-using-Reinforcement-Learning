// Utility functions

const Utils = {
    // Random integer between min and max (inclusive)
    randomInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,

    // Random choice from array
    randomChoice: (arr) => arr[Math.floor(Math.random() * arr.length)],

    // Euclidean distance
    distance: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),

    // Check collision between two rectangles
    rectIntersect: (r1, r2) => {
        return !(r2.left > r1.right ||
            r2.right < r1.left ||
            r2.top > r1.bottom ||
            r2.bottom < r1.top);
    },

    // Normalize a value
    normalize: (val, min, max) => (val - min) / (max - min),

    // Get 4 corner points of a rotated rectangle
    getRectPoints: (x, y, w, h, angle) => {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const hw = w / 2;
        const hh = h / 2;

        // Local corners: (-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)
        // Rotated + Translated
        return [
            { x: x + (-hw * cos - -hh * sin), y: y + (-hw * sin + -hh * cos) },
            { x: x + (hw * cos - -hh * sin), y: y + (hw * sin + -hh * cos) },
            { x: x + (hw * cos - hh * sin), y: y + (hw * sin + hh * cos) },
            { x: x + (-hw * cos - hh * sin), y: y + (-hw * sin + hh * cos) }
        ];
    },

    // Check if two convex polygons intersect (SAT Algorithm)
    polygonsIntersect: (poly1, poly2) => {
        const polygons = [poly1, poly2];
        for (let i = 0; i < polygons.length; i++) {
            const polygon = polygons[i];
            for (let j = 0; j < polygon.length; j++) {
                const p1 = polygon[j];
                const p2 = polygon[(j + 1) % polygon.length];

                const normal = { x: -(p2.y - p1.y), y: p2.x - p1.x };

                let min1 = Infinity, max1 = -Infinity;
                for (const p of poly1) {
                    const q = (p.x * normal.x + p.y * normal.y);
                    min1 = Math.min(min1, q);
                    max1 = Math.max(max1, q);
                }

                let min2 = Infinity, max2 = -Infinity;
                for (const p of poly2) {
                    const q = (p.x * normal.x + p.y * normal.y);
                    min2 = Math.min(min2, q);
                    max2 = Math.max(max2, q);
                }

                if (!(max1 >= min2 && max2 >= min1)) return false;
            }
        }
        return true;
    }
};
