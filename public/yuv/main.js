const canvas = document.querySelector("canvas");



async function main() {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    if (!device) {
        fail('need a browser that supports WebGPU');
        return;
    }

    // Get a WebGPU context from the canvas and configure it
    const canvas = document.querySelector('canvas');
    const context = canvas.getContext('webgpu');
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device,
        format: presentationFormat,
    });

    // mat3x3f(0.299, -.1473, 0.615, 0.587, -.28886, -.51499, 0.114, 0.436, -0.1001);

    const rgb2yuv = new Float32Array([
        0.299, -0.1473, 0.615, 1.0,
        0.587, -.2886, -.51499, 1.0,
        0.114,  0.436, -.1001, 1.0
    ]);


    console.log(rgb2yuv);


    console.log("Create a Uniform buffer Buffer");

    const rgb2yuvBuffer= device.createBuffer({
        label: "Cell vertices",
        size: rgb2yuv.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    console.log(rgb2yuvBuffer);

    console.log("Writing Uniform Buffer to device");

    device.queue.writeBuffer(rgb2yuvBuffer, /*bufferOffset=*/0, rgb2yuv);

    const module = device.createShaderModule({
        label: 'our hardcoded textured quad shaders',
        code: `
      struct OurVertexShaderOutput {
        @builtin(position) position: vec4f,
        @location(0) texcoord: vec2f,
      };

      @vertex fn vs(
        @builtin(vertex_index) vertexIndex : u32
      ) -> OurVertexShaderOutput {
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

      @group(0) @binding(0) var<uniform> rgb2yuv: mat3x3f;
      @group(0) @binding(1) var ourSampler: sampler;
      @group(0) @binding(2) var ourTexture: texture_2d<f32>;



      @fragment fn fs(fsInput: OurVertexShaderOutput) -> @location(0) vec4f {
      
        let color  = textureSample(ourTexture, ourSampler, fsInput.texcoord*0.5+0.5);
        
        let yuv = color.xyz*transpose(rgb2yuv);
        
        let y =  yuv.x;
        
        return vec4f(y, y, y, 1.0);
      }
    `,
    });




    const pipeline = device.createRenderPipeline({
        label: 'hardcoded textured quad pipeline',
        layout: 'auto',
        vertex: {
            module,
            entryPoint: 'vs',
        },
        fragment: {
            module,
            entryPoint: 'fs',
            targets: [{ format: presentationFormat }],
        },
    });


    const texture = device.createTexture({
        label: 'yellow F on red',
        size: [256, 256],
        format: 'rgba8unorm',
        usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
    });


    const response = await fetch('./test-img.png');
    const blob = await response.blob();
    console.log("Got blob", blob);
    const imgBitmap = await createImageBitmap(blob);

    device.queue.copyExternalImageToTexture({source: imgBitmap}, {texture}, [256, 256])

    const sampler = device.createSampler();

    console.log("Bind group layout");
    console.log(pipeline.getBindGroupLayout(0));


    const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: {buffer: rgb2yuvBuffer} },
            { binding: 1, resource: sampler },
            { binding: 2, resource: texture.createView() },

        ],
    });


    const renderPassDescriptor = {
        label: 'our basic canvas renderPass',
        colorAttachments: [
            {
                view:  context.getCurrentTexture().createView(),
                clearValue: [0, 0, 0, 1],
                loadOp: 'clear',
                storeOp: 'store',
            },
        ],
    };



    const encoder = device.createCommandEncoder({
        label: 'render quad encoder',
    });
    const pass = encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6);  // call our vertex shader 6 times
    pass.end();

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);

    /*












           function render() {
            // Get the current texture from the canvas context and
            // set it as the texture to render to.

        }

        render();



     */


}





document.addEventListener("DOMContentLoaded", main);

