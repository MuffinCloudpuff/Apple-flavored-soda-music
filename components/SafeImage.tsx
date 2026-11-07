import React from 'react';

export interface SafeImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {}

/**
 * A wrapper around the standard <img> tag that prevents the image from being 
 * picked up, dragged, or saved via context menus. This is useful for UI elements
 * like album covers where accidental drags disrupt the user experience.
 */
export const SafeImage: React.FC<SafeImageProps> = ({ className = '', ...props }) => {
  return (
    <img
      {...props}
      draggable={false}
      onDragStart={(e) => {
        e.preventDefault();
        props.onDragStart?.(e);
      }}
      className={`select-none pointer-events-none [-webkit-user-drag:none] ${className}`}
    />
  );
};
