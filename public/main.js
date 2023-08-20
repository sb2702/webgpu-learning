


console.log("Hello world");

navigator.gpu.requestAdapter().then(function (adapter) {

    console.log("Got WebGPU adapter")

    console.log(adapter);

});

