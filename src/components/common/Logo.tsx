import React from 'react';
import logoSvg from '@frontend/assets/icons/LOGO_transparent.svg';

const Logo: React.FC = () => {
  return (
    <div className="logo-container">
      <img
        src={logoSvg}
        alt="4DNote Logo"
        className="logo-image"
      />
    </div>
  );
};

export default Logo;
