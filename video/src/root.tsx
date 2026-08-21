import { Composition } from 'remotion';
import type { JSX } from 'react';
import { SdrHero } from './sdr-hero';
import {
  CreateFolderPreview,
  DocumentPreview,
  LoginPreview,
  RecipientPreview,
  SharePreview,
  UploadPreview,
} from './scenes/previews';

export function RemotionRoot(): JSX.Element {
  return (
    <>
      <Composition
        id="SdrHero"
        component={SdrHero}
        durationInFrames={900}
        fps={30}
        width={1440}
        height={1080}
      />
      <Composition
        id="SdrSceneLogin"
        component={LoginPreview}
        durationInFrames={52}
        fps={30}
        width={1440}
        height={1080}
      />
      <Composition
        id="SdrSceneCreateFolder"
        component={CreateFolderPreview}
        durationInFrames={130}
        fps={30}
        width={1440}
        height={1080}
      />
      <Composition
        id="SdrSceneUpload"
        component={UploadPreview}
        durationInFrames={200}
        fps={30}
        width={1440}
        height={1080}
      />
      <Composition
        id="SdrSceneShare"
        component={SharePreview}
        durationInFrames={240}
        fps={30}
        width={1440}
        height={1080}
      />
      <Composition
        id="SdrSceneRecipient"
        component={RecipientPreview}
        durationInFrames={190}
        fps={30}
        width={1440}
        height={1080}
      />
      <Composition
        id="SdrSceneDocument"
        component={DocumentPreview}
        durationInFrames={88}
        fps={30}
        width={1440}
        height={1080}
      />
    </>
  );
}
