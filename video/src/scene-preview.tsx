import { AbsoluteFill, Sequence, useCurrentFrame } from 'remotion';
import type { JSX } from 'react';
import { SdrHero } from './sdr-hero';
import { FPS, FULL_DURATION, getChapter } from './storyboard';
import type { ChapterId } from './storyboard';

export function TimelineSlice({ chapterId }: { chapterId: ChapterId }): JSX.Element {
  const chapter = getChapter(chapterId);

  return (
    <Sequence from={-chapter.from} durationInFrames={FULL_DURATION}>
      <SdrHero showProgress={false} />
    </Sequence>
  );
}

export function ReviewGuide({ chapterId }: { chapterId: ChapterId }): JSX.Element {
  const frame = useCurrentFrame();
  const chapter = getChapter(chapterId);
  const currentSeconds = (frame / FPS).toFixed(1);
  const totalSeconds = (chapter.duration / FPS).toFixed(1);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 20 }}>
      <div
        style={{
          position: 'absolute',
          inset: 32,
          border: '1px dashed rgba(96, 165, 250, 0.42)',
          borderRadius: 20,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 48,
          bottom: 42,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderRadius: 999,
          border: '1px solid rgba(148, 163, 184, 0.4)',
          background: 'rgba(12, 21, 38, 0.9)',
          color: '#F8FAFC',
          padding: '9px 14px',
          fontFamily: 'Manrope, Arial, sans-serif',
          fontSize: 13,
          fontWeight: 720,
          letterSpacing: 0.4,
          boxShadow: '0 10px 28px rgba(2, 8, 23, 0.25)',
        }}
      >
        <span style={{ color: '#60A5FA', textTransform: 'uppercase' }}>{chapter.id}</span>
        <span>{chapter.title}</span>
        <span style={{ color: '#94A3B8' }}>
          {currentSeconds}s / {totalSeconds}s
        </span>
      </div>
    </AbsoluteFill>
  );
}
