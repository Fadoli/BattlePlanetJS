
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

        // For all planets and 'bullets'
        for (const item of items) {
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
            }
        }
    }
}
