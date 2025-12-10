
import React, { useEffect, useState } from 'react';
import { Icon } from './ui/Icon';
import { imageService } from '../services/imageService';

interface ImagePreviewProps {
    keys: string[];
    onClose: () => void;
}

export const ImagePreview: React.FC<ImagePreviewProps> = ({ keys, onClose }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [urls, setUrls] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        const loadImages = async () => {
            setLoading(true);
            try {
                const loadedUrls = await Promise.all(keys.map(async (key) => {
                    // Try fetch blob
                    try {
                        const blob = await imageService.fetchImageBlob(key);
                        return URL.createObjectURL(blob);
                    } catch (e) {
                        console.error("Failed to load image " + key, e);
                        return null;
                    }
                }));
                if (active) setUrls(loadedUrls.filter(u => u !== null) as string[]);
            } catch (e: any) {
                if (active) setError(e.message);
            } finally {
                if (active) setLoading(false);
            }
        };
        loadImages();
        return () => { active = false; };
    }, [keys]);

    const currentUrl = urls[currentIndex];

    return (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col animate-fade-in" onClick={onClose}>
            {/* Header */}
            <div className="flex justify-between items-center p-4 text-white z-10">
                <span className="text-sm font-medium">{currentIndex + 1} / {keys.length}</span>
                <button onClick={onClose} className="p-2 bg-white/10 rounded-full"><Icon name="X" className="w-5 h-5" /></button>
            </div>

            {/* Content */}
            <div className="flex-1 flex items-center justify-center p-4 relative w-full h-full">
                {loading ? (
                    <div className="text-white flex flex-col items-center">
                        <Icon name="Loader" className="w-8 h-8 animate-spin mb-2" />
                        <span className="text-sm">加载中...</span>
                    </div>
                ) : error ? (
                    <div className="text-red-400 text-sm">{error}</div>
                ) : currentUrl ? (
                    <img src={currentUrl} className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
                ) : (
                    <span className="text-white/50">图片加载失败</span>
                )}
            </div>

            {/* Footer / Navigation */}
            {urls.length > 1 && (
                <div className="p-8 flex justify-center gap-8 z-10" onClick={e => e.stopPropagation()}>
                    <button
                        onClick={() => setCurrentIndex(prev => (prev - 1 + urls.length) % urls.length)}
                        className="p-3 bg-white/10 rounded-full active:bg-white/30 text-white"
                    >
                        <Icon name="ChevronLeft" className="w-6 h-6" />
                    </button>
                    <button
                        onClick={() => setCurrentIndex(prev => (prev + 1) % urls.length)}
                        className="p-3 bg-white/10 rounded-full active:bg-white/30 text-white"
                    >
                        <Icon name="ChevronRight" className="w-6 h-6" />
                    </button>
                </div>
            )}
        </div>
    );
};
