import { AbsoluteFill, Interactive } from 'remotion';
import type { JSX } from 'react';
import { ReviewGuide, TimelineSlice } from '../scene-preview';

export function LoginPreview(): JSX.Element {
  return (
    <AbsoluteFill style={{ background: '#0C1526' }}>
      <Interactive.Div
        name="Login scene canvas"
        style={{ position: 'absolute', inset: 0, translate: '0px 0px', scale: 1 }}
      >
        <TimelineSlice chapterId="login" />
      </Interactive.Div>
      <ReviewGuide chapterId="login" />
    </AbsoluteFill>
  );
}

export function CreateFolderPreview(): JSX.Element {
  return (
    <AbsoluteFill style={{ background: '#0C1526' }}>
      <Interactive.Div
        name="Create folder scene canvas"
        style={{ position: 'absolute', inset: 0, translate: '0px 0px', scale: 1 }}
      >
        <TimelineSlice chapterId="create-folder" />
      </Interactive.Div>
      <ReviewGuide chapterId="create-folder" />
    </AbsoluteFill>
  );
}

export function UploadPreview(): JSX.Element {
  return (
    <AbsoluteFill style={{ background: '#0C1526' }}>
      <Interactive.Div
        name="Upload scene canvas"
        style={{ position: 'absolute', inset: 0, translate: '0px 0px', scale: 1 }}
      >
        <TimelineSlice chapterId="upload" />
      </Interactive.Div>
      <ReviewGuide chapterId="upload" />
    </AbsoluteFill>
  );
}

export function SharePreview(): JSX.Element {
  return (
    <AbsoluteFill style={{ background: '#0C1526' }}>
      <Interactive.Div
        name="Share scene canvas"
        style={{ position: 'absolute', inset: 0, translate: '0px 0px', scale: 1 }}
      >
        <TimelineSlice chapterId="share" />
      </Interactive.Div>
      <ReviewGuide chapterId="share" />
    </AbsoluteFill>
  );
}

export function RecipientPreview(): JSX.Element {
  return (
    <AbsoluteFill style={{ background: '#0C1526' }}>
      <Interactive.Div
        name="Recipient scene canvas"
        style={{ position: 'absolute', inset: 0, translate: '0px 0px', scale: 1 }}
      >
        <TimelineSlice chapterId="recipient" />
      </Interactive.Div>
      <ReviewGuide chapterId="recipient" />
    </AbsoluteFill>
  );
}

export function DocumentPreview(): JSX.Element {
  return (
    <AbsoluteFill style={{ background: '#0C1526' }}>
      <Interactive.Div
        name="Document scene canvas"
        style={{ position: 'absolute', inset: 0, translate: '0px 0px', scale: 1 }}
      >
        <TimelineSlice chapterId="document" />
      </Interactive.Div>
      <ReviewGuide chapterId="document" />
    </AbsoluteFill>
  );
}
