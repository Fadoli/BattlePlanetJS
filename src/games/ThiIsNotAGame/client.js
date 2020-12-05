// This is to maybe have more completion on your IDE
// import * as PIXI from 'pixi.js'

// RenderSize, populate app, and add it to the webpage
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

// Add Resize events
let lastUpdate;
function resize(w,h) {
    if ( Date.now() - lastUpdate < 100 ) {
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
window.onresize = () => {
    checkResize();
};

// Create sprite holder, 5000 should be plenty
const sprites = new PIXI.ParticleContainer(5000, {
    scale: true,
    position: true,
    rotation: true,
    uvs: true,
    alpha: true,
});
// Add the damn sprites to the display
app.stage.addChild(sprites);
