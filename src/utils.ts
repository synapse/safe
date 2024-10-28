import { exists } from '@std/fs';
import { basename } from '@std/path';
import { toKebabCase } from '@std/text';
import { encodeBase64 } from '@std/encoding';
import { crypto } from '@std/crypto/crypto';

import type { Payload } from './types.ts';

const isDirectory = async (path: string) => {
  const { isDirectory } = await Deno.stat(path);
  return isDirectory;
};

const genEncName = async (sourcePath: string) => {
  let name = '';
  if (await isDirectory(sourcePath)) {
    name = basename(sourcePath);
  } else {
  }

  return `${toKebabCase(name.toLowerCase())}.safe`;
};

const pathExists = async (path: string) => {
  if (!(await exists(path))) {
    throw new Error(`Destination path does not exist: ${path}`);
  }
};

function catchError<T>(
  promise: Promise<T>,
  customErrorMsg?: string
): Promise<void | T> {
  return promise
    .then((data) => {
      return data;
    })
    .catch((error) => {
      console.log(customErrorMsg ?? error.message);
      Deno.exit(5);
    });
}

async function setPayload(
  password: string,
  payload: Payload,
  safePath: string
): Promise<void> {
  await catchError(pathExists(safePath));
  const payloadString = JSON.stringify(payload);

  // open the file in write + append mode
  const file = await Deno.open(safePath, { write: true, append: true });

  // Create a TextEncoder to convert the string to Uint8Array
  const encoder = new TextEncoder();
  const payloadBytes = encoder.encode(payloadString);

  // encrypting the payload
  const encryptedPayload = await encryptData(payloadBytes, password);

  // compress the payload string
  const payloadCompressed = await compressData(encryptedPayload);
  const payloadSize = payloadCompressed.byteLength;
  const payloadSizeBuffer = new Int32Array([payloadSize]);

  // Write the JSON string to the file
  await catchError(file.write(payloadCompressed));
  // write the payload size to the end of the file
  await catchError(file.write(new Uint8Array(payloadSizeBuffer.buffer)));

  // Close the file
  file.close();
}

async function getPayload(
  password: string,
  safePath: string
): Promise<Payload> {
  const file = await Deno.open(safePath, { read: true });
  const { size } = await Deno.stat(safePath);

  // seek to the last 4 bytes of the file
  await file.seek(-4, Deno.SeekMode.End);

  const sizeBuffer = new Uint8Array(4);
  // read the payload size
  await file.read(sizeBuffer);

  const int32View = new Int32Array(sizeBuffer.buffer);
  const payloadSize = int32View[0];

  // seek from the start of the payload
  await file.seek(size - payloadSize - 4, Deno.SeekMode.Start);
  const payloadBuffer = new Uint8Array(payloadSize);
  await file.read(payloadBuffer);

  // close the file
  file.close();

  // decompress the payload
  let decompressedPayload;
  try {
    decompressedPayload = await decompressData(payloadBuffer);
  } catch (_e) {
    throw new Error('Unable to decompress payload');
  }

  // decrypted payload
  const decryptedPayload = await catchError(
    decryptData(decompressedPayload, password)
  );

  // decoding data from Uint8Array to string
  const decoder = new TextDecoder();
  const payloadString = decoder.decode(decryptedPayload as BufferSource);

  try {
    return JSON.parse(payloadString);
  } catch (_e) {
    throw new Error('Unable to parse payload');
  }
}

async function compressData(data: Uint8Array): Promise<Uint8Array> {
  const stream = new CompressionStream('deflate');

  const writer = stream.writable.getWriter();
  writer.write(data); // Write data to the compression stream
  writer.close(); // Close the stream when done writing

  // Collect the compressed output
  const compressedStream = stream.readable;
  const reader = compressedStream.getReader();

  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Combine all chunks into a single Uint8Array
  const compressedData = new Uint8Array(
    chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  );
  let offset = 0;
  for (const chunk of chunks) {
    compressedData.set(chunk, offset);
    offset += chunk.length;
  }

  return compressedData;
}

async function decompressData(data: Uint8Array): Promise<Uint8Array> {
  // Create a decompression stream using the deflate algorithm
  const stream = new DecompressionStream('deflate');

  // Get the writable stream and write the compressed data to it
  const writer = stream.writable.getWriter();
  writer.write(data); // Write compressed data
  writer.close(); // Close the stream when done writing

  // Get the readable stream to collect the decompressed output
  const decompressedStream = stream.readable;
  const reader = decompressedStream.getReader();

  // Collect the decompressed data chunks
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  // Combine all chunks into a single Uint8Array
  const decompressedData = new Uint8Array(
    chunks.reduce((acc, chunk) => acc + chunk.length, 0)
  );
  let offset = 0;
  for (const chunk of chunks) {
    decompressedData.set(chunk, offset);
    offset += chunk.length;
  }

  return decompressedData;
}

async function pbkdf2(
  message: string,
  salt: string,
  iterations: number,
  keyLen: number,
  algorithm: string
) {
  const msgBuffer = new TextEncoder().encode(message);
  const msgUint8Array = new Uint8Array(msgBuffer);
  const saltBuffer = new TextEncoder().encode(salt);
  const saltUint8Array = new Uint8Array(saltBuffer);

  const key = await crypto.subtle.importKey(
    'raw',
    msgUint8Array,
    {
      name: 'PBKDF2',
    },
    false,
    ['deriveBits']
  );

  const buffer = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltUint8Array,
      iterations,
      hash: algorithm,
    },
    key,
    keyLen * 8
  );

  return new Uint8Array(buffer);
}

function grindKey(password: string, difficulty: number) {
  return pbkdf2(
    password,
    password + password,
    Math.pow(2, difficulty),
    32,
    'SHA-256'
  );
}

function getIv(password: string, data: Uint8Array) {
  const randomData = encodeBase64(crypto.getRandomValues(new Uint8Array(12)));
  return pbkdf2(
    password + randomData,
    data + new Date().getTime().toString(),
    1,
    12,
    'SHA-256'
  );
}

async function encryptData(
  data: Uint8Array,
  password: string,
  difficulty = 10
) {
  const hashKey = await grindKey(password, difficulty);
  const iv = await getIv(password, data);

  const key = await crypto.subtle.importKey(
    'raw',
    hashKey,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );

  // No need to use TextEncoder here; data is already Uint8Array
  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      tagLength: 128,
    },
    key,
    data // Directly use the Uint8Array data
  );

  const result = Array.from(iv).concat(Array.from(new Uint8Array(encrypted)));
  return new Uint8Array(result);
}

async function decryptData(
  data: Uint8Array,
  password: string,
  difficulty = 10
) {
  const ciphertextBuffer = Array.from(data);
  const hashKey = await grindKey(password, difficulty);

  const key = await crypto.subtle.importKey(
    'raw',
    hashKey,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  let decrypted;
  try {
    decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(ciphertextBuffer.slice(0, 12)),
        tagLength: 128,
      },
      key,
      new Uint8Array(ciphertextBuffer.slice(12)) // Slice off the IV and pass the encrypted part
    );
  } catch (_e) {
    throw new Error('Decryption failed. Password missmatch.');
  }

  // Return the decrypted data as a Uint8Array, no need to decode it into text
  return new Uint8Array(decrypted);
}

async function createFolder(destination: string): Promise<string> {
  let finalDestination = destination;
  let increment = 1;

  // Check if folder exists, and increment the folder name if necessary
  while (await exists(finalDestination)) {
    finalDestination = `${destination}_${increment}`;
    increment++;
  }

  // Create the folder
  await Deno.mkdir(finalDestination, { recursive: true });

  return finalDestination;
}

export {
  catchError,
  compressData,
  createFolder,
  decompressData,
  decryptData,
  encryptData,
  genEncName,
  getPayload,
  isDirectory,
  pathExists,
  setPayload,
};
