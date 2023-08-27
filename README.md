# WebGPU Playground

Basic playground exercises that I used to learn how to do image processing in WebGPU, using help from [Google Code Labs](https://codelabs.developers.google.com/your-first-webgpu-app),  and [WebGPU Fundamentals](https://webgpufundamentals.org/webgpu/lessons/)

The repo is divided into a few basic test exercises in this order

* [1](public/1/) - Render a black screen to a canvas (Hello world)
* [2](public/2/) - Render a red square on top of a black screen
* [texture-loading](public/texture-loading/) - Load an image texture into the canvas and display it
* [yuv](public/yuv/) - Render a convert an image texture from RGB colorspace to YUV
* [gaussian](public/gaussian/) - Apply a gaussian blur to an image texture
* [sequence](public/sequence/) - Apply a sequence of image operations (convert to YUV in the first render pass, then apply gaussian blur in the second render pass) and paint the result to screen


Working up to [sequence](public/sequence/) executution of various image processing tasks should be enough of a basis to begin actully writing a basic neural network implementation in WebGPU (Coming soon, in a seperate repository)
