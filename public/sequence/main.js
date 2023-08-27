
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



    // ===============   RGB 2 YUV Operation ==========================//


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


    /* ----------------- Storage Texture ------------------------*/


    const storageTexture = device.createTexture({
        label: 'Input Image',
        size: [256, 256],
        format: 'rgba8unorm',
        usage:
            GPUTextureUsage.TEXTURE_BINDING |
            GPUTextureUsage.COPY_DST |
            GPUTextureUsage.RENDER_ATTACHMENT,
    });



    /* ----------------- Input Texture ------------------------*/

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


    const rgb2yuv_shader = device.createShaderModule({
        label: 'RGB 2 YUV',
        code: `

      struct VertexShaderOutput {
        @builtin(position) position: vec4f,
        @location(0) tex_coord: vec2f,
      };

      @vertex fn vertexMain(@location(0) pos: vec2f) -> VertexShaderOutput {
        var vsOutput: VertexShaderOutput;
        vsOutput.position = vec4f(pos, 0.0, 1.0);
        vsOutput.tex_coord = pos*0.5 + 0.5;
        return vsOutput;
      }

      @group(0) @binding(0) var<uniform> rgb2yuv: mat3x3f;
      @group(0) @binding(1) var ourSampler: sampler;
      @group(0) @binding(2) var ourTexture: texture_2d<f32>;

      @fragment fn fragmentMain(input: VertexShaderOutput) -> @location(0) vec4f {
      
    
        let color = textureSample(ourTexture, ourSampler, input.tex_coord);
        
        let yuv = rgb2yuv*color.xyz;
  
        return vec4f(yuv, 1.0);
      }
    `,
    });

    /* ----------------- Pipeline------------------------*/


    const rgb2yuv_pipeline = device.createRenderPipeline({
        label: 'RGB 2 YUV Pipeline',
        layout: 'auto',
        vertex: {
            module: rgb2yuv_shader,
            entryPoint: 'vertexMain',
            buffers: [vertexBufferLayout]
        },
        fragment: {
            module: rgb2yuv_shader,
            entryPoint: 'fragmentMain',
            targets: [{ format:  storageTexture.format}],
        },
    });


    const sampler = device.createSampler();


    const rgb2yuv_bind_group = device.createBindGroup({
        layout: rgb2yuv_pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: {buffer: rgb2yuvBuffer} },
            { binding: 1, resource: sampler },
            { binding: 2, resource: texture.createView() },

        ],
    });

    const rgb2yuv_render_pass = {
        label: 'our basic canvas renderPass',
        colorAttachments: [
            {
                view:  storageTexture.createView(),
                clearValue: [0, 0, 0, 1],
                loadOp: 'clear',
                storeOp: 'store',
            },
        ],
    };



    /* -----------  Render Pass 1 (Storage to YUV) -------------------*/


    const rgb2yuv_encoder = device.createCommandEncoder({
        label: 'Render YUV Image',
    });
    const rgb2yuv_pass = rgb2yuv_encoder.beginRenderPass(rgb2yuv_render_pass);
    rgb2yuv_pass.setPipeline(rgb2yuv_pipeline);
    rgb2yuv_pass.setVertexBuffer(0, vertexBuffer);
    rgb2yuv_pass.setBindGroup(0, rgb2yuv_bind_group);
    rgb2yuv_pass.draw(6);  // call our vertex shader 6 times
    rgb2yuv_pass.end();

    device.queue.submit([rgb2yuv_encoder.finish()]);



    // ===============   Gaussian Blur Operation ==========================//



    /* ---------------- Gaussian Buffer ---------------------------*/

    const gaussianBufferValues = new Float32Array([
        0.0675,  0.125,  0.0675, 0.0,
        0.125,  0.250,  0.1250, 0.0,
        0.0675,  0.125,  0.0675 , 0.0
    ]);

    const gaussianBuffer= device.createBuffer({
        label: "Guassian Buffer Kernel",
        size: gaussianBufferValues.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });



    device.queue.writeBuffer(gaussianBuffer, /*bufferOffset=*/0, gaussianBufferValues);



    /* ---------------- Gaussian Buffer ---------------------------*/

    const kernelOffsetsValue = new Float32Array([
        -1/256, -1/256, 0, 0,
        0     , -1/256, 0, 0,
        1/256 , -1/256, 0, 0,
        -1/256,      0, 0, 0,
        0     ,      0, 0, 0,
        1/256 ,      0, 0, 0,
        -1/256,  1/256, 0, 0,
        0     ,  1/256, 0, 0,
        1/256 ,  1/256, 0, 0,
    ]);


    const kernelOffsetsBuffer= device.createBuffer({
        label: "Guassian Buffer Kernel",
        size: kernelOffsetsValue.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });



    device.queue.writeBuffer(kernelOffsetsBuffer, /*bufferOffset=*/0, kernelOffsetsValue);



    /* -------------------------- Shader -----------------------*/


    const gaussian_blur_shader = device.createShaderModule({
        label: 'Gaussian Blur Module',
        code: `

      struct VertexShaderOutput {
        @builtin(position) position: vec4f,
        @location(0) tex_coord: vec2f,
      };

      @vertex fn vertexMain(@location(0) pos: vec2f) -> VertexShaderOutput {
        var vsOutput: VertexShaderOutput;
        vsOutput.position = vec4f(pos, 0.0, 1.0);
        vsOutput.tex_coord = (pos*0.5 + 0.5);
        
        vsOutput.tex_coord.y = - 1.0* vsOutput.tex_coord.y  + 1.0;
        return vsOutput;
      }

      @group(0) @binding(0) var<uniform> gaussian: array<vec3f, 3>;
      @group(0) @binding(1) var<uniform> kernel_offsets: array<vec4f, 9>;
      @group(0) @binding(2) var ourSampler: sampler;
      @group(0) @binding(3) var ourTexture: texture_2d<f32>;

      @fragment fn fragmentMain(input: VertexShaderOutput) -> @location(0) vec4f {
      
         var val  = 0.0;
          
         for(var i = 0u; i < 3; i++){
         
            let a = vec3f(
                textureSample(ourTexture, ourSampler, input.tex_coord + kernel_offsets[i*3].xy).x,
                textureSample(ourTexture, ourSampler, input.tex_coord + kernel_offsets[i*3+1].xy).x,
                textureSample(ourTexture, ourSampler, input.tex_coord + kernel_offsets[i*3+2].xy).x
            );
            
            val += dot(a, gaussian[i]);
          
        } 
      
        
        return vec4f(val, val, val, 1.0);
      }
    `,
    });


    const gaussian_blur_pipeline = device.createRenderPipeline({
        label: 'Guassian Blur Pipeline',
        layout: 'auto',
        vertex: {
            module: gaussian_blur_shader,
            entryPoint: 'vertexMain',
            buffers: [vertexBufferLayout]
        },
        fragment: {
            module: gaussian_blur_shader,
            entryPoint: 'fragmentMain',
            targets: [{ format:  presentationFormat}],
        },
    });



    const gausian_blur_bind_group= device.createBindGroup({
        layout: gaussian_blur_pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: {buffer: gaussianBuffer} },
            { binding: 1, resource: {buffer: kernelOffsetsBuffer} },
            { binding: 2, resource: sampler },
            { binding: 3, resource: storageTexture.createView() },

        ],
    });

    const gaussian_render_pass = {
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



    const gaussian_encoder = device.createCommandEncoder({
        label: 'Gaussian Blur',
    });

    const gaussian_pass = gaussian_encoder.beginRenderPass(gaussian_render_pass);
    gaussian_pass.setPipeline(gaussian_blur_pipeline);
    gaussian_pass.setVertexBuffer(0, vertexBuffer);
    gaussian_pass.setBindGroup(0, gausian_blur_bind_group);
    gaussian_pass.draw(6);  // call our vertex shader 6 times
    gaussian_pass.end();

    device.queue.submit([ gaussian_encoder.finish()]);


}





document.addEventListener("DOMContentLoaded", main);

