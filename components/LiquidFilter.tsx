import React, { useEffect, useState } from 'react';
import { createCapsuleLensMap, NAV_GLASS_DISPLACEMENT_SCALE } from '../services/liquidGlass';

type Lens = { width: number; height: number; url: string };
const FILTER_ID = 'ledger-nav-refraction';

export const LiquidFilter: React.FC<{ targetRef: React.RefObject<HTMLElement> }> = ({ targetRef }) => {
    const [lens, setLens] = useState<Lens | null>(null);

    useEffect(() => {
        const target = targetRef.current;
        // WebKit accepts SVG backdrop URLs but does not render their refraction.
        // Leave the transparent CSS material in place on those engines.
        const agent = navigator.userAgent;
        if (!target || !/(Chrome|Chromium|Edg|Electron)\//.test(agent) || /CriOS|EdgiOS|OPiOS/.test(agent)) return;
        let lastSize = '';
        const updateLens = () => {
            const rect = target.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return;
            const size = `${Math.ceil(rect.width)}:${Math.ceil(rect.height)}`;
            if (size === lastSize) return;
            try {
                const map = createCapsuleLensMap(rect.width, rect.height);
                const canvas = document.createElement('canvas');
                canvas.width = map.width;
                canvas.height = map.height;
                const context = canvas.getContext('2d');
                if (!context) return;
                context.putImageData(new ImageData(map.data, map.width, map.height), 0, 0);
                setLens({ width: map.width, height: map.height, url: canvas.toDataURL('image/png') });
                lastSize = size;
            } catch (error) {
                console.warn('Navigation refraction unavailable; retaining transparent surface', error);
            }
        };
        updateLens();
        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(updateLens);
            observer.observe(target);
            return () => observer.disconnect();
        }
        window.addEventListener('resize', updateLens);
        return () => window.removeEventListener('resize', updateLens);
    }, [targetRef]);

    useEffect(() => {
        const target = targetRef.current;
        if (!target || !lens) return;
        target.style.setProperty('--ledger-liquid-filter', `url("#${FILTER_ID}")`);
        target.dataset.refraction = 'ready';
        return () => {
            target.style.removeProperty('--ledger-liquid-filter');
            delete target.dataset.refraction;
        };
    }, [targetRef, lens]);

    return (
        <svg className="absolute w-0 h-0 overflow-hidden pointer-events-none" aria-hidden="true" focusable="false">
            <defs>
                {lens && (
                    <filter id={FILTER_ID} x="0" y="0" width={lens.width} height={lens.height}
                        filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                        <feImage href={lens.url} x="0" y="0" width={lens.width} height={lens.height}
                            preserveAspectRatio="none" result="capsule-lens" />
                        <feDisplacementMap in="SourceGraphic" in2="capsule-lens" scale={NAV_GLASS_DISPLACEMENT_SCALE}
                            xChannelSelector="R" yChannelSelector="G" />
                    </filter>
                )}
            </defs>
        </svg>
    );
};
