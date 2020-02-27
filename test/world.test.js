require('tap').mochaGlobals()
const should = require('should')
const world = require('../src/world');

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
        multiplier: multiplier
    }
}

describe("Hello World", () => {

    let map = new world.Map(1000);
    beforeEach(() => {
        map = new world.Map(1000);
    });

    describe("suns", () => {
        it('suns is an empty list', () => {
            const suns = map.suns();
            suns.should.eql([]);
        });
    });
    describe("physics", () => {
        it('physicall object is an empty list', () => {
            const physics = map.physics();
            physics.should.eql([]);
        });
    });

    describe("applyPhysic", () => {

        describe("Gravity", () => {
            const sun = createObject(1000, 0, 0, 100);
            const sunLeft = createObject(1000, -100, 0, 100);
            const sunRight = createObject(1000, +100, 0, 100);
            const planetMiddle = createObject(100, 0, 0);
            const simplePlanet = createObject(100, 200, 0);
            const simpleMovingPlanet = createObject(100, 200, 100, 10, 10, 0, 1);


            it('physics should do nothing if there is nothing', () => {
                const physics = clone(map.physics());
                map.applyPhysic();
                map.physics().should.be.eql(physics);
            });

            it('planet should stay the same with no suns and no movement', () => {
                map._physics = [simplePlanet];
                const physics = clone(map.physics());
                map.applyPhysic();
                map.physics().should.be.eql(physics);
            });

            it('planet should always move the same way without a sun', () => {
                map._physics = [simplePlanet, simpleMovingPlanet];
                const simpleClone = clone(simplePlanet);
                const simpleMovingClone = clone(simpleMovingPlanet);
                const origX = simpleMovingPlanet.x;

                map.applyPhysic();
                simplePlanet.should.be.eql(simpleClone);
                simpleMovingPlanet.should.not.be.eql(simpleMovingClone);
                simpleMovingPlanet.x.should.be.eql(origX + simpleMovingPlanet.vx);

                map.applyPhysic();
                simplePlanet.should.be.eql(simpleClone);
                simpleMovingPlanet.should.not.be.eql(simpleMovingClone);
                simpleMovingPlanet.x.should.be.eql(origX + 2 * simpleMovingPlanet.vx);

                map.applyPhysic();
                simplePlanet.should.be.eql(simpleClone);
                simpleMovingPlanet.should.not.be.eql(simpleMovingClone);
                simpleMovingPlanet.x.should.be.eql(origX + 3 * simpleMovingPlanet.vx);
            });

            it('planet should move when there is a sun', () => {
                map._suns = [sun];
                map._physics = [simplePlanet];
                const physics = clone(map.physics());
                map.applyPhysic();
                map.physics().should.not.be.eql(physics);
            });

            it('planet should be attracted by suns', () => {
                map._suns = [sun];
                map._physics = [simplePlanet];
                const orig = dist(sun, simplePlanet);
                map.applyPhysic();
                (orig > dist(sun, simplePlanet)).should.be.true("Physics should attracts each others");
            });

            it('planet should be equaly attracted by suns : 2 at oposite direction = no movement', () => {
                map._suns = [sunLeft, sunRight];
                map._physics = [planetMiddle];

                const physics = clone(map.physics());
                map.applyPhysic();
                map.physics().should.be.eql(physics);
            });

            it('suns should not move', () => {
                map._suns = [sun];
                map._physics = [simplePlanet];
                const suns = clone(map.suns());
                map.applyPhysic();
                map.suns().should.be.eql(suns);
            });
        });


        describe("Collisions", () => {
            const physRightToLeft = createObject(100, 30, 0, 10 , -10 , 0 ,1);
            const physLeftToRight = createObject(100, -30, 0, 10 , 10 , 0 ,1);


            it('objects should collides', () => {
                map._physics = [physRightToLeft,physLeftToRight];

                // While it moves to the left, and hasn't crossed 0
                while (physRightToLeft.vx < 0 && physRightToLeft.x > 0)
                {
                    map.applyPhysic();
                }

                 (physRightToLeft.x > 0).should.be.true("Object failed to collide");
            });
        });
    });
});

