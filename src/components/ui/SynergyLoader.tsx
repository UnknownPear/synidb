import React from "react";

type Props = {
  scale?: number;
  loop?: boolean;
};

export default function SynergyLoader({ scale = 1, loop = false }: Props) {
  return (
    <div className="flex items-center justify-center gap-2" style={{ transform: `scale(${scale})` }}>
      {/* Global Definitions for Gradients */}
      <svg height="0" width="0" viewBox="0 0 64 64" className="absolute">
        <defs>
          <linearGradient id="grad-b" gradientUnits="userSpaceOnUse" y2="2" x2="0" y1="62" x1="0">
            <stop stopColor="#1e3a8a"></stop>
            <stop stopColor="#3b82f6" offset="1"></stop>
          </linearGradient>
          <linearGradient id="grad-c" gradientUnits="userSpaceOnUse" y2="0" x2="0" y1="64" x1="0">
            <stop stopColor="#60a5fa"></stop>
            <stop stopColor="#2563eb" offset="1"></stop>
            {loop && <animateTransform attributeName="gradientTransform" type="rotate" from="0 32 32" to="360 32 32" dur="3s" repeatCount="indefinite" />}
          </linearGradient>
          <linearGradient id="grad-d" gradientUnits="userSpaceOnUse" y2="2" x2="0" y1="62" x1="0">
            <stop stopColor="#06b6d4"></stop>
            <stop stopColor="#3b82f6" offset="1"></stop>
          </linearGradient>
        </defs>
      </svg>

      {/* Helper to render paths with conditional animation */}
      {["S", "Y", "N", "E", "R", "G", "Y2"].map((char, i) => {
        // Config for each letter path
        const paths: Record<string, { d: string; stroke: string }> = {
          S: { d: "M 46 14 C 46 4 18 4 18 20 C 18 38 46 36 46 48 C 46 60 18 60 18 50", stroke: "url(#grad-b)" },
          Y: { d: "M 12 12 L 32 36 L 52 12 M 32 36 V 60", stroke: "url(#grad-c)" },
          N: { d: "M 16 58 V 12 L 48 58 V 12", stroke: "url(#grad-d)" },
          E: { d: "M 50 12 H 16 V 58 H 50 M 16 35 H 42", stroke: "url(#grad-b)" },
          R: { d: "M 16 58 V 12 H 34 C 48 12 48 34 34 34 H 16 M 34 34 L 48 58", stroke: "url(#grad-c)" },
          G: { d: "M 48 20 A 22 22 0 1 0 54 32 H 32", stroke: "url(#grad-d)" },
          Y2: { d: "M 12 12 L 32 36 L 52 12 M 32 36 V 60", stroke: "url(#grad-b)" },
        };
        
        const { d, stroke } = paths[char];
        
        return (
          <svg key={char} viewBox="0 0 64 64" className="h-16 w-16 block" fill="none">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="8" stroke={stroke} d={d} className="dash" pathLength="360">
              {loop ? (
                // Loop Mode: Ping-pong animation with staggered starts
                <animate 
                  attributeName="stroke-dashoffset" 
                  values="360;0;360" 
                  keyTimes="0;0.5;1" 
                  dur="2s" 
                  begin={`${i * 0.1}s`} 
                  repeatCount="indefinite" 
                />
              ) : (
                // Intro Mode: Draw once and freeze (Original behavior)
                <animate 
                  attributeName="stroke-dashoffset" 
                  from="360" 
                  to="0" 
                  dur="3s" 
                  fill="freeze" 
                  calcMode="spline" 
                  keySplines="0.42 0 0.58 1" 
                />
              )}
            </path>
          </svg>
        );
      })}

      <style>{`
        .dash { stroke-dasharray: 360; stroke-dashoffset: 360; }
      `}</style>
    </div>
  );
}