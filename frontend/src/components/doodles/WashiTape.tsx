import React from 'react';

interface WashiTapeProps {
  position?: 'top' | 'top-left' | 'top-right' | 'corner';
  variant?: 'sage' | 'amber' | 'paper';
  className?: string;
  style?: React.CSSProperties;
}

export const WashiTape: React.FC<WashiTapeProps> = ({
  position = 'top',
  variant = 'amber',
  className = '',
  style
}) => {
  const getColors = () => {
    switch (variant) {
      case 'sage':
        return { bg: 'rgba(145, 159, 138, 0.45)', border: 'rgba(117, 141, 115, 0.5)' };
      case 'paper':
        return { bg: 'rgba(214, 198, 167, 0.45)', border: 'rgba(184, 166, 132, 0.5)' };
      case 'amber':
      default:
        return { bg: 'rgba(227, 170, 95, 0.45)', border: 'rgba(200, 145, 70, 0.5)' };
    }
  };

  const colors = getColors();

  const getPositionStyles = (): React.CSSProperties => {
    switch (position) {
      case 'top-left':
        return {
          top: '-10px',
          left: '16px',
          transform: 'rotate(-4deg)',
        };
      case 'top-right':
        return {
          top: '-10px',
          right: '16px',
          transform: 'rotate(4deg)',
        };
      case 'corner':
        return {
          top: '-6px',
          right: '-12px',
          transform: 'rotate(35deg)',
        };
      case 'top':
      default:
        return {
          top: '-10px',
          left: '50%',
          transform: 'translateX(-50%) rotate(-1deg)',
        };
    }
  };

  return (
    <div
      className={`washi-tape-strip ${className}`}
      style={{
        position: 'absolute',
        width: '64px',
        height: '18px',
        backgroundColor: colors.bg,
        borderTop: `1px dashed ${colors.border}`,
        borderBottom: `1px dashed ${colors.border}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
        zIndex: 5,
        pointerEvents: 'none',
        ...getPositionStyles(),
        ...style,
      }}
    />
  );
};
