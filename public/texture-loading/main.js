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




    const vertices = new Float32Array([
//   X,    Y,
        -0.8, -0.8, // Triangle 1 (Blue)
        0.8, -0.8,
        0.8,  0.8,

        -0.8, -0.8, // Triangle 2 (Red)
        0.8,  0.8,
        -0.8,  0.8,
    ]);

    console.log("Create a Vertex Buffer");

    const vertexBuffer = device.createBuffer({
        label: "Cell vertices",
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    console.log(vertexBuffer);

    console.log("Writing Vertex Buffer to device");

    device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/0, vertices);


    const vertexBufferLayout = {
        arrayStride: 8,
        attributes: [{
            format: "float32x2",
            offset: 0,
            shaderLocation: 0, // Position, see vertex shader
        }],
    };


    const cellShaderModule = device.createShaderModule({
        label: "Cell shader",
        code: `
        @vertex
        fn vertexMain(@location(0) pos: vec2f) ->
          @builtin(position) vec4f {
          return vec4f(pos, 0, 1);
        }
    
        @fragment
        fn fragmentMain() -> @location(0) vec4f {
          return vec4f(1, 0, 0, 1);
        }
  `
    });


    const cellPipeline = device.createRenderPipeline({
        label: "Cell pipeline",
        layout: "auto",
        vertex: {
            module: cellShaderModule,
            entryPoint: "vertexMain",
            buffers: [vertexBufferLayout]
        },
        fragment: {
            module: cellShaderModule,
            entryPoint: "fragmentMain",
            targets: [{
                format: canvasFormat
            }]
        }
    });


    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            storeOp: "store"
        }]
    });



    pass.setPipeline(cellPipeline);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.draw(vertices.length / 2); // 6 vertices


    pass.end();

    const commandBuffer = encoder.finish();

    device.queue.submit([commandBuffer]);




    // Defining this as a separate function because we'll be re-using it a lot.
    function webGPUTextureFromImageBitmapOrCanvas(gpuDevice, source) {
        const textureDescriptor = {
            // Unlike in WebGL, the size of our texture must be set at texture creation time.
            // This means we have to wait until the image is loaded to create the texture, since we won't
            // know the size until then.
            size: { width: source.width, height: source.height },
            format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
        };

        console.log("Created texture descriptor");
        console.log(textureDescriptor);

        const texture = gpuDevice.createTexture(textureDescriptor);

        console.log(texture);

        console.log("Sending to device");

        gpuDevice.queue.copyExternalImageToTexture({ source }, { texture }, textureDescriptor.size);

        return texture;
    }

    async function webGPUTextureFromImageUrl(gpuDevice, url) { // Note that this is an async function

        console.log("Loading img from url ", url);
        const response = await fetch(url);
        const blob = await response.blob();
        console.log("Got blob", blob);
        const imgBitmap = await createImageBitmap(blob);

        console.log("Created bitmap ", imgBitmap);
        return webGPUTextureFromImageBitmapOrCanvas(gpuDevice, imgBitmap);
    }


    console.log("Fetching img texture");
    const imgTexture = await  webGPUTextureFromImageUrl(device, './test-img.png');

    console.log(imgTexture);




}


document.addEventListener("DOMContentLoaded", main);

