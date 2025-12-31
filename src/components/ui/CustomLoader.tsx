'use client';
import React from 'react';
import './CustomLoader.css'; // Import the styles for our loader

// This component can be customized with a size prop
export function CustomLoader({ size = 0.25 }: { size?: number }) {
  // We pass the size to the CSS via a custom property
  const style = { '--size': size } as React.CSSProperties;

  return (
    <div className="loader" style={style}>
      <div className="box"></div>
      <svg>
        <defs>
          <clipPath id="clipping">
            <polygon points="50,5 95,25 95,75 50,95 5,75 5,25"></polygon>
            <polygon points="50,15 85,35 85,65 50,85 15,65 15,35"></polygon>
            <polygon points="50,25 75,45 75,55 50,75 25,55 25,45"></polygon>
            <polygon points="50,30 70,45 70,55 50,70 30,55 30,45"></polygon>
            <polygon points="50,35 65,45 65,55 50,65 35,55 35,45"></polygon>
            <polygon points="50,40 60,48 60,52 50,60 40,52 40,48"></polygon>
            <polygon points="50,45 55,48 55,52 50,55 45,52 45,48"></polygon>
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}