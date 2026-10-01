'use client';

import { useTelemetry } from '@/hooks/useTelemetry';

export default function DashboardPage() {
  // Initialize the telemetry hook (runs silently in the background)
  const { currentRiskScore } = useTelemetry(5000); 

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* Risk Indicator Panel (Visible for demo purposes) */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Session Security Status</h3>
          <p className="text-gray-900 mt-1">Continuous Verification Active</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-emerald-600">
            {currentRiskScore}% Risk
          </div>
          <p className="text-sm text-gray-500 mt-1">Updates every 5s</p>
        </div>
      </div>

      {/* Banking Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h4 className="text-sm font-medium text-gray-500">Checking Account</h4>
          <p className="text-2xl font-bold text-gray-900 mt-2">$24,500.00</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h4 className="text-sm font-medium text-gray-500">Savings Account</h4>
          <p className="text-2xl font-bold text-gray-900 mt-2">$82,100.50</p>
        </div>
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h4 className="text-sm font-medium text-gray-500">Recent Transfers</h4>
          <p className="text-2xl font-bold text-gray-900 mt-2">3 Pending</p>
        </div>
      </div>

      {/* Quick Transfer Form (To generate keystroke/mouse data) */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Transfer</h3>
        <form className="space-y-4 max-w-md">
          <div>
            <label className="block text-sm font-medium text-gray-700">Recipient Account Number</label>
            <input 
              type="text" 
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
              placeholder="000-123-4567"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Amount ($)</label>
            <input 
              type="number" 
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
              placeholder="0.00"
            />
          </div>
          <button 
            type="button" 
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            onClick={(e) => {
              e.preventDefault();
              alert(currentRiskScore > 70 ? 'Access Denied: High Risk Session Detected.' : 'Transfer Initiated!');
            }}
          >
            Send Funds
          </button>
        </form>
      </div>

    </div>
  );
}
