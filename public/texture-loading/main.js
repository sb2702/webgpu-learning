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



    const dest_view = context.getCurrentTexture().createView();



    const cellShaderModule = device.createShaderModule({
        label: "Cell shader",
        code: `
        
        struct OurVertexShaderOutput {
          @builtin(position) position: vec4f,
          @location(0) texcoord: vec2f,
        };
        
        
        @vertex
        fn vertexMain( @builtin(vertex_index) vertexIndex : u32) ->  OurVertexShaderOutput{
            let pos = array(
            // 1st triangle
            vec2f( -1.0,  -1.0),  // center
            vec2f( 1.0,  -1.0),  // right, center
            vec2f( -1.0,  1.0),  // center, top
         
            // 2st triangle
            vec2f( -1.0,  1.0),  // center, top
            vec2f( 1.0,  -1.0),  // right, center
            vec2f( 1.0,  1.0),  // right, top
          );
         
          var vsOutput: OurVertexShaderOutput;
          let xy = pos[vertexIndex];
          vsOutput.position = vec4f(xy, 0.0, 1.0);
          vsOutput.texcoord = xy;
          return vsOutput;
        }
    
    
    
        @group(0) @binding(0) var ourSampler: sampler;
        @group(0) @binding(1) var ourTexture: texture_2d<f32>;
        
        @fragment
        fn fragmentMain(fsInput: OurVertexShaderOutput) -> @location(0) vec4f {
           return textureSample(ourTexture, ourSampler, fsInput.texcoord);
        }
  `
    });



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

    const sampler = device.createSampler();





    const cellPipeline = device.createRenderPipeline({
        label: "Cell pipeline",
        layout: "auto",
        vertex: {
            module: cellShaderModule,
            entryPoint: "vertexMain"
        },
        fragment: {
            module: cellShaderModule,
            entryPoint: "fragmentMain",
            targets: [{
                format: canvasFormat
            }]
        }
    });



        const bindGroup = device.createBindGroup({
            layout: cellPipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: sampler },
                { binding: 1, resource: imgTexture.createView() },
            ],
        });



           const encoder = device.createCommandEncoder();

             console.log("Create GPU command encoder");
             console.log(encoder);







             console.log("Create render pass");

             const pass = encoder.beginRenderPass({
                 label: 'Basic render pass',
                 colorAttachments: [{
                     view: dest_view,
                     loadOp: "clear",
                     storeOp: "store"
                 }]
             });


             console.log(pass);


             pass.setPipeline(cellPipeline);
             pass.setBindGroup(0, bindGroup);
             pass.draw(6); // 6 vertices


             pass.end();

             const commandBuffer = encoder.finish();

             console.log("Finish encoder");

             device.queue.submit([commandBuffer]);

             console.log(device);


}


document.addEventListener("DOMContentLoaded", main);

