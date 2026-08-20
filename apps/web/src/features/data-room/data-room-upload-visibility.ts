export interface UploadVisibilityInput {
  canManage: boolean;
  uploadsEnabled: boolean;
  nodeKind: string | undefined;
}

export function shouldShowUploadDropzone(input: UploadVisibilityInput): boolean {
  return input.canManage && input.uploadsEnabled && input.nodeKind === 'FOLDER';
}
