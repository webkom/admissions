import React from "react";

interface RequireAuthProps {
  auth: boolean;
  children: React.ReactElement;
}

const RequireAuth: React.FC<RequireAuthProps> = ({ auth, children }) => {
  return auth ? children : <p>Du har ikke tilgang til denne siden.</p>;
};

export default RequireAuth;
