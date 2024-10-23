import { SHA256 } from "https://denopkg.com/chiefbiiko/sha256@v1.0.0/mod.ts";
import { walk } from "@std/fs";
import { basename, dirname, join, relative } from "@std/path";
import { CHUNK_SIZE } from "./constants.ts";
import type { FileInfo, Payload } from "./types.ts";
import {
    catchError,
    createFolder,
    decryptData,
    encryptData,
    genEncName,
    getPayload,
    pathExists,
    setPayload,
} from "./utils.ts";

async function encryptFile(
    source: string,
    destination: string,
    password: string,
) {
    const file = await Deno.open(source, { read: true });
    const buffer = new Uint8Array(CHUNK_SIZE);

    const writer = await Deno.open(destination, {
        write: true,
        create: true,
        append: true,
    });

    const fileInfo: FileInfo = {
        size: 0,
        path: "",
        hash: "",
        chunks: [],
    };

    const hasher = new SHA256();

    while (true) {
        await file.seek(fileInfo.size, Deno.SeekMode.Start);
        const bytesRead = await file.read(buffer);

        // end of file
        if (bytesRead === null) break;

        const chunk = buffer.subarray(0, bytesRead);
        const encryptedChunk = await encryptData(chunk, password);

        await writer.write(encryptedChunk);

        hasher.update(chunk);

        fileInfo.size += bytesRead;
        fileInfo.chunks.push(encryptedChunk.byteLength);
    }

    fileInfo.hash = hasher.digest("hex") as string;

    writer.close();
    file.close();

    return fileInfo;
}

async function encrypt(password: string, source: string, destination: string) {
    await catchError(pathExists(source));
    await catchError(pathExists(destination));

    const safeFileName = await genEncName(source);
    const destinationSafeFile = join(destination, safeFileName);

    const fileInfos: FileInfo[] = [];

    const paths = await Array.fromAsync(walk(source));
    for (const path of paths) {
        // just skip if the path is a directory
        if (path.isDirectory) continue;

        const fileInfo = await encryptFile(
            path.path,
            destinationSafeFile,
            password,
        );

        fileInfo.path = relative(source, path.path);
        fileInfos.push(fileInfo);
    }

    const payload: Payload = {
        files: fileInfos,
        totalSize: fileInfos.reduce(
            (totalSize, fileInfo) => totalSize + fileInfo.size,
            0,
        ),
        date: new Date().toJSON(),
    };

    await setPayload(password, payload, destinationSafeFile);
}

async function decrypt(password: string, source: string, destination: string) {
    await catchError(pathExists(source));

    // loading payload
    const { files } = await getPayload(password, source);

    // open source file for reading
    const sourceFile = await Deno.open(source, { read: true });

    // computing destination path
    const safeName = basename(source, ".safe");
    const destinationPath = join(destination, safeName);
    const destinationFolder = await createFolder(destinationPath);

    let cursor = 0;
    // for each encrypted file
    for (const file of files) {
        const filePath = join(destinationFolder, file.path);
        const fileDir = dirname(filePath);
        await Deno.mkdir(fileDir, { recursive: true });

        const fileWriter = await Deno.open(filePath, {
            write: true,
            create: true,
            append: true,
        });

        const hasher = new SHA256();

        for (const chunkSize of file.chunks) {
            // move the cursor in the encrypted file
            await sourceFile.seek(cursor, Deno.SeekMode.Start);

            // create a buffer and read the encrypted chunk
            const chunkBuffer = new Uint8Array(chunkSize);
            await sourceFile.read(chunkBuffer);

            // decrypt the chunked data
            const decryptedChunk = await decryptData(chunkBuffer, password);

            // update the hash
            hasher.update(decryptedChunk);

            // write it to the destination file
            fileWriter.write(decryptedChunk);
            cursor += chunkSize;
        }

        // get the decrypted files hash
        const fileHash = hasher.digest("hex") as string;

        // check if the decrypted file hash matches the original hash
        if (fileHash !== file.hash) {
            console.log("Hash missmatch for file", file.path);
        }

        fileWriter.close();
    }
}

export { decrypt, encrypt };
