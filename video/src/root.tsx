import { Composition } from 'remotion';
import type { JSX } from 'react';
import { SdrHero } from './sdr-hero';

export function RemotionRoot(): JSX.Element {
  return (
    <Composition
      id="SdrHero"
      component={SdrHero}
      durationInFrames={900}
      fps={30}
      width={1440}
      height={1080}
    />
  );
}
