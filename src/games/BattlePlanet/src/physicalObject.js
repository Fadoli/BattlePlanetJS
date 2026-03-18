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

const BODY_DEFAULTS = {
    default: {
        x: 0,
        y: 0,
        size: 0,
        mass: 0,
        vx: 0,
        vy: 0,
        multiplier: 1,
        pendingRemoval: false,
        isAffectedByGravity: true,
    },
    sun: {
        size: 100,
        mass: 1000,
    },
    planet: {
        size: 20,
        mass: 100,
    },
    bullet: {
        size: 2,
        mass: 2,
    },
};

function getDefault(type, sizeModifier = 1, weightModifier = 1) {
    return {
        ...BODY_DEFAULTS.default,
        ...BODY_DEFAULTS[type],
        mass: BODY_DEFAULTS[type].mass * weightModifier,
        size: BODY_DEFAULTS[type].size * sizeModifier,
    };
}

module.exports = {
    buildSun(sizeModifier = 1, weightModifier = 1) {
        return getDefault("sun", sizeModifier, weightModifier);
    },
    buildPlanet(sizeModifier = 1, weightModifier = 1) {
        return getDefault("planet", sizeModifier, weightModifier);
    },
    buildBullet(sizeModifier = 1, weightModifier = 1) {
        return getDefault("bullet", sizeModifier, weightModifier);
    },
};
