// eslint-disable-next-line
let describe, it, before, after, beforeEach, afterEach;
if (typeof Bun !== 'undefined') {
    describe = require('bun:test').describe;
    it = require('bun:test').test;
    before = require('bun:test').before;
    after = require('bun:test').after;
    beforeEach = require('bun:test').beforeEach;
    afterEach = require('bun:test').afterEach;
} else {
    describe = require('node:test').describe;
    it = require('node:test').it;
    before = require('node:test').before;
    after = require('node:test').after;
    beforeEach = require('node:test').beforeEach;
    afterEach = require('node:test').afterEach;
}
const assert = require('assert');
const Map = require('./world').Map;

const clone = (obj) => {
    return JSON.parse(JSON.stringify(obj));
}

/**
* Compute the distance of two 2d objects
* @param {Physic} a
* @param {Physic} b
* @returns {Number}
*/
const dist = (a, b) => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy;
}

/**
* A description
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

/**
* Little helper to create an object with pre-set variables
* @param {number} mass
* @param {number} [x=0]
* @param {number} [y=0]
* @param {number} [size=10]
* @param {number} [vx=0]
* @param {number} [vy=0]
* @param {number} [multiplier=1]
* @returns {Physic}
*/
const createObject = (mass, x = 0, y = 0, size = 10, vx = 0, vy = 0, multiplier = 1) => {
    return {
        mass: mass,
        x: x,
        y: y,
        size: size,
        vx: vx,
        vy: vy,
        multiplier: multiplier,
        pendingRemoval: false,
        isAffectedByGravity: true,
    }
}

describe("/game/World", () => {
    // Nounka
    let map = new Map(1000);
    beforeEach(() => {
        map = new Map(1000);
    });

    describe("suns", () => {
        it('is an empty list', () => {
            const suns = map.suns();
            assert.deepStrictEqual(suns, []);
        });
    });
    describe("planets", () => {
        it('is an empty list', () => {
            const physics = map.planets();
            assert.deepStrictEqual(physics, []);
        });
    });
    describe("bullets", () => {
        it('is an empty list', () => {
            const physics = map.bullets();
            assert.deepStrictEqual(physics, []);
        });
    });

    describe("tick", () => {
        it('physics should do nothing if there is nothing', () => {
            const physics = clone(map.elements);
            map.tick();
            assert.deepStrictEqual(map.elements, physics);
        });

        describe("Gravity", () => {
            describe("Planet", () => {
                let middle, simple, simpleMoving;

                beforeEach(() => {
                    middle = createObject(100, 0, 0);
                    simple = createObject(100, 200, 0);
                    simpleMoving = createObject(100, 200, 100, 10, 10, 0, 1);
                });

                it('planets should stay the same with no interaction : keep velocity', () => {
                    map.elements.planets = [simpleMoving];
                    const simpleMovingClone = clone(simpleMoving);
                    const origX = simpleMoving.x;

                    map.tick();
                    assert.notDeepStrictEqual(simpleMoving, simpleMovingClone);
                    assert.strictEqual(simpleMoving.x, origX + simpleMoving.vx);

                    map.tick();
                    assert.notDeepStrictEqual(simpleMoving, simpleMovingClone);
                    assert.strictEqual(simpleMoving.x, origX + 2 * simpleMoving.vx);

                    map.tick();
                    assert.notDeepStrictEqual(simpleMoving, simpleMovingClone);
                    assert.strictEqual(simpleMoving.x, origX + 3 * simpleMoving.vx);
                });

                it('planets should stay the same with no interaction', () => {
                    map.elements.planets = [simple];
                    const physics = clone(map.planets());
                    map.tick();
                    assert.deepStrictEqual(map.planets(), physics);
                });

                it('planets should be attracted by planets', () => {
                    map.elements.planets = [simple, middle];
                    const orig = dist(simple, middle);
                    map.tick();
                    assert.strictEqual(orig > dist(simple, middle), true, "Physics should attract each other");
                });
            });

            describe("Bullet", () => {
                let middle, simple, simpleMoving;

                beforeEach(() => {
                    middle = createObject(100, 0, 0);
                    simple = createObject(100, 200, 0);
                    simpleMoving = createObject(100, 200, 100, 10, 10, 0, 1);
                });

                it('bullets should stay the same with no interaction : keep velocity', () => {
                    map.elements.bullets = [simpleMoving];
                    const simpleMovingClone = clone(simpleMoving);
                    const origX = simpleMoving.x;

                    map.tick();
                    assert.notDeepStrictEqual(simpleMoving, simpleMovingClone);
                    assert.strictEqual(simpleMoving.x, origX + simpleMoving.vx);

                    map.tick();
                    assert.notDeepStrictEqual(simpleMoving, simpleMovingClone);
                    assert.strictEqual(simpleMoving.x, origX + 2 * simpleMoving.vx);

                    map.tick();
                    assert.notDeepStrictEqual(simpleMoving, simpleMovingClone);
                    assert.strictEqual(simpleMoving.x, origX + 3 * simpleMoving.vx);
                });

                it('bullets should stay the same with no interaction', () => {
                    map.elements.bullets = [simple];
                    const physics = clone(map.planets());
                    map.tick();
                    assert.deepStrictEqual(map.planets(), physics);
                });

                it('bullets should not be attracted by bullets', () => {
                    map.elements.bullets = [simple, middle];
                    const orig = dist(simple, middle);
                    map.tick();
                    assert.strictEqual(orig > dist(simple, middle), false, "Physics should attract each other");
                });
            });

            describe("Planet - Bullet", () => {
                let planet, bullet;

                beforeEach(() => {
                    planet = createObject(100, 0, 0);
                    bullet = createObject(100, 200, 0);
                });

                it('planets should not be attracted by bullets', () => {
                    map.elements.bullets = [bullet];
                    map.elements.planets = [planet];

                    const cloned = clone(planet);
                    map.tick();
                    assert.deepStrictEqual(planet, cloned);
                });

                it('bullets should be attracted by planets', () => {
                    map.elements.bullets = [bullet];
                    map.elements.planets = [planet];

                    const cloned = clone(bullet);
                    map.tick();
                    assert.notDeepStrictEqual(bullet, cloned);
                });
            });

            describe("Sun - Bullet", () => {
                let sun, bullet;

                beforeEach(() => {
                    sun = createObject(100, 0, 0);
                    bullet = createObject(100, 200, 0);
                });

                it('suns should not be attracted by bullets', () => {
                    map.elements.bullets = [bullet];
                    map.elements.suns = [sun];

                    const cloned = clone(sun);
                    map.tick();
                    assert.deepStrictEqual(sun, cloned);
                });

                it('bullets should be attracted by suns', () => {
                    map.elements.bullets = [bullet];
                    map.elements.suns = [sun];

                    const cloned = clone(bullet);
                    map.tick();
                    assert.notDeepStrictEqual(bullet, cloned);
                });
            });


            describe("Sun - Planet", () => {
                let sun, planet;

                beforeEach(() => {
                    sun = createObject(100, 0, 0);
                    planet = createObject(100, 200, 0);
                });

                it('suns should not be attracted by planets', () => {
                    map.elements.planets = [planet];
                    map.elements.suns = [sun];

                    const cloned = clone(sun);
                    map.tick();
                    assert.deepStrictEqual(sun, cloned);
                });

                it('planets should be attracted by suns', () => {
                    map.elements.planets = [planet];
                    map.elements.suns = [sun];

                    const cloned = clone(planet);
                    map.tick();
                    assert.notDeepStrictEqual(planet, cloned);
                });
            });

            describe("Interactions", () => {
                let sun, sunLeft, sunRight, planetMiddle, simplePlanet, simpleMovingPlanet;

                beforeEach(() => {
                    sun = createObject(1000, 0, 0, 100);
                    sunLeft = createObject(1000, -100, 0, 100);
                    sunRight = createObject(1000, 100, 0, 100);
                    planetMiddle = createObject(100, 0, 0);
                    simplePlanet = createObject(100, 200, 0);
                    simpleMovingPlanet = createObject(100, 200, 100, 10, 10, 0, 1);
                });

                it('planets should move when there is a sun', () => {
                    map.elements.suns = [sun];
                    map.elements.planets = [simplePlanet];
                    const physics = clone(map.planets());
                    map.tick();
                    assert.notDeepStrictEqual(map.planets(), physics);
                });

                it('planets should be attracted by suns', () => {
                    map.elements.suns = [sun];
                    map.elements.planets = [simplePlanet];
                    const orig = dist(sun, simplePlanet);
                    map.tick();
                    assert.strictEqual(orig > dist(sun, simplePlanet), true, "Physics should attract each other");
                });

                it('planet should be equally attracted by suns: 2 at opposite direction = no movement', () => {
                    map.elements.suns = [sunLeft, sunRight];
                    map.elements.planets = [planetMiddle];

                    const physics = clone(map.planets());
                    map.tick();
                    assert.deepStrictEqual(map.planets(), physics);
                });

                it('suns should not move', () => {
                    map.elements.suns = [sun];
                    map.elements.planets = [simplePlanet];
                    const suns = clone(map.suns());
                    map.tick();
                    assert.deepStrictEqual(map.suns(), suns);
                });
            });
        });

        describe("Collisions", () => {
            describe("Planet", () => {
                let physRightToLeft, physLeftToRight;

                beforeEach(() => {
                    physRightToLeft = createObject(100, 30, 0, 10, -10, 0, 1);
                    physRightToLeft.isAffectedByGravity = false;
                    physLeftToRight = createObject(100, -30, 0, 10, 10, 0, 1);
                    physLeftToRight.isAffectedByGravity = false;
                });

                it('should collide', () => {
                    map.elements.planets = [physRightToLeft, physLeftToRight];

                    // While it moves to the left, and hasn't crossed 0
                    while (physRightToLeft.vx < 0 && physRightToLeft.x > 0) {
                        map.tick();
                    }

                    assert.strictEqual(physRightToLeft.x > 0, true, "Object failed to collide");
                });

                it('should preserve energy when colliding', () => {
                    map.elements.planets = [physRightToLeft, physLeftToRight];
                    let energy = 0;
                    map.planets().forEach((elem) => {
                        energy += elem.mass * (elem.vx * elem.vx + elem.vy * elem.vy);
                    });
                    energy = Math.round(energy);

                    // While it moves to the left, and hasn't crossed 0
                    while (physRightToLeft.vx < 0 && physRightToLeft.x > 0) {
                        map.tick();
                    }

                    let energyNew = 0;
                    map.planets().forEach((elem) => {
                        energyNew += elem.mass * (elem.vx * elem.vx + elem.vy * elem.vy);
                    });
                    energyNew = Math.round(energyNew);
                    assert.strictEqual(energyNew, energy, "Energy is conserved in a fully elastic collision!");
                });

                it('should preserve energy when colliding and mass differ', () => {
                    map.elements.planets = [physRightToLeft, physLeftToRight];
                    physRightToLeft.mass /= 2;
                    let energy = 0;
                    map.planets().forEach((elem) => {
                        energy += elem.mass * (elem.vx * elem.vx + elem.vy * elem.vy);
                    });
                    energy = Math.round(energy);

                    // While it moves to the left, and hasn't crossed 0
                    while (physRightToLeft.vx < 0 && physRightToLeft.x > 0) {
                        map.tick();
                    }

                    let energyNew = 0;
                    map.planets().forEach((elem) => {
                        energyNew += elem.mass * (elem.vx * elem.vx + elem.vy * elem.vy);
                    });
                    energyNew = Math.round(energyNew);
                    assert.strictEqual(energyNew, energy, "Energy is conserved in a fully elastic collision!");
                });

                it('should preserve "energy" when colliding with multiplier', () => {
                    map.elements.planets = [physRightToLeft, physLeftToRight];
                    physRightToLeft.multiplier = 2;
                    let energy = 0;
                    map.planets().forEach((elem) => {
                        energy += elem.mass * (elem.vx * elem.vx + elem.vy * elem.vy) / Math.sqrt(elem.multiplier);
                    });
                    energy = Math.round(energy);

                    // While it moves to the left, and hasn't crossed 0
                    while (physRightToLeft.vx < 0 && physRightToLeft.x > 0) {
                        map.tick();
                    }

                    let energyNew = 0;
                    map.planets().forEach((elem) => {
                        energyNew += elem.mass * (elem.vx * elem.vx + elem.vy * elem.vy) / Math.sqrt(elem.multiplier);
                    });
                    energyNew = Math.round(energyNew);
                    assert.strictEqual(energyNew, energy);
                });
            });

            describe("Bullet", () => {
                let physRightToLeft, physLeftToRight;

                beforeEach(() => {
                    physRightToLeft = createObject(100, 30, 0, 10, -10, 0, 1);
                    physRightToLeft.isAffectedByGravity = false;
                    physLeftToRight = createObject(100, -30, 0, 10, 10, 0, 1);
                    physLeftToRight.isAffectedByGravity = false;
                });

                it('should collide: bullets get removed', () => {
                    map.elements.bullets = [physRightToLeft, physLeftToRight];

                    // While it moves to the left, and hasn't crossed 0
                    while (map.elements.bullets.length === 2 && physRightToLeft.x > 0) {
                        map.tick();
                    }

                    assert.strictEqual(map.elements.bullets.length, 0, "Object failed to collide");
                });
            });

            describe("Planet - Bullet", () => {
                let physRightToLeft, physLeftToRight;

                beforeEach(() => {
                    physRightToLeft = createObject(100, 30, 0, 10, -10, 0, 1);
                    physRightToLeft.isAffectedByGravity = false;
                    physLeftToRight = createObject(100, -30, 0, 10, 10, 0, 1);
                    physLeftToRight.isAffectedByGravity = false;
                });

                it('should collide: Check planet velocity', () => {
                    map.elements.planets = [physRightToLeft];
                    map.elements.bullets = [physLeftToRight];

                    const vx = physRightToLeft.vx;
                    // While it moves to the left, and hasn't crossed 0
                    while (map.elements.bullets.length === 1 && physRightToLeft.x > 0) {
                        map.tick();
                    }
                    const expectedVx = vx + physLeftToRight.vx * physLeftToRight.mass * Math.sqrt(physRightToLeft.multiplier) / physRightToLeft.mass;
                    assert.strictEqual(physRightToLeft.vx, expectedVx);

                    assert.strictEqual(map.elements.bullets.length, 0, "Object failed to collide");
                });

                it('should collide: Check planet velocity with multiplier', () => {
                    map.elements.planets = [physRightToLeft];
                    map.elements.bullets = [physLeftToRight];

                    physRightToLeft.multiplier = 2;
                    const vx = physRightToLeft.vx;
                    // While it moves to the left, and hasn't crossed 0
                    while (map.elements.bullets.length === 1 && physRightToLeft.x > 0) {
                        map.tick();
                    }
                    const expectedVx = vx + physLeftToRight.vx * physLeftToRight.mass * Math.sqrt(physRightToLeft.multiplier) / physRightToLeft.mass;
                    assert.strictEqual(physRightToLeft.vx, expectedVx);

                    assert.strictEqual(map.elements.bullets.length, 0, "Object failed to collide");
                });

                it('should collide: bullets get removed', () => {
                    map.elements.planets = [physRightToLeft];
                    map.elements.bullets = [physLeftToRight];

                    // While it moves to the left, and hasn't crossed 0
                    while (map.elements.bullets.length === 1 && physRightToLeft.x > 0) {
                        map.tick();
                    }

                    assert.strictEqual(map.elements.bullets.length, 0, "Object failed to collide");
                });
            });
        });
    });
});
