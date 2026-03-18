const {
    buildSun,
    buildPlanet,
    buildBullet,
} = require("./physicalObject");

/**
 * @typedef {Object} Physic
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} size
 * @property {number} mass
 * @property {number} multiplier
 * @property {boolean} isAffectedByGravity
 * @property {boolean} pendingRemoval
 */

const OUT_OF_BOUNDS_RATIO = 1.1;

function applyElasticCollision(a, b) {
    const directionX = a.x - b.x;
    const directionY = a.y - b.y;
    const distanceSquared = directionX * directionX + directionY * directionY;
    const collisionRadius = a.size + b.size;

    if (distanceSquared === 0 || distanceSquared > collisionRadius * collisionRadius) {
        return false;
    }

    const velocityX = b.vx - a.vx;
    const velocityY = b.vy - a.vy;
    const dotProduct = velocityX * directionX + velocityY * directionY;

    if (dotProduct <= 0) {
        return false;
    }

    const multiplierA = Math.sqrt(a.multiplier);
    const multiplierB = Math.sqrt(b.multiplier);
    const totalMass = a.mass * multiplierA + b.mass * multiplierB;
    const massFactorA = (2 * b.mass * multiplierA) / totalMass;
    const massFactorB = (2 * a.mass * multiplierB) / totalMass;
    const scaledMomentum = dotProduct / distanceSquared;
    const scalarA = massFactorA * scaledMomentum;
    const scalarB = massFactorB * scaledMomentum;

    a.vx += scalarA * directionX;
    a.vy += scalarA * directionY;
    b.vx -= scalarB * directionX;
    b.vy -= scalarB * directionY;
    return true;
}

function canCollide(a, b) {
    const directionX = a.x - b.x;
    const directionY = a.y - b.y;
    const distanceSquared = directionX * directionX + directionY * directionY;
    const collisionRadius = a.size + b.size;
    return distanceSquared < collisionRadius * collisionRadius;
}

function applyDestructiveCollision(planet, bullet) {
    const multiplier = (Math.sqrt(planet.multiplier) * bullet.mass) / planet.mass;
    planet.vx += bullet.vx * multiplier;
    planet.vy += bullet.vy * multiplier;
}

function cloneBody(body) {
    return {
        ...body,
        pendingRemoval: false,
    };
}

function createOrbitingPlanet(radius, angle, direction = 1, speedFactor = 1) {
    const planet = buildPlanet();
    const orbitalSpeed = Math.sqrt(1000 / radius) * speedFactor;

    planet.x = Math.cos(angle) * radius;
    planet.y = Math.sin(angle) * radius;
    planet.vx = -Math.sin(angle) * orbitalSpeed * direction;
    planet.vy = Math.cos(angle) * orbitalSpeed * direction;

    return planet;
}

class Map {
    constructor(size) {
        this.size = size;
        this.elements = {
            suns: [],
            planets: [],
            bullets: [],
        };
    }

    suns() {
        return this.elements.suns;
    }

    planets() {
        return this.elements.planets;
    }

    bullets() {
        return this.elements.bullets;
    }

    addSun(sun = {}) {
        const body = cloneBody({
            ...buildSun(),
            ...sun,
            isAffectedByGravity: false,
        });
        this.elements.suns.push(body);
        return body;
    }

    addPlanet(planet = {}) {
        const body = cloneBody({
            ...buildPlanet(),
            ...planet,
        });
        this.elements.planets.push(body);
        return body;
    }

    addBullet(bullet = {}) {
        const body = cloneBody({
            ...buildBullet(),
            ...bullet,
        });
        this.elements.bullets.push(body);
        return body;
    }

    initializeBattle(playerCount = 2) {
        this.elements = {
            suns: [],
            planets: [],
            bullets: [],
        };

        this.addSun({
            x: 0,
            y: 0,
            size: 110,
            mass: 1400,
        });

        const safePlayerCount = Math.max(1, playerCount);
        const orbitStep = (Math.PI * 2) / safePlayerCount;

        for (let index = 0; index < safePlayerCount; index += 1) {
            const angle = index * orbitStep;
            this.addPlanet(createOrbitingPlanet(260 + (index % 2) * 70, angle, 1, 1));
        }

        return this;
    }

    tick() {
        this.applyPhysic();
        this.applyRemoval();
    }

    applyPhysic() {
        const planets = this.planets();
        const bullets = this.bullets();
        const suns = this.suns();
        const gravitySources = [...suns, ...planets];
        const movingBodies = [...planets, ...bullets];

        for (const item of movingBodies) {
            let accelerationX = 0;
            let accelerationY = 0;

            if (item.isAffectedByGravity === true) {
                for (const source of gravitySources) {
                    if (source === item) {
                        continue;
                    }

                    const distanceX = source.x - item.x;
                    const distanceY = source.y - item.y;
                    const distanceSquared = distanceX * distanceX + distanceY * distanceY;

                    if (distanceSquared === 0) {
                        continue;
                    }

                    const distance = Math.sqrt(distanceSquared);
                    const force = source.mass / distanceSquared;
                    accelerationX += (force * distanceX) / distance;
                    accelerationY += (force * distanceY) / distance;
                }
            }

            item.vx += accelerationX;
            item.vy += accelerationY;
            item.x += item.vx;
            item.y += item.vy;

            const distanceToCenter = Math.sqrt(item.x * item.x + item.y * item.y);
            if (distanceToCenter > OUT_OF_BOUNDS_RATIO * this.size) {
                item.pendingRemoval = true;
            }
        }

        for (let index = 0; index < planets.length; index += 1) {
            const planet = planets[index];

            for (let secondIndex = index + 1; secondIndex < planets.length; secondIndex += 1) {
                applyElasticCollision(planet, planets[secondIndex]);
            }

            for (const bullet of bullets) {
                if (!canCollide(planet, bullet)) {
                    continue;
                }

                applyDestructiveCollision(planet, bullet);
                bullet.pendingRemoval = true;
            }
        }

        for (let index = 0; index < bullets.length; index += 1) {
            const bullet = bullets[index];
            for (let secondIndex = index + 1; secondIndex < bullets.length; secondIndex += 1) {
                const otherBullet = bullets[secondIndex];
                if (canCollide(otherBullet, bullet)) {
                    bullet.pendingRemoval = true;
                    otherBullet.pendingRemoval = true;
                }
            }
        }
    }

    applyRemoval() {
        for (const key of Object.keys(this.elements)) {
            this.elements[key] = this.elements[key].filter((element) => !element.pendingRemoval);
        }
    }
}

module.exports = {
    Map,
};
