import React from 'react';

export const LiquidFilter: React.FC = () => (
    <svg className="absolute w-0 h-0 overflow-hidden" aria-hidden="true">
        <defs>
            <filter id="liquid-glass" x="-20%" y="-20%" width="140%" height="140%" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
                <feTurbulence
                    type="turbulence"
                    baseFrequency="0.01 0.04"
                    numOctaves="3"
                    seed="2"
                    stitchTiles="noStitch"
                    result="turbulence"
                />
                <feDisplacementMap
                    in="SourceGraphic"
                    in2="turbulence"
                    scale="20"
                    xChannelSelector="R"
                    yChannelSelector="B"
                    result="displacement"
                />
                {/* Optional: Add specular lighting for extra "wet" look */}
                <feSpecularLighting
                    in="displacement"
                    surfaceScale="2"
                    specularConstant="0.75"
                    specularExponent="20"
                    lightingColor="#ffffff"
                    result="specular"
                >
                    <fePointLight x="100" y="-50" z="200" />
                </feSpecularLighting>
                <feComposite
                    in="specular"
                    in2="SourceAlpha"
                    operator="in"
                    result="specularComp"
                />
                <feComposite
                    in="SourceGraphic"
                    in2="specularComp"
                    operator="arithmetic"
                    k1="0" k2="1" k3="1" k4="0"
                    result="final"
                />
            </filter>
        </defs>
    </svg>
);
