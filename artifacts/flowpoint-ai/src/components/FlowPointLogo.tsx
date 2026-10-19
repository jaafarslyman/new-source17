import React from 'react';

interface FlowPointLogoProps {
  className?: string;
  alt?: string;
}

export default function FlowPointLogo({
  className = '',
  alt = 'FlowPoint AI',
}: FlowPointLogoProps) {
  return (
    <img
      src={`${import.meta.env.BASE_URL}flowpoint-logo.png`}
      alt={alt}
      className={`object-contain ${className}`}
    />
  );
}