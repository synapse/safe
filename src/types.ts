export interface Payload {
  files: FileInfo[];
  totalSize: number;
  date: string;
}

export interface FileInfo {
  size: number;
  hash: string;
  path: string;
  chunks: number[];
}

export interface ProgressState {
  overallTotal: number;
  overallProgress: number;
  currentTotal: number;
  currentProgress: number;
  fileName: string;
}

export type ProgressFunction = (progress: ProgressState) => Promise<void>;
