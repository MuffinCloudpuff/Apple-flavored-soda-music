import React, { useRef } from "react";
import { AuraLogo, SearchIcon, CloudDownloadIcon, FolderIcon } from "./Icons";
import { Settings as SettingsIcon } from "lucide-react";

interface TopBarProps {
  onFilesSelected: (files: FileList | File[]) => void;
  onDirectoryHandle?: (handle: FileSystemDirectoryHandle) => void;
  onSearchClick: () => void;
  onSettingsClick: () => void;
  disabled?: boolean;
}

const TopBar: React.FC<TopBarProps> = ({ onFilesSelected, onDirectoryHandle, onSearchClick, onSettingsClick, disabled }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFilesSelected(files);
    }
    e.target.value = "";
  };

  const handleFolderClick = async () => {
    folderInputRef.current?.click();
  };

  return (
    <div className="fixed top-0 left-0 w-full h-16 z-[60] group pointer-events-none">
      {/* Blur Background Layer (Animate in) */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-transparent pointer-events-none transition-opacity duration-500 opacity-0 group-hover:opacity-100"></div>

      {/* Content (Animate in) */}
      <div className="relative z-10 w-full h-full px-6 flex justify-between items-center pointer-events-auto">
        {/* Logo / Title */}
        <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 -translate-y-2 group-hover:translate-y-0 transition-all duration-500 ease-out">
          <div className="w-9 h-9 rounded-[10px] shadow-lg shadow-purple-500/20 overflow-hidden">
            <AuraLogo className="w-full h-full" />
          </div>
          <h1 className="text-white/90 font-bold tracking-wider text-sm uppercase hidden sm:block drop-shadow-md">
            Aura Music
          </h1>
        </div>

        {/* Actions (iOS 18 Style Glass Buttons) */}
        <div className="flex gap-3 opacity-0 group-hover:opacity-100 -translate-y-2 group-hover:translate-y-0 transition-all duration-500 ease-out delay-75">
            
           {/* Search Button */}
           <button
            onClick={onSearchClick}
            className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white/80 hover:bg-white/20 hover:text-white hover:scale-105 active:scale-95 transition-all shadow-sm"
            title="Search (Cmd+K)"
          >
            <SearchIcon className="w-5 h-5" />
          </button>

          {/* Import Folder Button */}
          <button
            onClick={handleFolderClick}
            disabled={disabled}
            className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white/80 hover:bg-white/20 hover:text-white hover:scale-105 active:scale-95 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title="Import Folder"
          >
            <FolderIcon className="w-5 h-5" />
          </button>

          {/* Import Files Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white/80 hover:bg-white/20 hover:text-white hover:scale-105 active:scale-95 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title="Import Local Files"
          >
            <CloudDownloadIcon className="w-5 h-5" />
          </button>
          
          {/* Settings Button */}
          <button
            onClick={onSettingsClick}
            disabled={disabled}
            className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-xl border border-white/10 flex items-center justify-center text-white/80 hover:bg-white/20 hover:text-white hover:scale-105 active:scale-95 transition-all shadow-sm"
            title="Settings"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
          
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="audio/*,.lrc,.txt"
            multiple
            className="hidden"
          />
          <input
            type="file"
            ref={folderInputRef}
            onChange={handleFileChange}
            {...({ webkitdirectory: "true", directory: "true" } as any)}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};

export default TopBar;