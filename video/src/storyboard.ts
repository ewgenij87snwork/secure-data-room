export type SceneAction =
  | 'folder-typing'
  | 'file-drop'
  | 'recipient-list'
  | 'recipient-folder'
  | 'recipient-viewer';

export interface BeatDefinition {
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

export type ChapterId =
  | 'login'
  | 'create-folder'
  | 'upload'
  | 'share'
  | 'recipient'
  | 'document';

export interface ChapterDefinition {
  id: ChapterId;
  title: string;
  compositionId: string;
  from: number;
  duration: number;
}

export const FPS = 30;
export const FULL_DURATION = 900;

export const CHAPTERS = [
  {
    id: 'login',
    title: 'Sign in',
    compositionId: 'SdrSceneLogin',
    from: 0,
    duration: 52,
  },
  {
    id: 'create-folder',
    title: 'Create folder',
    compositionId: 'SdrSceneCreateFolder',
    from: 52,
    duration: 130,
  },
  {
    id: 'upload',
    title: 'Upload PDFs',
    compositionId: 'SdrSceneUpload',
    from: 182,
    duration: 200,
  },
  {
    id: 'share',
    title: 'Share folder',
    compositionId: 'SdrSceneShare',
    from: 382,
    duration: 240,
  },
  {
    id: 'recipient',
    title: 'Recipient handoff',
    compositionId: 'SdrSceneRecipient',
    from: 622,
    duration: 190,
  },
  {
    id: 'document',
    title: 'Open document',
    compositionId: 'SdrSceneDocument',
    from: 812,
    duration: 88,
  },
] as const satisfies readonly ChapterDefinition[];

export const BEATS: readonly BeatDefinition[] = [
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

export function getChapter(id: string): (typeof CHAPTERS)[number] {
  const chapter = CHAPTERS.find((candidate) => candidate.id === id);

  if (!chapter) {
    throw new Error(
      `Unknown scene "${id}". Choose: ${CHAPTERS.map(({ id: chapterId }) => chapterId).join(', ')}.`,
    );
  }

  return chapter;
}
