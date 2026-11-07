import React, { useState, useEffect } from 'react';
import { Settings as SettingsIcon, FolderCode, CheckCircle2, X } from 'lucide-react';
import { getConfigDirectoryHandle, saveConfigDirectoryHandle, verifyPermission, loadConfigFromFile } from '../utils/directoryHandler';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSyncComplete: (configData: any) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSyncComplete }) => {
    const [configDirName, setConfigDirName] = useState<string | null>(null);
    const [isSelecting, setIsSelecting] = useState(false);
    const [iframeError, setIframeError] = useState(false);

    useEffect(() => {
        if (isOpen) {
            checkCurrentHandle();
        }
    }, [isOpen]);

    const checkCurrentHandle = async () => {
        const handle = await getConfigDirectoryHandle();
        if (handle) {
            setConfigDirName(handle.name);
        }
    };

    const handleSelectFolder = async () => {
        if (!('showDirectoryPicker' in window)) {
            alert('Your browser does not support the File System Access API. Please use a modern browser.');
            return;
        }

        setIframeError(false);
        setIsSelecting(true);
        try {
            const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
            if (handle) {
                await saveConfigDirectoryHandle(handle);
                setConfigDirName(handle.name);

                // Option to load immediately
                const granted = await verifyPermission(handle, true);
                if (granted) {
                    const config = await loadConfigFromFile(handle);
                    if (config) {
                        onSyncComplete(config);
                    }
                }
            }
        } catch (e: any) {
            console.warn('Folder selection cancelled or failed', e);
            if (e && e.name === 'SecurityError') {
                setIframeError(true);
            } else if (e && e.name !== 'AbortError') {
                alert(`Folder selection failed: ${e.message || 'Unknown error'}`);
            }
        } finally {
            setIsSelecting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm anim-fade-in" />
            
            <div 
                className="relative w-full max-w-lg bg-gray-900/90 backdrop-blur-2xl border border-white/10 rounded-[24px] shadow-2xl overflow-hidden flex flex-col anim-zoom-in pointer-events-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="relative p-6 px-8 shrink-0 flex items-center justify-between border-b border-white/5 bg-white/5">
                    <div className="flex items-center gap-3 text-white">
                        <SettingsIcon className="w-5 h-5 text-gray-400" />
                        <h2 className="text-xl font-semibold tracking-tight">Settings</h2>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 -mr-2 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-8 flex flex-col gap-6 overflow-y-auto">
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1">
                            <h3 className="text-white font-medium text-lg">Configuration Sync Folder</h3>
                            <p className="text-white/50 text-sm leading-relaxed">
                                Choose a local directory to continuously sync your configuration and favorites. We will read and write an 'aura_config.json' file in this folder.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3">
                            <button
                                onClick={handleSelectFolder}
                                disabled={isSelecting}
                                className="group relative flex items-center justify-between w-full p-4 rounded-xl border border-dashed border-white/20 hover:border-blue-500/50 hover:bg-blue-500/10 transition-all text-left"
                            >
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 group-hover:text-blue-300 transition-all">
                                        <FolderCode size={20} />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-white font-medium">Select Folder</span>
                                        <span className="text-white/60 text-xs mt-0.5">
                                            {configDirName ? `Current: ${configDirName}` : 'No folder selected'}
                                        </span>
                                    </div>
                                </div>
                                {configDirName && (
                                    <CheckCircle2 className="text-blue-400 opacity-80" size={20} />
                                )}
                            </button>
                            
                            {iframeError && (
                                <div className="mt-2 p-4 rounded-xl bg-orange-500/10 border border-orange-500/20 flex flex-col gap-2">
                                    <h4 className="text-orange-400 text-sm font-medium">⚠️ Action Blocked in Preview</h4>
                                    <p className="text-orange-400/80 text-xs leading-relaxed">
                                        For security reasons, your browser prevents embedded pages (like this AI Studio preview) from requesting persistent folder access. 
                                    </p>
                                    <p className="text-orange-400 text-xs font-medium mt-1">
                                        To enable folder sync, please click the <strong>"Open in New Tab" (↗)</strong> button at the top right of this page and try again there.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                    
                    <div className="flex flex-col gap-4 border-t border-white/5 pt-6">
                        <div className="flex flex-col gap-1">
                            <h3 className="text-white font-medium text-lg">AI 情感标签缓存 (AI Mood Cache)</h3>
                            <p className="text-white/50 text-sm leading-relaxed">
                                清除已分析的歌曲情感缓存。当你更新了分析算法并希望重新分析收藏夹中的所有歌曲时，请点击此按钮。
                            </p>
                        </div>
                        <button
                            onClick={() => {
                                localStorage.removeItem('aura_mood_dictionary');
                                
                                // Set needsGeminiResolution array for favorites
                                const savedFavorites = localStorage.getItem('aura_favorites');
                                if (savedFavorites) {
                                    try {
                                        let favs = JSON.parse(savedFavorites);
                                        if (Array.isArray(favs)) {
                                            favs = favs.map(f => ({...f, needsGeminiResolution: true}));
                                            localStorage.setItem('aura_favorites', JSON.stringify(favs));
                                            window.dispatchEvent(new CustomEvent('favorites-updated'));
                                        }
                                    } catch(e) {}
                                }
                                
                                window.dispatchEvent(new CustomEvent('force-gemini-check'));
                                alert('清除成功，AI将会在后台开始重新分析歌曲');
                            }}
                            className="w-full py-3 px-4 rounded-xl font-medium text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500 hover:shadow-[0_0_20px_rgba(239,68,68,0.4)] border border-red-500/20 hover:border-red-500 transition-all"
                        >
                            重置 AI 情感缓存
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
