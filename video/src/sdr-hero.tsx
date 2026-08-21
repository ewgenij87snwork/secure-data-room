import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import type { JSX } from 'react';

type SceneDefinition = {
  from: number;
  duration: number;
  image: string;
  eyebrow: string;
  title: string;
  cursorFrom: readonly [number, number];
  cursorTo: readonly [number, number];
};

const scenes: SceneDefinition[] = [
  {
    from: 0,
    duration: 58,
    image: 'sign-in.jpg',
    eyebrow: 'VERIFIED ACCESS',
    title: 'Enter a private workspace.',
    cursorFrom: [1440, 760],
    cursorTo: [1390, 610],
  },
  {
    from: 50,
    duration: 74,
    image: 'create-folder.jpg',
    eyebrow: 'ORGANIZE',
    title: 'Create the exact scope you need.',
    cursorFrom: [1510, 360],
    cursorTo: [1315, 674],
  },
  {
    from: 116,
    duration: 100,
    image: 'uploading.jpg',
    eyebrow: 'UPLOAD',
    title: 'Two PDFs. Independent progress.',
    cursorFrom: [940, 570],
    cursorTo: [1650, 855],
  },
  {
    from: 208,
    duration: 76,
    image: 'uploaded.jpg',
    eyebrow: 'VISIBLE STATE',
    title: 'Every result stays explicit.',
    cursorFrom: [1030, 450],
    cursorTo: [1200, 435],
  },
  {
    from: 276,
    duration: 94,
    image: 'share-ready.jpg',
    eyebrow: 'READ-ONLY SHARING',
    title: 'Share only what the recipient needs.',
    cursorFrom: [1320, 445],
    cursorTo: [1225, 670],
  },
  {
    from: 362,
    duration: 88,
    image: 'pdf-viewer.jpg',
    eyebrow: 'REVIEW',
    title: 'Open inline—or download directly.',
    cursorFrom: [980, 600],
    cursorTo: [1580, 214],
  },
];

function Pointer({ x, y, progress }: { x: number; y: number; progress: number }): JSX.Element {
  const pulse = interpolate(progress, [0.58, 0.66, 0.76], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ position: 'absolute', left: x, top: y, zIndex: 4 }}>
      <div
        style={{
          position: 'absolute',
          left: -18,
          top: -18,
          width: 44,
          height: 44,
          borderRadius: 999,
          border: '3px solid rgba(22, 99, 238, 0.58)',
          opacity: pulse,
          transform: `scale(${0.68 + pulse * 0.56})`,
        }}
      />
      <svg width="34" height="42" viewBox="0 0 34 42" fill="none" aria-hidden="true">
        <path
          d="M3.5 2.5L29.5 25L17.6 27.2L11 38.5L3.5 2.5Z"
          fill="#FFFFFF"
          stroke="#111827"
          strokeWidth="2.7"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function ProductScene({ scene }: { scene: SceneDefinition }): JSX.Element {
  const frame = useCurrentFrame();
  const progress = frame / Math.max(scene.duration - 1, 1);
  const opacity = interpolate(
    frame,
    [0, 8, Math.max(scene.duration - 10, 9), scene.duration - 1],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const scale = interpolate(progress, [0, 1], [1.014, 1.035], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cursorX = interpolate(progress, [0.12, 0.72], [scene.cursorFrom[0], scene.cursorTo[0]], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cursorY = interpolate(progress, [0.12, 0.72], [scene.cursorFrom[1], scene.cursorTo[1]], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ opacity }}>
      <div
        style={{
          position: 'absolute',
          inset: '152px 76px 86px',
          overflow: 'hidden',
          borderRadius: 30,
          background: '#F8FAFC',
          border: '1px solid rgba(148, 163, 184, 0.3)',
          boxShadow: '0 42px 100px rgba(2, 8, 23, 0.42)',
        }}
      >
        <Img
          src={staticFile(`captures/${scene.image}`)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${scale})`,
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 104,
          top: 44,
          display: 'flex',
          alignItems: 'baseline',
          gap: 24,
        }}
      >
        <span style={{ color: '#60A5FA', fontSize: 22, fontWeight: 800, letterSpacing: 3.4 }}>
          {scene.eyebrow}
        </span>
        <span style={{ color: '#F8FAFC', fontSize: 42, fontWeight: 730, letterSpacing: -1.5 }}>
          {scene.title}
        </span>
      </div>
      <Pointer x={cursorX} y={cursorY} progress={progress} />
    </AbsoluteFill>
  );
}

function ProgressRail(): JSX.Element {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const width = interpolate(frame, [0, durationInFrames - 1], [0, 1712], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        left: 104,
        right: 104,
        bottom: 38,
        height: 4,
        borderRadius: 999,
        background: 'rgba(148, 163, 184, 0.2)',
        overflow: 'hidden',
      }}
    >
      <div style={{ width, height: '100%', background: '#2563EB' }} />
    </div>
  );
}

export function SdrHero(): JSX.Element {
  return (
    <AbsoluteFill
      style={{
        background: '#0B1220',
        fontFamily: 'Manrope, Arial, sans-serif',
        color: '#F8FAFC',
      }}
    >
      <style>{`@font-face{font-family:Manrope;src:url('${staticFile(
        'fonts/manrope-latin-variable.ttf',
      )}') format('truetype');font-style:normal;font-weight:200 800;font-display:block;}`}</style>
      <div
        style={{
          position: 'absolute',
          right: -220,
          top: -360,
          width: 900,
          height: 900,
          borderRadius: 999,
          background: 'rgba(37, 99, 235, 0.16)',
          filter: 'blur(120px)',
        }}
      />
      {scenes.map((scene) => (
        <Sequence
          key={scene.image}
          from={scene.from}
          durationInFrames={scene.duration}
          premountFor={15}
        >
          <ProductScene scene={scene} />
        </Sequence>
      ))}
      <ProgressRail />
    </AbsoluteFill>
  );
}
