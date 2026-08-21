import { Composition } from 'remotion';
import type { JSX } from 'react';
import { SdrHero } from './sdr-hero';

export function RemotionRoot(): JSX.Element {
  return (
    <Composition
      id="SdrHero"
      component={SdrHero}
      durationInFrames={450}
      fps={30}
      width={1920}
      height={1080}
    />
  );
}
