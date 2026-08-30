import React from 'react';

interface DoodleProps extends React.SVGProps<SVGSVGElement> {
  color?: string;
  size?: number;
  className?: string;
}

export const CodeBracketDoodle: React.FC<DoodleProps> = ({ 
  color = 'var(--warm-accent)', 
  size = 28, 
  className = '', 
  style, 
  ...props 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 40 40" 
    fill="none" 
    stroke={color} 
    strokeWidth="2.2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ opacity: 0.75, ...style }}
    className={`doodle-accent ${className}`}
    {...props}
  >
    {/* Hand-drawn </> */}
    <path d="M14 12 L6 20 L14 28" />
    <path d="M26 12 L34 20 L26 28" />
    <path d="M23 10 L17 30" />
  </svg>
);

export const BracesDoodle: React.FC<DoodleProps> = ({ 
  color = 'var(--paper)', 
  size = 32, 
  className = '', 
  style, 
  ...props 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 50 40" 
    fill="none" 
    stroke={color} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ opacity: 0.7, ...style }}
    className={`doodle-accent ${className}`}
    {...props}
  >
    {/* Left brace */}
    <path d="M18 8 C12 8, 12 16, 12 20 C12 23, 8 20, 6 20 C8 20, 12 17, 12 20 C12 24, 12 32, 18 32" />
    {/* Right brace */}
    <path d="M32 8 C38 8, 38 16, 38 20 C38 23, 42 20, 44 20 C42 20, 38 17, 38 20 C38 24, 38 32, 32 32" />
  </svg>
);

export const SparkleDoodle: React.FC<DoodleProps> = ({ 
  color = 'var(--warm-accent)', 
  size = 24, 
  className = '', 
  style, 
  ...props 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 30 30" 
    fill="none" 
    stroke={color} 
    strokeWidth="2" 
    strokeLinecap="round"
    style={{ opacity: 0.8, ...style }}
    className={`doodle-accent ${className}`}
    {...props}
  >
    <path d="M15 4 C15 11, 15 11, 22 15 C15 19, 15 19, 15 26 C15 19, 15 19, 8 15 C15 11, 15 11, 15 4 Z" fill={color} fillOpacity="0.2" />
  </svg>
);

export const StarDoodle: React.FC<DoodleProps> = ({ 
  color = 'var(--warm-accent)', 
  size = 20, 
  className = '', 
  style, 
  ...props 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ opacity: 0.75, ...style }}
    className={`doodle-accent ${className}`}
    {...props}
  >
    <path d="M12 2 L14.5 8.5 L21.5 9.2 L16.2 13.8 L17.8 20.8 L12 17.2 L6.2 20.8 L7.8 13.8 L2.5 9.2 L9.5 8.5 Z" />
  </svg>
);

export const CurvedArrowDoodle: React.FC<DoodleProps & { direction?: 'right' | 'left' | 'down' }> = ({ 
  color = 'var(--sage)', 
  size = 36, 
  direction = 'right',
  className = '', 
  style, 
  ...props 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 50 40" 
    fill="none" 
    stroke={color} 
    strokeWidth="2.2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ 
      opacity: 0.75, 
      transform: direction === 'left' ? 'scaleX(-1)' : direction === 'down' ? 'rotate(90deg)' : 'none',
      ...style 
    }}
    className={`doodle-accent ${className}`}
    {...props}
  >
    <path d="M8 28 C 18 10, 32 12, 42 22" />
    <path d="M34 22 L 42 22 L 40 14" />
  </svg>
);

export const PencilDoodle: React.FC<DoodleProps> = ({ 
  color = 'var(--paper)', 
  size = 30, 
  className = '', 
  style, 
  ...props 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 40 40" 
    fill="none" 
    stroke={color} 
    strokeWidth="1.8" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ opacity: 0.7, ...style }}
    className={`doodle-accent ${className}`}
    {...props}
  >
    <path d="M10 30 L8 34 L12 32 Z" fill={color} fillOpacity="0.4" />
    <path d="M10 30 L28 12 C29 11, 31 11, 32 12 L34 14 C35 15, 35 17, 34 18 L16 36 Z" />
    <path d="M25 15 L29 19" />
  </svg>
);

export const CoffeeCupDoodle: React.FC<DoodleProps> = ({ 
  color = 'var(--warm-accent)', 
  size = 28, 
  className = '', 
  style, 
  ...props 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 40 40" 
    fill="none" 
    stroke={color} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ opacity: 0.75, ...style }}
    className={`doodle-accent ${className}`}
    {...props}
  >
    {/* Steam */}
    <path d="M14 8 Q16 4 14 2" strokeWidth="1.5" />
    <path d="M20 8 Q22 4 20 2" strokeWidth="1.5" />
    {/* Mug */}
    <path d="M8 12 L10 28 C10 31, 24 31, 24 28 L26 12 Z" fill={color} fillOpacity="0.1" />
    <path d="M26 15 C30 15, 31 22, 25 23" />
    <path d="M6 32 L28 32" strokeWidth="1.8" />
  </svg>
);

export const SquiggleUnderline: React.FC<DoodleProps & { width?: number }> = ({ 
  color = 'var(--warm-accent)', 
  width = 80, 
  className = '', 
  style, 
  ...props 
}) => (
  <svg 
    width={width} 
    height={12} 
    viewBox="0 0 100 12" 
    fill="none" 
    stroke={color} 
    strokeWidth="2.2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ opacity: 0.8, ...style }}
    className={`doodle-accent ${className}`}
    {...props}
  >
    <path d="M4 6 Q 16 1, 28 6 T 52 6 T 76 6 T 96 6" />
  </svg>
);

export const PushPinDoodle: React.FC<DoodleProps> = ({ 
  color = 'var(--warm-accent)', 
  size = 22, 
  className = '', 
  style, 
  ...props 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 30 30" 
    fill="none" 
    stroke={color} 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ opacity: 0.85, ...style }}
    className={`doodle-accent ${className}`}
    {...props}
  >
    <circle cx="15" cy="11" r="5" fill={color} fillOpacity="0.6" />
    <path d="M15 16 L15 26" strokeWidth="2.2" />
    <path d="M10 11 L20 11" strokeWidth="2.4" />
  </svg>
);

export const CheckDoodle: React.FC<DoodleProps> = ({ 
  color = 'var(--sage)', 
  size = 22, 
  className = '', 
  style, 
  ...props 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke={color} 
    strokeWidth="2.5" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ opacity: 0.85, ...style }}
    className={`doodle-accent ${className}`}
    {...props}
  >
    <path d="M4 13 L9 18 L20 6" />
  </svg>
);

export const PaperClipDoodle: React.FC<DoodleProps> = ({ 
  color = 'var(--paper)', 
  size = 26, 
  className = '', 
  style, 
  ...props 
}) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 32 32" 
    fill="none" 
    stroke={color} 
    strokeWidth="1.8" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    style={{ opacity: 0.75, ...style }}
    className={`doodle-accent ${className}`}
    {...props}
  >
    <path d="M10 16 L10 9 C10 5.5, 15.5 5.5, 15.5 9 L15.5 22 C15.5 26.5, 7.5 26.5, 7.5 22 L7.5 11 C7.5 8.5, 12 8.5, 12 11 L12 20" />
  </svg>
);
