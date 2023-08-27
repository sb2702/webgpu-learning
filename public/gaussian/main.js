
async function main() {


    /* ------------------ Get WebGPU ------------------------------ */

    if(!navigator.gpu) return console.log('Browser does not support WebGPU');

    const adapter = await navigator.gpu?.requestAdapter();
    if (!adapter) return console.warn('Unable to load WebGPU Adapter');

    const device = await adapter?.requestDevice();
    if (!device) return console.warn('Unable to get a WebGPU device');


    /* ------------------ Initial Set up ------------------------------*/


    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('webgpu');
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();


    context.configure({device,  format: presentationFormat });



    /* ----------------- RGB 2 YUV Buffer ------------------------*/


    const rgb2yuv = new Float32Array([
        0.299, -0.1473, 0.615, 1.0,
        0.587, -.2886, -.51499, 1.0,
        0.114,  0.436, -.1001, 1.0
    ]);

    const rgb2yuvBuffer= device.createBuffer({
        label: "RGB to YUV Conversion Matrix Buffer",
        size: rgb2yuv.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(rgb2yuvBuffer, /*bufferOffset=*/0, rgb2yuv);



    /* ----------------- Write Vertex Buffer ------------------------*/


    const vertices = new Float32Array([
        -1.0, -1.0,
        1.0, -1.0,
        1.0,  1.0,

        -1.0, -1.0,
        1.0,  1.0,
        -1.0,  1.0,
    ]);



    const vertexBuffer = device.createBuffer({
        label: "Cell vertices",
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });


    device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/0, vertices);


    const vertexBufferLayout = {
        arrayStride: 8,
        attributes: [{
            format: "float32x2",
            offset: 0,
            shaderLocation: 0, // Position, see vertex shader
        }],
    };


    /* ----------------- Texture ------------------------*/


    const texture = device.createTexture({
        label: 'Input Image',
        size: [256, 256],
        format: 'rgba8unorm',
        usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
    });


    const response = await fetch('./test-img.png');
    const blob = await response.blob();
    const imgBitmap = await createImageBitmap(blob);

    device.queue.copyExternalImageToTexture({source: imgBitmap}, {texture}, [256, 256])


    /* ----------------- Shader ------------------------*/


    const module = device.createShaderModule({
        label: 'Shader Module',
        code: `

      struct VertexShaderOutput {
        @builtin(position) position: vec4f,
        @location(0) tex_coord: vec2f,
      };

      @vertex fn vertexMain(@location(0) pos: vec2f) -> VertexShaderOutput {
        var vsOutput: VertexShaderOutput;
        vsOutput.position = vec4f(pos, 0.0, 1.0);
        vsOutput.tex_coord = pos;
        return vsOutput;
      }

      @group(0) @binding(0) var<uniform> rgb2yuv: mat3x3f;
      @group(0) @binding(1) var ourSampler: sampler;
      @group(0) @binding(2) var ourTexture: texture_2d<f32>;

      @fragment fn fragmentMain(input: VertexShaderOutput) -> @location(0) vec4f {
      
        let tex_pos = input.tex_coord*0.5+0.5;
        
        
          
        
        var val  = 0.0;
        
          let kernel_offsets = array(
            vec2f( -1.0,  -1.0),  
            vec2f( 0.0,  -1.0),  
            vec2f( 1.0,  -1.0),  
            vec2f( -1.0,  0.0),  
            vec2f( 0.0,  0.0),  
            vec2f( 1.0,  0.0),  
            vec2f( -1.0,  -1.0),  
            vec2f( 0.0,  -1.0),  
            vec2f( 1.0,  -1.0),  
          );
          
          
         let gaussian = array(
            0.0675,
            0.125,
            0.0675,
            0.125,
            0.250,
            0.125,
            0.0675,
            0.125,
            0.0675
          );
          
          
          let resolution = vec2f(256.0, 256.0);
        
        
        
         for(var i = 0u; i < 9; i++){
            let offset = kernel_offsets[i]/resolution;
            
            let color  = textureSample(ourTexture, ourSampler, tex_pos + offset);
            
            let yuv =  color.xyz*transpose(rgb2yuv);
            let y = yuv.x;
            
            val += y*gaussian[i];
          
        } 
      
        
        return vec4f(val, val, val, 1.0);
      }
    `,
    });

    /* ----------------- Pipeline------------------------*/


    const pipeline = device.createRenderPipeline({
        label: 'hardcoded textured quad pipeline',
        layout: 'auto',
        vertex: {
            module,
            entryPoint: 'vertexMain',
            buffers: [vertexBufferLayout]
        },
        fragment: {
            module,
            entryPoint: 'fragmentMain',
            targets: [{ format: presentationFormat }],
        },
    });
    

    const sampler = device.createSampler();


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



    /* -----------  Render Code -------------------*/


    const encoder = device.createCommandEncoder({
        label: 'Render YUV Image',
    });
    const pass = encoder.beginRenderPass(renderPassDescriptor);
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6);  // call our vertex shader 6 times
    pass.end();

    const commandBuffer = encoder.finish();
    device.queue.submit([commandBuffer]);


}





document.addEventListener("DOMContentLoaded", main);

