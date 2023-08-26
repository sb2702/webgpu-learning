const canvas = document.querySelector("canvas");



async function main() {

    if (!navigator.gpu) return console.log("WebGPU not supported");

    const adapter = await navigator.gpu.requestAdapter();

    if(!adapter) return console.log("Unable to get adapter");
    else console.log("Got WebGPU adapter", adapter);

    const device = await adapter.requestDevice();

    if(!device) return console.log("Unable to get GPU Device");
    else console.log("Got WebGPU Device", device);



    const context = canvas.getContext("webgpu");

    if(!context) return console.log("Unable to get WebGPU context");
    else console.log("Got WebGPU Context", context);

    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    console.log("Canvas format");
    console.log(canvasFormat);

    context.configure({
        device: device,
        format: canvasFormat,
    });

    console.log("Configured canvas");


    const encoder = device.createCommandEncoder();

    console.log("Create GPU command encoder");
    console.log(encoder);

    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            storeOp: "store",
            clearValue: { r: 0.2, g: 0, b: 1, a: 1 }
        }]
    });

    pass.end();

    const commandBuffer = encoder.finish();

    device.queue.submit([commandBuffer]);


}


document.addEventListener("DOMContentLoaded", main);

