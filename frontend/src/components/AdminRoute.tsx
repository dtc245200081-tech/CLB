import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SystemRole } from '../types';

export const AdminRoute: React.FC<{
  children: React.ReactElement;
  allowedRoles?: SystemRole[];
  allowTreasurer?: boolean;
}> = ({ children, allowedRoles = ['admin'], allowTreasurer = false }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div style={{ color: 'var(--text-secondary)' }}>Đang kiểm tra quyền...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If user is treasurer and route allows treasurer, grant access
  const isAuthorized = allowedRoles.includes(user.role) || (allowTreasurer && user.is_treasurer);

  if (!isAuthorized) {
    return <Navigate to="/profile" replace />;
  }

  return children;
};
