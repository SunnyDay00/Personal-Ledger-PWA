import React from 'react';
import * as Icons from 'lucide-react';

export interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: string;
  size?: string | number;
}

export const Icon: React.FC<IconProps> = ({ name, ...props }) => {
  const LucideIcon = (Icons as any)[name];
  if (!LucideIcon) return <Icons.HelpCircle {...props} />;
  return <LucideIcon {...props} />;
};