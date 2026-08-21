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

type SceneAction =
  'folder-typing' | 'file-drop' | 'recipient-list' | 'recipient-folder' | 'recipient-viewer';

interface SceneDefinition {
  from: number;
  duration: number;
  image: string;
  label: string;
  address: string;
  account?: 'owner' | 'recipient';
  fit?: 'cover' | 'contain';
  position?: string;
  action?: SceneAction;
  pointer?: {
    from: readonly [number, number];
    to: readonly [number, number];
    clickAt: number;
  };
}

const scenes: SceneDefinition[] = [
  {
    from: 0,
    duration: 60,
    image: 'sign-in.jpg',
    label: '01 · VERIFIED SIGN-IN',
    address: 'secure-data-room-web.vercel.app/auth/sign-in',
    position: '61% center',
    pointer: { from: [1120, 760], to: [1025, 646], clickAt: 43 },
  },
  {
    from: 52,
    duration: 64,
    image: 'workspace-ready-4x3.png',
    label: '02 · CREATE A PRIVATE SCOPE',
    address: 'secure-data-room-web.vercel.app/workspace',
    account: 'owner',
    pointer: { from: [1080, 680], to: [886, 318], clickAt: 47 },
  },
  {
    from: 108,
    duration: 82,
    image: 'create-folder-empty-4x3.png',
    label: '03 · NAME THE FOLDER',
    address: 'secure-data-room-web.vercel.app/workspace',
    action: 'folder-typing',
    pointer: { from: [608, 594], to: [877, 674], clickAt: 69 },
  },
  {
    from: 182,
    duration: 74,
    image: 'docs-empty-wide.png',
    label: '04 · ADD TWO PDFS',
    address: 'secure-data-room-web.vercel.app/workspace/docs',
    account: 'owner',
    position: '52% center',
    action: 'file-drop',
  },
  {
    from: 248,
    duration: 90,
    image: 'uploading-progress-wide.png',
    label: '05 · WATCH EACH UPLOAD',
    address: 'secure-data-room-web.vercel.app/workspace/docs',
    account: 'owner',
    position: '100% center',
  },
  {
    from: 330,
    duration: 60,
    image: 'docs-uploaded-4x3.png',
    label: '06 · FILES ARE READY',
    address: 'secure-data-room-web.vercel.app/workspace/docs',
    account: 'owner',
  },
  {
    from: 382,
    duration: 62,
    image: 'docs-uploaded-4x3.png',
    label: '07 · SHARE THE EXACT FOLDER',
    address: 'secure-data-room-web.vercel.app/workspace/docs',
    account: 'owner',
    pointer: { from: [660, 660], to: [1008, 320], clickAt: 47 },
  },
  {
    from: 436,
    duration: 58,
    image: 'share-dialog-4x3.png',
    label: '08 · CHOOSE VERIFIED ACCESS',
    address: 'secure-data-room-web.vercel.app/workspace/docs',
    pointer: { from: [990, 520], to: [695, 616], clickAt: 43 },
  },
  {
    from: 486,
    duration: 64,
    image: 'share-email-4x3.png',
    label: '09 · GRANT VIEW-ONLY ACCESS',
    address: 'secure-data-room-web.vercel.app/workspace/docs',
    pointer: { from: [700, 615], to: [891, 616], clickAt: 48 },
  },
  {
    from: 542,
    duration: 88,
    image: 'share-confirmed-4x3.png',
    label: '10 · COPY THE INVITATION',
    address: 'secure-data-room-web.vercel.app/workspace/docs',
    pointer: { from: [925, 815], to: [820, 735], clickAt: 62 },
  },
  {
    from: 682,
    duration: 70,
    image: 'recipient-shared-list-4x3.png',
    label: '11 · RECIPIENT OPENS SHARED WITH ME',
    address: 'secure-data-room-web.vercel.app/shared',
    account: 'recipient',
    action: 'recipient-list',
    pointer: { from: [1160, 720], to: [1044, 354], clickAt: 54 },
  },
  {
    from: 744,
    duration: 76,
    image: 'recipient-folder-4x3.png',
    label: '12 · ONLY THE SHARED SCOPE IS VISIBLE',
    address: 'secure-data-room-web.vercel.app/shared/docs',
    account: 'recipient',
    action: 'recipient-folder',
    pointer: { from: [1050, 720], to: [485, 476], clickAt: 58 },
  },
  {
    from: 812,
    duration: 88,
    image: 'recipient-pdf-viewer-4x3.png',
    label: '13 · REVIEW INLINE OR DOWNLOAD',
    address: 'secure-data-room-web.vercel.app/files/pre-plan.pdf',
    account: 'recipient',
    action: 'recipient-viewer',
    pointer: { from: [1060, 720], to: [930, 155], clickAt: 66 },
  },
];

const APP_LEFT = 80;
const APP_TOP = 84;
const APP_WIDTH = 1280;
const APP_HEIGHT = 960;

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

function Pointer({ x, y, click }: { x: number; y: number; click: number }): JSX.Element {
  const pulse = interpolate(click, [0, 0.48, 1], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ position: 'absolute', left: x, top: y, zIndex: 9 }}>
      <div
        style={{
          position: 'absolute',
          left: -22,
          top: -22,
          width: 54,
          height: 54,
          borderRadius: 999,
          border: '4px solid rgba(37, 99, 235, 0.7)',
          opacity: pulse,
          transform: `scale(${0.7 + pulse * 0.65})`,
        }}
      />
      <svg width="36" height="44" viewBox="0 0 34 42" fill="none" aria-hidden="true">
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

function BrowserChrome({ address, label }: { address: string; label: string }): JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        left: APP_LEFT,
        top: 36,
        width: APP_WIDTH,
        height: 48,
        background: '#F8FAFC',
        borderBottom: '1px solid #D9E0EA',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '0 16px',
        boxSizing: 'border-box',
        zIndex: 7,
      }}
    >
      <div style={{ display: 'flex', gap: 7 }}>
        {['#F87171', '#FBBF24', '#34D399'].map((color) => (
          <span
            key={color}
            style={{ width: 11, height: 11, borderRadius: 99, background: color }}
          />
        ))}
      </div>
      <div
        style={{
          height: 30,
          flex: 1,
          maxWidth: 680,
          borderRadius: 9,
          background: '#EEF2F7',
          color: '#334155',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 12px',
          fontSize: 15,
          fontWeight: 620,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: '#0F766E' }}>●</span>
        <span>{address}</span>
      </div>
      <div
        style={{
          marginLeft: 'auto',
          borderRadius: 999,
          background: '#E8F0FF',
          color: '#1D4ED8',
          padding: '7px 13px',
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: 0.7,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function EmailMask({ account }: { account?: SceneDefinition['account'] }): JSX.Element | null {
  if (!account) return null;

  return (
    <div
      style={{
        position: 'absolute',
        right: 58,
        top: 0,
        width: 182,
        height: 58,
        background: '#FFFFFF',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        color: '#536174',
        fontSize: 13,
        fontWeight: 650,
        paddingRight: 10,
        boxSizing: 'border-box',
        zIndex: 5,
      }}
    >
      {account === 'owner' ? 'owner@example.com' : 'irene@example.com'}
    </div>
  );
}

function FolderTyping({ frame }: { frame: number }): JSX.Element {
  const count = Math.floor(
    interpolate(frame, [16, 50], [0, 4], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
  );
  const caret = Math.floor(frame / 8) % 2 === 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: 446,
        top: 489,
        width: 330,
        height: 42,
        display: 'flex',
        alignItems: 'center',
        background: '#FFFFFF',
        color: '#111827',
        fontSize: 17,
        paddingLeft: 10,
        zIndex: 6,
      }}
    >
      {'docs'.slice(0, count)}
      <span style={{ opacity: caret ? 1 : 0 }}>|</span>
    </div>
  );
}

function FileDrop({ frame }: { frame: number }): JSX.Element {
  const progress = clamp((frame - 12) / 45);
  const opacity = interpolate(progress, [0, 0.84, 1], [1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const files = [
    { name: 'pre-plan.pdf', start: [198, 812] as const, end: [520, 566] as const },
    { name: 'nda-manual.pdf', start: [402, 870] as const, end: [704, 566] as const },
  ];

  return (
    <>
      {files.map((file, index) => {
        const stagger = clamp((progress - index * 0.1) / 0.9);
        const x = interpolate(stagger, [0, 1], [file.start[0], file.end[0]]);
        const y = interpolate(stagger, [0, 1], [file.start[1], file.end[1]]);
        return (
          <div
            key={file.name}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: 190,
              borderRadius: 13,
              border: '1px solid #C9D6E8',
              background: '#FFFFFF',
              color: '#172033',
              boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '13px 15px',
              fontSize: 15,
              fontWeight: 720,
              opacity,
              transform: `rotate(${index === 0 ? -2.5 : 2.5}deg) scale(${1 - stagger * 0.08})`,
              zIndex: 8,
            }}
          >
            <span style={{ color: '#2563EB', fontSize: 22 }}>↥</span>
            {file.name}
          </div>
        );
      })}
    </>
  );
}

function FolderIcon(): JSX.Element {
  return (
    <span
      style={{
        width: 34,
        height: 34,
        border: '1px solid #CBD5E1',
        borderRadius: 9,
        display: 'grid',
        placeItems: 'center',
        color: '#2563EB',
        fontSize: 20,
      }}
    >
      ▱
    </span>
  );
}

function RecipientListOverlay(): JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        left: 244,
        top: 230,
        width: 734,
        height: 98,
        background: '#F8FAFC',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 18px',
        boxSizing: 'border-box',
        zIndex: 6,
      }}
    >
      <FolderIcon />
      <div>
        <div style={{ fontSize: 17, fontWeight: 780, color: '#111827' }}>docs</div>
        <div style={{ marginTop: 6, color: '#536174', fontSize: 13 }}>
          owner@example.com · View only
        </div>
      </div>
      <div style={{ marginLeft: 'auto', color: '#2563EB', fontSize: 24 }}>↗</div>
    </div>
  );
}

function DocumentRow({ name, top }: { name: string; top: number }): JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        left: 242,
        top,
        width: 742,
        height: 52,
        display: 'grid',
        gridTemplateColumns: '1fr 150px 90px 72px',
        alignItems: 'center',
        borderBottom: '1px solid #D7DEE8',
        background: '#F6F8FB',
        color: '#111827',
        fontSize: 14,
        zIndex: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 740 }}>
        <span style={{ color: '#536174', fontSize: 22 }}>▤</span>
        {name}
      </div>
      <span style={{ color: '#536174' }}>Aug 21, 2026</span>
      <span style={{ color: '#2563EB' }}>Shared</span>
      <span style={{ color: '#536174' }}>3.0 MB</span>
    </div>
  );
}

function RecipientFolderOverlay(): JSX.Element {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 238,
          top: 168,
          width: 760,
          height: 142,
          background: '#F6F8FB',
          zIndex: 5,
        }}
      >
        <div style={{ color: '#536174', fontSize: 13, fontWeight: 800, letterSpacing: 1.6 }}>
          SHARED FOLDER
        </div>
        <div style={{ marginTop: 6, color: '#111827', fontSize: 48, fontWeight: 760 }}>docs</div>
      </div>
      <DocumentRow name="pre-plan.pdf" top={310} />
      <DocumentRow name="nda-manual.pdf" top={362} />
    </>
  );
}

function RecipientViewerOverlay(): JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        left: 326,
        top: 44,
        width: 340,
        height: 62,
        background: '#FFFFFF',
        color: '#111827',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 14,
        fontSize: 17,
        fontWeight: 760,
        zIndex: 6,
      }}
    >
      pre-plan.pdf
    </div>
  );
}

function ActionOverlay({
  action,
  frame,
}: {
  action?: SceneAction;
  frame: number;
}): JSX.Element | null {
  if (action === 'folder-typing') return <FolderTyping frame={frame} />;
  if (action === 'file-drop') return <FileDrop frame={frame} />;
  if (action === 'recipient-list') return <RecipientListOverlay />;
  if (action === 'recipient-folder') return <RecipientFolderOverlay />;
  if (action === 'recipient-viewer') return <RecipientViewerOverlay />;
  return null;
}

function ProductScene({ scene }: { scene: SceneDefinition }): JSX.Element {
  const frame = useCurrentFrame();
  const progress = frame / Math.max(scene.duration - 1, 1);
  const opacity = interpolate(
    frame,
    [0, 8, Math.max(scene.duration - 9, 9), scene.duration - 1],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const imageScale = interpolate(progress, [0, 1], [1, 1.008], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const pointerProgress = scene.pointer
    ? clamp((frame - 8) / Math.max(scene.pointer.clickAt - 8, 1))
    : 0;
  const pointerX = scene.pointer
    ? interpolate(pointerProgress, [0, 1], [scene.pointer.from[0], scene.pointer.to[0]])
    : 0;
  const pointerY = scene.pointer
    ? interpolate(pointerProgress, [0, 1], [scene.pointer.from[1], scene.pointer.to[1]])
    : 0;
  const click = scene.pointer ? clamp((frame - scene.pointer.clickAt + 4) / 12) : 0;

  return (
    <AbsoluteFill style={{ opacity }}>
      <BrowserChrome address={scene.address} label={scene.label} />
      <div
        style={{
          position: 'absolute',
          left: APP_LEFT,
          top: APP_TOP,
          width: APP_WIDTH,
          height: APP_HEIGHT,
          overflow: 'hidden',
          background: '#F6F8FB',
        }}
      >
        <Img
          src={staticFile(`captures/${scene.image}`)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: scene.fit ?? 'cover',
            objectPosition: scene.position ?? 'center',
            transform: `scale(${imageScale})`,
          }}
        />
        <EmailMask account={scene.account} />
        <ActionOverlay action={scene.action} frame={frame} />
      </div>
      {scene.pointer ? <Pointer x={pointerX} y={pointerY} click={click} /> : null}
    </AbsoluteFill>
  );
}

function AddressHandoff(): JSX.Element {
  const frame = useCurrentFrame();
  const text = 'secure-data-room-web.vercel.app/shared';
  const count = Math.floor(
    interpolate(frame, [13, 50], [0, text.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );
  const enter = interpolate(frame, [49, 59, 68], [0, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const opacity = interpolate(frame, [0, 8, 60, 68], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ opacity, background: '#0C1526' }}>
      <div
        style={{
          position: 'absolute',
          inset: '116px 120px',
          borderRadius: 26,
          background: '#F8FAFC',
          border: '1px solid rgba(148, 163, 184, 0.4)',
          boxShadow: '0 38px 90px rgba(2, 8, 23, 0.44)',
        }}
      >
        <div
          style={{
            margin: '80px auto 0',
            width: 980,
            borderRadius: 18,
            border: '2px solid #B8C5D8',
            background: '#FFFFFF',
            padding: '22px 26px',
            color: '#111827',
            fontSize: 30,
            fontWeight: 650,
            boxShadow: `0 0 0 ${enter * 7}px rgba(37, 99, 235, 0.16)`,
          }}
        >
          <span style={{ color: '#0F766E', marginRight: 15 }}>●</span>
          {text.slice(0, count)}
          <span style={{ opacity: Math.floor(frame / 7) % 2 === 0 ? 1 : 0 }}>|</span>
        </div>
        <div style={{ margin: '138px auto 0', width: 820, textAlign: 'center' }}>
          <div style={{ color: '#2563EB', fontSize: 16, fontWeight: 850, letterSpacing: 2.4 }}>
            RECIPIENT HANDOFF
          </div>
          <div
            style={{
              marginTop: 20,
              color: '#111827',
              fontSize: 60,
              fontWeight: 760,
              letterSpacing: -2.6,
              lineHeight: 1.04,
            }}
          >
            The invitation opens the verified, read-only workspace.
          </div>
          <div style={{ marginTop: 24, color: '#536174', fontSize: 24 }}>irene@example.com</div>
        </div>
      </div>
    </AbsoluteFill>
  );
}

function ProgressRail(): JSX.Element {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const width = interpolate(frame, [0, durationInFrames - 1], [0, 1280], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        left: APP_LEFT,
        bottom: 17,
        width: APP_WIDTH,
        height: 4,
        borderRadius: 999,
        background: 'rgba(148, 163, 184, 0.25)',
        overflow: 'hidden',
      }}
    >
      <div style={{ width, height: '100%', background: '#3B82F6' }} />
    </div>
  );
}

export function SdrHero(): JSX.Element {
  return (
    <AbsoluteFill
      style={{
        background: '#0C1526',
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
          left: APP_LEFT,
          top: 36,
          width: APP_WIDTH,
          height: 1008,
          overflow: 'hidden',
          borderRadius: 25,
          background: '#F8FAFC',
          border: '1px solid rgba(148, 163, 184, 0.35)',
          boxShadow: '0 38px 92px rgba(2, 8, 23, 0.55)',
        }}
      />
      {scenes.map((scene) => (
        <Sequence
          key={`${scene.from}-${scene.image}`}
          from={scene.from}
          durationInFrames={scene.duration}
          premountFor={15}
        >
          <ProductScene scene={scene} />
        </Sequence>
      ))}
      <Sequence from={622} durationInFrames={68} premountFor={15}>
        <AddressHandoff />
      </Sequence>
      <ProgressRail />
    </AbsoluteFill>
  );
}
