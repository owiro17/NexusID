import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // This console.log will print directly to your terminal where 'npm run dev' is running
    console.log('\n--- 🛡️ New Telemetry Window Received ---');
    console.log(`Time Window: ${new Date(body.windowStartTime).toISOString()} -> ${new Date(body.windowEndTime).toISOString()}`);
    console.log(`Total Key Events: ${body.keys.length}`);
    console.log(`Total Mouse Events: ${body.mouse.length}`);
    
    if (body.keys.length > 0) {
      console.log('Sample Key Events (first 3):', body.keys.slice(0, 3));
    }
    if (body.mouse.length > 0) {
      console.log('Sample Mouse Events (first 3):', body.mouse.slice(0, 3));
    }
    console.log('----------------------------------------\n');

    // Return a mock risk score between 0 and 30 for now so the UI updates
    const mockRiskScore = Math.floor(Math.random() * 30);
    
    return NextResponse.json({ success: true, risk_score: mockRiskScore });
  } catch (error) {
    console.error('Error processing telemetry API:', error);
    return NextResponse.json({ success: false, error: 'Bad Request' }, { status: 400 });
  }
}
