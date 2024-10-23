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
