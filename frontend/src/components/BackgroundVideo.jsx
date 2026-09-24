import { useState } from 'react';

/**
 * Reusable background video component with subtle blur and ambient dark overlay.
 * Fits behind authentication screens (Login, 2FA, OTP verification, Select Organisation).
 *
 * @param {object} props
 * @param {string} [props.src="/videos/bg-video.mp4"] - Video source URL or path
 * @param {string} [props.blurAmount="blur-[3.5px]"] - Tailwind blur utility
 * @param {string} [props.overlayOpacity="bg-slate-950/70"] - Overlay background & opacity
 */
export default function BackgroundVideo({
  src = '/videos/bg-video.mp4',
  blurAmount = 'blur-[3.5px]',
  overlayOpacity = 'bg-slate-950/65',
}) {
  const [hasLoaded, setHasLoaded] = useState(false);

  return (
    <div className="fixed inset-0 w-full h-full overflow-hidden pointer-events-none -z-10">
      {/* Fallback ambient gradient while video buffers */}
      <div className="absolute inset-0 bg-[#070b16]" />

      {/* Video with subtle blur effect and slight scale to prevent edge-blur clipping */}
      <video
        autoPlay
        loop
        muted
        playsInline
        onLoadedData={() => setHasLoaded(true)}
        className={`absolute inset-0 w-full h-full object-cover transform scale-105 transition-opacity duration-1000 ${blurAmount} ${
          hasLoaded ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <source src={src} type="video/mp4" />
      </video>

      {/* Dark ambient overlay with slight purple/indigo glow tint for modern glassmorphism */}
      <div
        className={`absolute inset-0 ${overlayOpacity} backdrop-blur-[1.5px] transition-colors`}
        style={{
          backgroundImage:
            'radial-gradient(circle 800px at 50% -10%, rgba(79, 70, 229, 0.25), transparent 70%), radial-gradient(circle 600px at 90% 80%, rgba(6, 182, 212, 0.15), transparent 60%)',
        }}
      />
    </div>
  );
}
