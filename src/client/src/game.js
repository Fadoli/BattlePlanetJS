// This is to maybe have more completion on your IDE, vscode handles it fines without
// import * as PIXI from 'pixi.js'

const defaultSize = {
    width: 1024,
    height: 700,
}

const app = new PIXI.Application({
    backgroundColor: 0x111111,
    width: defaultSize.width,
    height: defaultSize.height
});


$("#gameRender").append(app.view);

const sprites = new PIXI.ParticleContainer(10000, {
    scale: true,
    position: true,
    rotation: true,
    uvs: true,
    alpha: true,
});
app.stage.addChild(sprites);
let lastUpdate;

function resize(w,h) {
    if ( Date.now() - lastUpdate < 100 ) {
        console.log("ANTI SPAM !")
        return;
    }
    lastUpdate = Date.now();
    const ratio_h = h / defaultSize.height;
    const ratio_w = w / defaultSize.width;
    
    const scale = Math.min(ratio_w,ratio_h);
    const width = defaultSize.width * scale;
    const height= defaultSize.height * scale;
    
    app.view.style.width = width + 'px';
    app.view.style.height = height + 'px';
}


function checkResize () {
    const elem = document.getElementById("main");
    const h = elem.offsetHeight;
    const w = elem.offsetWidth;
    resize(w,h)
}
$( document ).ready(() => {
    checkResize();
});
window.onresize = (ev) => {
    checkResize();
};

// create an array to store all the sprites
const maggots = [];

const totalSprites = app.renderer instanceof PIXI.Renderer ? 5000 : 100;

for (let i = 0; i < totalSprites; i++) {
    // create a new Sprite
    const dude = PIXI.Sprite.from('res/maggot_tiny.png');
    
    dude.tint = Math.random() * 0xE8D4CD;
    
    // set the anchor point so the texture is centerd on the sprite
    dude.anchor.set(0.5);
    
    // different maggots, different sizes
    dude.scale.set(0.8 + Math.random() * 0.3);
    
    // scatter them all
    dude.x = Math.random() * app.screen.width;
    dude.y = Math.random() * app.screen.height;
    
    dude.tint = Math.random() * 0x808080;
    
    // create a random direction in radians
    dude.direction = Math.random() * Math.PI * 2;
    
    // this number will be used to modify the direction of the sprite over time
    dude.turningSpeed = Math.random() - 0.8;
    
    // create a random speed between 0 - 2, and these maggots are slooww
    dude.speed = (2 + Math.random() * 2) * 0.2;
    
    dude.offset = Math.random() * 100;
    
    // finally we push the dude into the maggots array so it it can be easily accessed later
    maggots.push(dude);
    
    sprites.addChild(dude);
}

// create a bounding box box for the little maggots
const dudeBoundsPadding = 100;


let tick = 0;

app.ticker.add(() => {
    
    const dudeBounds = new PIXI.Rectangle(
        -dudeBoundsPadding,
        -dudeBoundsPadding,
        app.screen.width + 2*dudeBoundsPadding,
        app.screen.height + 2*dudeBoundsPadding);
        
        // iterate through the sprites and update their position
        for (let i = 0; i < maggots.length; i++) {
            const dude = maggots[i];
            dude.scale.y = 0.95 + Math.sin(tick + dude.offset) * 0.05;
            dude.direction += dude.turningSpeed * 0.01;
            dude.x += Math.sin(dude.direction) * (dude.speed * dude.scale.y);
            dude.y += Math.cos(dude.direction) * (dude.speed * dude.scale.y);
            dude.rotation = -dude.direction + Math.PI;
            
            // wrap the maggots
            if (dude.x < dudeBounds.x) {
                dude.x += dudeBounds.width;
            } else if (dude.x > dudeBounds.x + dudeBounds.width) {
                dude.x -= dudeBounds.width;
            }
            
            if (dude.y < dudeBounds.y) {
                dude.y += dudeBounds.height;
            } else if (dude.y > dudeBounds.y + dudeBounds.height) {
                dude.y -= dudeBounds.height;
            }
        }
        
        // increment the ticker
        tick += 0.1;
    });
    