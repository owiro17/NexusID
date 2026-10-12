'use client';

import { useState } from 'react';

type StepUpModalProps = {
  isOpen: boolean;
  onVerify: (method: 'passkey' | 'otp') => void;
  onCancel: () => void;
};

export default function StepUpModal({ isOpen, onVerify, onCancel }: StepUpModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 transform transition-all border border-gray-100">
        
        <div className="flex items-center justify-center w-12 h-12 bg-red-100 rounded-full mb-6 mx-auto">
          <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <h3 className="text-xl font-bold text-center text-gray-900 mb-2">Unusual Activity Detected</h3>
        <p className="text-center text-gray-500 mb-8 text-sm leading-relaxed">
          Our Zero Trust engine detected a change in your normal typing or mouse patterns. To protect your funds, please verify your identity to continue.
        </p>

        <div className="space-y-3">
          <button 
            onClick={() => onVerify('passkey')}
            className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 text-white font-medium rounded-xl hover:bg-blue-700 focus:ring-4 focus:ring-blue-100 transition-all"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            Use Passkey (FaceID / TouchID)
          </button>
          
          <button 
            onClick={() => onVerify('otp')}
            className="w-full flex items-center justify-center px-4 py-3 bg-white text-gray-700 font-medium rounded-xl border border-gray-300 hover:bg-gray-50 focus:ring-4 focus:ring-gray-100 transition-all"
          >
            <svg className="w-5 h-5 mr-2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
            Send OTP to Mobile
          </button>
        </div>

        <button 
          onClick={onCancel}
          className="mt-6 w-full text-sm text-gray-500 hover:text-gray-800 text-center transition-colors"
        >
          Cancel Transaction
        </button>
      </div>
    </div>
  );
}
