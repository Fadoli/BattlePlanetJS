
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
 * We will be modifying the a and b object with the resulting velocity !
 * @param {Physic} a
 * @param {Physic} b
 */
function ApplyCollision(a, b) {
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
 * How a map is structured :)
 * @export
 * @class Map
 */
export class Map {
    /**
     * Creates an instance of Map.
     * @param {number} size
     * @memberof Map
     */
    constructor(size) {
        this.size = size;
        this._suns = [];
        this._physics = [];
    }

    /**
     * The list of the suns
     * @returns {Array<Physic>}
     * @memberof Map
     */
    suns() {
        return this._suns;
    }
    /**
     * The list of the physic objects
     * @returns {Array<Physic>}
     * @memberof Map
     */
    physics() {
        return this._physics;
    }

    applyPhysic() {
        let ax, ay;

        const items = this.physics();
        const suns = this.suns();

        const removePhys = {};

        // Acceleration
        // For all planets and 'bullets'
        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            // Step 1 : init acceleration
            ax = 0;
            ay = 0;

            // Step 2 : Gravity
            for (const sun of suns) {
                const dx = sun.x - item.x;
                const dy = sun.y - item.y;
                const distPow = dx * dx + dy * dy;
                const dist = Math.sqrt(distPow);
                // It should contain our own mass but we don't care
                const force = sun.mass / distPow;
                ax += force * dx / dist;
                ay += force * dy / dist;
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
                removePhys[index] = true;
            }
        }

        // Collision
        // For all planets and 'bullets'
        for (let index = 0; index < items.length; index++) {
            const item = items[index];

            // Get all the others ... (a lot of them)
            for (let index2 = index + 1; index2 < items.length; index2++) {
                const item2 = items[index2];

                const collisionInfo = ApplyCollision(item, item2);
                if (collisionInfo) {
                    // The other one will die
                    if (item.mass > 10 * item2.mass) {
                        removePhys[index2] = true;
                    }
                    // We will be dieing
                    if (10 * item.mass < item2.mass) {
                        removePhys[index] = true;
                    }
                }
            }
        }
    }
}
