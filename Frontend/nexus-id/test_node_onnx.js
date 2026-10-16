const ort = require('onnxruntime-node');
const path = require('path');

async function test() {
  const keyModelPath = path.join(__dirname, 'public', 'models', 'keystroke.onnx');
  const keySession = await ort.InferenceSession.create(keyModelPath);
  console.log("Key output names in model:", keySession.outputNames);

  // Human keystroke data: [mean_hold, std_hold, mean_dd, std_dd, mean_ud, std_ud]
  const keyData = Float32Array.from([0.115, 0.022, 0.450, 0.350, 0.330, 0.350]);
  const keyTensor = new ort.Tensor('float32', keyData, [1, 6]);
  const keyOut = await keySession.run({ float_input: keyTensor });
  console.log("Returned output keys:", Object.keys(keyOut));
  for (const k of Object.keys(keyOut)) {
    console.log(`Key ${k}:`, keyOut[k].data);
  }
}

test();
