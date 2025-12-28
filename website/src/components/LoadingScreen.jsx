import React from 'react';

const LoadingScreen = () => {
  return (
    <div className="min-h-screen bg-titanium-50 flex flex-col items-center justify-center p-6 gap-8 animate-scale-in">
      <div className="relative group">
        {/* Modern Minimalist Spinner */}
        <div className="w-24 h-24 rounded-full border-[3px] border-titanium-200" />
        <div className="absolute inset-0 w-24 h-24 rounded-full border-[3px] border-action-primary border-t-transparent animate-spin shadow-lg shadow-action-primary/10" />
        
        {/* Inner static hub */}
        <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3 h-3 bg-titanium-300 rounded-full animate-pulse" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-2">
        <span className="text-[10px] font-black text-titanium-400 tracking-[0.4em] uppercase">Initialising System</span>
        <h2 className="text-xl font-bold text-titanium-900 tracking-tight font-display">Nullspace</h2>
      </div>

      {/* Subtle Progress Indicator */}
      <div className="w-48 h-1 bg-titanium-100 rounded-full overflow-hidden">
        <div className="h-full bg-titanium-900 w-1/3 animate-[shimmer_2s_infinite_linear]" 
             style={{ 
                backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)' 
             }} />
      </div>
    </div>
  );
};

export default LoadingScreen;
