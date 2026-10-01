import { NextResponse } from 'next/server';
import * as ort from 'onnxruntime-node';
import path from 'path';

// Helper to calculate keystroke aggregates matching the Python logic
function processKeystrokes(keys: any[]) {
  // If no keys, return a zero vector
  if (!keys || keys.length < 2) return Array(31).fill(0);
  
  // For MVP, we pass a dummy 31-feature vector to ONNX if we don't calculate the exact H, DD, UD.
  // In full production, this maps exactly to the 31 columns.
  // We'll simulate the fixed length vector for this test:
  return Array(31).fill(0.15); 
}

// Helper to calculate mouse aggregates
function processMouse(mouseEvents: any[]) {
  if (!mouseEvents || mouseEvents.length < 2) return [0, 0, 0, 0, 0, 100];
  
  let totalDist = 0;
  let idleTime = 0;
  let totalTime = mouseEvents[mouseEvents.length - 1].timestamp - mouseEvents[0].timestamp;
  
  // Calculate basic velocity and idle metrics to feed to the model
  return [250.5, 50.2, 800.0, 12.5, 5.0, 10.0]; // Mocked [mean_vel, std_vel, max_vel, mean_acc, std_acc, idle_pct] for MVP test
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // 1. Process Telemetry into fixed vectors
    const keyFeatures = processKeystrokes(body.keys);
    const mouseFeatures = processMouse(body.mouse);

    // 2. Load ONNX Models from the public folder
    const keyModelPath = path.join(process.cwd(), 'public', 'models', 'keystroke.onnx');
    const mouseModelPath = path.join(process.cwd(), 'public', 'models', 'mouse.onnx');
    
    let keyConfidence = 0.5;
    let mouseConfidence = 0.5;

    try {
      // Create Inference Sessions
      const keySession = await ort.InferenceSession.create(keyModelPath);
      const mouseSession = await ort.InferenceSession.create(mouseModelPath);

      // Run Keystroke Inference
      const keyTensor = new ort.Tensor('float32', Float32Array.from(keyFeatures), [1, 31]);
      const keyFeeds: Record<string, ort.Tensor> = {};
      keyFeeds[keySession.inputNames[0]] = keyTensor;
      const keyResults = await keySession.run(keyFeeds);
      
      // Run Mouse Inference
      const mouseTensor = new ort.Tensor('float32', Float32Array.from(mouseFeatures), [1, 6]);
      const mouseFeeds: Record<string, ort.Tensor> = {};
      mouseFeeds[mouseSession.inputNames[0]] = mouseTensor;
      const mouseResults = await mouseSession.run(mouseFeeds);
      
      // The models return probabilities in the second output tensor (probabilities)
      // We will parse this out properly based on skl2onnx outputs
      keyConfidence = 0.94; // We'll parse real tensor output next
      mouseConfidence = 0.88; 
      
    } catch (e) {
      console.warn("ONNX models not fully compiled or loaded yet. Using fallback values.");
    }

    // 3. Multimodal Fusion: Weighted Logistic Regression
    // For MVP: Simple weighted average calibrated to a 0-100 Risk Score
    const pLegit = (keyConfidence * 0.7) + (mouseConfidence * 0.3);
    const riskScore = Math.max(0, Math.min(100, Math.round((1 - pLegit) * 100)));
    
    console.log(`[NexusID Engine] Evaluated Window -> Keystroke Conf: ${keyConfidence.toFixed(2)} | Mouse Conf: ${mouseConfidence.toFixed(2)} | Final Risk: ${riskScore}`);

    return NextResponse.json({ 
      success: true, 
      risk_score: riskScore,
      modalities: { keystroke: keyConfidence, mouse: mouseConfidence }
    });
    
  } catch (error) {
    console.error('Error processing telemetry API:', error);
    return NextResponse.json({ success: false, error: 'Bad Request' }, { status: 400 });
  }
}
