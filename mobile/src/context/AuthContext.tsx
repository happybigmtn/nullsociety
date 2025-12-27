/**
 * Authentication Context
 * Provides auth state to the app and guards protected routes
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import { getBoolean, setBoolean, deleteKey, STORAGE_KEYS } from '../services/storage';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  authenticate: () => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user was previously authenticated this session
  useEffect(() => {
    const checkAuth = () => {
      try {
        // Check for existing session (could also verify biometrics haven't expired)
        const hasSession = getBoolean(STORAGE_KEYS.SESSION_ACTIVE, false);
        setIsAuthenticated(hasSession);
      } catch {
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };
    checkAuth();
  }, []);

  const authenticate = useCallback(() => {
    setBoolean(STORAGE_KEYS.SESSION_ACTIVE, true);
    setIsAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    deleteKey(STORAGE_KEYS.SESSION_ACTIVE);
    setIsAuthenticated(false);
  }, []);

  return (
    <AuthContext.Provider
      value={{ isAuthenticated, isLoading, authenticate, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
