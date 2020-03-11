
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
* We will be modifying the a and b object with the resulting velocity !
* @param {Physic} a
* @param {Physic} b
*/
function ApplyElasticColllision(a, b) {
    let direction = {
        x: a.x - b.x,
        y: a.y - b.y
    };
    let absDistanceSquared = direction.x * direction.x + direction.y * direction.y;
    const rad = a.size + b.size;
    if (absDistanceSquared > (rad * rad)) {
        return false;
    }
    let velocity = {
        x: b.vx - a.vx,
        y: b.vy - a.vy
    };
    let dotProduct = velocity.x * direction.x + velocity.y * direction.y;
    if (dotProduct <= 0) {
        return false;
    }
    
    // m1+m2
    let multa = Math.sqrt(a.multiplier);
    let multb = Math.sqrt(b.multiplier);
    let totalMass = a.mass * multa + b.mass * multb;
    
    //   2 * m2
    // ----------
    //   (m1+m2)
    let massFactorOne = 2 * b.mass * multa / totalMass;
    
    //   2 * m1
    // ----------
    //   (m1+m2)
    let massFactorTwo = 2 * a.mass * multb / totalMass;
    
    //  <v2-v1,x1-x2>
    // ---------------
    //   ||x1-x2||^2
    let scaledMomentum = dotProduct / absDistanceSquared;
    // combined scalar values:
    //
    //   2 * m2      <v1-v2,x1-x2>            2 * m1      <v1-v2,x1-x2>
    // ---------- * ---------------   and   ---------- * ---------------
    //   (m1+m2)      ||x1-x2||^2             (m1+m2)      ||x1-x2||^2
    let scalarOne = massFactorOne * scaledMomentum;
    let scalarTwo = massFactorTwo * scaledMomentum;
    
    a.vx = (a.vx + (scalarOne * direction.x));
    a.vy = (a.vy + (scalarOne * direction.y));
    b.vx = (b.vx - (scalarTwo * direction.x));
    b.vy = (b.vy - (scalarTwo * direction.y));
    return;
}

/**
* does A and B collide ?
* @param {Physic} a
* @returns {boolean}
*/
function canCollide(a, b) {
    let direction = {
        x: a.x - b.x,
        y: a.y - b.y
    };
    const absDistanceSquared = direction.x * direction.x + direction.y * direction.y;
    const rad = a.size + b.size;
    return (absDistanceSquared < (rad * rad));
}

/**
* Apply Planet - Bullet (destructive) collision
* @param {Physic} a the planet
* @param {Physic} b the bullet
*/
function ApplyColllision(a, b) {
    let mult = Math.sqrt(a.multiplier) * b.mass / a.mass;
    a.vx = a.vx + b.vx * mult;
    a.vy = a.vy + b.vy * mult;
    return;
}

/**
* How a map is structured :)
* @export
* @class Map
*/
class Map {
    /**
    * Creates an instance of Map.
    * @param {number} size
    * @memberof Map
    */
    constructor(size) {
        this.size = size;
        this.elements = {
            suns: [],
            planets: [],
            bullets: [],
        }
    }
    
    /**
    * The list of the suns
    * @returns {Array<Physic>}
    * @memberof Map
    */
    suns() {
        return this.elements.suns;
    }
    /**
    * The list of the planet objects
    * @returns {Array<Physic>}
    * @memberof Map
    */
    planets() {
        return this.elements.planets;
    }
    /**
    * The list of the bullet objects
    * @returns {Array<Physic>}
    * @memberof Map
    */
    bullets() {
        return this.elements.bullets;
    }

    tick () {
        this.applyPhysic();
        this.applyRemoval();
    }
    
    applyPhysic() {
        let ax, ay;
        
        const planets = this.planets();
        const bullets = this.bullets();
        const suns = this.suns();
        
        const gravity = [...suns,...planets];
        const physic = [...planets,...bullets];
        
        // Acceleration
        // For all planets and 'bullets'
        for (let index = 0; index < physic.length; index++) {
            const item = physic[index];
            // Step 1 : init acceleration
            ax = 0;
            ay = 0;
            
            if (item.isAffectedByGravity === true) {
                
                // Step 2 : Gravity
                for (const grav of gravity) {
                    // We will try to avoid breaking physics law (that much) by having infinite power due to null distance
                    if ( grav === item )
                    {
                        continue;
                    }
                    const dx = grav.x - item.x;
                    const dy = grav.y - item.y;
                    const distPow = dx * dx + dy * dy;
                    const dist = Math.sqrt(distPow);
                    // It should contain our own mass but we don't care
                    const force = grav.mass / distPow;
                    ax += force * dx / dist;
                    ay += force * dy / dist;
                }
            }
            
            // Step 3 : Apply acceleration
            item.vx += ax;
            item.vy += ay;
            
            // Step 4 : Apply velocity
            item.x += item.vx;
            item.y += item.vy;
            
            // Step 5 : Check that we're in bound now
            const distToCenter = Math.sqrt(item.x * item.x + item.y * item.y);
            if (distToCenter > this.size) {
                // Warning !
            }
            if (distToCenter > 1.1 * this.size) {
                // GAME OVER !
                item.pendingRemoval = true;
            }
        }
        
        // Collision Planet <-> Planet/Bullets
        for (let index = 0; index < planets.length; index++) {
            const planet = planets[index];
            
            // Get others planets
            for (let index2 = index + 1; index2 < planets.length; index2++) {
                const planet2 = planets[index2];
                ApplyElasticColllision(planet, planet2);
            }
            // Get all bullets
            for (const bullet of bullets) {
                if ( canCollide(planet, bullet) ){
                    ApplyColllision(planet, bullet);
                    bullet.pendingRemoval = true;
                }
            }
        }

        // Collision Bullets<->Bullets
        for (const bullet of bullets) {
            for (const bullet2 of bullets) {
                if (bullet !== bullet2 && canCollide(bullet2, bullet) ){
                    bullet.pendingRemoval = true;
                    bullet2.pendingRemoval = true;
                }
            }
        }
    }
    
    /**
     * Remove all element that have been marked as pendingRemoval
     * @memberof Map
     */
    applyRemoval() {
        const keys = Object.keys(this.elements);
        for (const key of keys) {
            /**
             * @type {Array<Physic>}
             */
            const arr = this.elements[key];
            const newArr = [];
            for (const elem of arr) {
                if ( !elem.pendingRemoval )
                {
                    newArr.push(elem);
                }
            }
            this.elements[key] = newArr;
        }
    }
}

module.exports = {
    Map: Map,
}
