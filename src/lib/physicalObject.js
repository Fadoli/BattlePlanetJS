
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
const createObject = (mass, x = 0, y = 0, size = 10, vx = 0, vy = 0) => {
    return {
        mass: mass,
        x: x,  y: y,
        size: size,
        vx: vx,
        vy: vy,
        multiplier: 1,
        pendingRemoval: false,
        isAffectedByGravity: true,
    }
}

const objectDefault = {
    default: {
        x: 0,
        y: 0,
        size: 0,
        mass: 0,
        vx: 0,
        vy: 0,
        multiplier:1,
        pendingRemoval:false,
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
    }
}
function getDefault (type,sizeModifier = 1,weightModifier = 1) {
    return { 
        ... objectDefault.default,
        ... objectDefault[type]
    }
}

module.exports = {
    buildSun = ( sizeModifier, weightModifier ) => getDefault('sun',sizeModifier,weightModifier),
    buildPlanet = ( sizeModifier, weightModifier ) => getDefault('planet',sizeModifier,weightModifier),
    buildBullet = ( sizeModifier, weightModifier ) => getDefault('bullet',sizeModifier,weightModifier),
};
