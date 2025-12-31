import React from "react";

export default function TappingHand() {
  return (
    // Added '-translate-x-6' to push it to the left (~24px).
    // Adjust the number (2, 4, 6, 8, 10, 12, etc.) to move it more or less.
    <div className="relative w-[80px] h-[60px] mx-auto scale-75 mb-6 mt-2 origin-center translate-x-8">
      <div className="hand-container">
        <div className="palm" />
        <div className="thumb" />
        <div className="finger" />
        <div className="finger" />
        <div className="finger" />
        <div className="finger" />
      </div>
      
      <style>{`
        .hand-container {
          --skin-color: #E4C560;
          --tap-speed: 0.6s;
          --tap-stagger: 0.1s;
          position: relative;
          width: 80px;
          height: 60px;
        }

        /* Shadow */
        .hand-container:before {
          content: '';
          display: block;
          width: 180%;
          height: 75%;
          position: absolute;
          top: 70%;
          right: 20%;
          background-color: black;
          border-radius: 40px 10px;
          filter: blur(10px);
          opacity: 0.3;
        }

        .palm {
          display: block;
          width: 100%;
          height: 100%;
          position: absolute;
          top: 0;
          left: 0;
          background-color: var(--skin-color);
          border-radius: 10px 40px;
        }

        .thumb {
          position: absolute;
          width: 120%;
          height: 38px;
          background-color: var(--skin-color);
          bottom: -18%;
          right: 1%;
          transform-origin: calc(100% - 20px) 20px;
          transform: rotate(-20deg);
          border-radius: 30px 20px 20px 10px;
          border-bottom: 2px solid rgba(0, 0, 0, 0.1);
          border-left: 2px solid rgba(0, 0, 0, 0.1);
        }

        .thumb:after {
          width: 20%;
          height: 60%;
          content: '';
          background-color: rgba(255, 255, 255, 0.3);
          position: absolute;
          bottom: -8%;
          left: 5px;
          border-radius: 60% 10% 10% 30%;
          border-right: 2px solid rgba(0, 0, 0, 0.05);
        }

        .finger {
          position: absolute;
          width: 80%;
          height: 35px;
          background-color: var(--skin-color);
          bottom: 32%;
          right: 64%;
          transform-origin: 100% 20px;
          animation-duration: calc(var(--tap-speed) * 2);
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
          transform: rotate(10deg);
        }

        .finger:before {
          content: '';
          position: absolute;
          width: 140%;
          height: 30px;
          background-color: var(--skin-color);
          bottom: 8%;
          right: 65%;
          transform-origin: calc(100% - 20px) 20px;
          transform: rotate(-60deg);
          border-radius: 20px;
        }

        .finger:nth-child(3) { animation-delay: 0s; filter: brightness(70%); animation-name: tap-upper-1; z-index: 1; }
        .finger:nth-child(4) { animation-delay: var(--tap-stagger); filter: brightness(80%); animation-name: tap-upper-2; z-index: 2; }
        .finger:nth-child(5) { animation-delay: calc(var(--tap-stagger) * 2); filter: brightness(90%); animation-name: tap-upper-3; z-index: 3; }
        .finger:nth-child(6) { animation-delay: calc(var(--tap-stagger) * 3); filter: brightness(100%); animation-name: tap-upper-4; z-index: 4; }

        @keyframes tap-upper-1 { 0%, 50%, 100% { transform: rotate(10deg) scale(0.4); } 40% { transform: rotate(50deg) scale(0.4); } }
        @keyframes tap-upper-2 { 0%, 50%, 100% { transform: rotate(10deg) scale(0.6); } 40% { transform: rotate(50deg) scale(0.6); } }
        @keyframes tap-upper-3 { 0%, 50%, 100% { transform: rotate(10deg) scale(0.8); } 40% { transform: rotate(50deg) scale(0.8); } }
        @keyframes tap-upper-4 { 0%, 50%, 100% { transform: rotate(10deg) scale(1); } 40% { transform: rotate(50deg) scale(1); } }
      `}</style>
    </div>
  );
}