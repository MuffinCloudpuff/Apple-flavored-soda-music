import { get, set } from 'idb-keyval';
import { Song } from '../types';

export const saveConfigDirectoryHandle = async (handle: FileSystemDirectoryHandle) => {
  await set('config_directory_handle', handle);
};

export const getConfigDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  try {
    const handle = await get('config_directory_handle');
    if (typeof FileSystemDirectoryHandle !== 'undefined' && handle instanceof FileSystemDirectoryHandle) {
      return handle;
    } else if (handle && handle.kind === 'directory') {
      return handle as FileSystemDirectoryHandle;
    }
  } catch (e) {
    console.error('Error reading config directory handle:', e);
  }
  return null;
};

export const verifyPermission = async (handle: any, readWrite = false) => {
  const options: any = {};
  if (readWrite) {
    options.mode = 'readwrite';
  }
  
  if ((await handle.queryPermission(options)) === 'granted') {
    return true;
  }
  if ((await handle.requestPermission(options)) === 'granted') {
    return true;
  }
  return false;
};

export const saveConfigToFile = async (handle: FileSystemDirectoryHandle, data: any) => {
  try {
    const fileHandle = await handle.getFileHandle('aura_config.json', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    return true;
  } catch (e) {
    console.error('Failed to write config file', e);
    return false;
  }
};

export const loadConfigFromFile = async (handle: FileSystemDirectoryHandle): Promise<any | null> => {
  try {
    const fileHandle = await handle.getFileHandle('aura_config.json');
    const file = await fileHandle.getFile();
    const contents = await file.text();
    return JSON.parse(contents);
  } catch (e) {
    // File might not exist
    return null;
  }
};

export const getFilesFromDirectory = async (dirHandle: FileSystemDirectoryHandle): Promise<File[]> => {
  const files: File[] = [];
  
  async function traverse(handle: FileSystemDirectoryHandle) {
    for await (const entry of (handle as any).values()) {
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        if (file.name.match(/\.(mp3|flac|wav|m4a|ogg|aac|lrc|txt)$/i)) {
          files.push(file);
        }
      } else if (entry.kind === 'directory') {
        await traverse(entry);
      }
    }
  }

  await traverse(dirHandle);
  return files;
};
